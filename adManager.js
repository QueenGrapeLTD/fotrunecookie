import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  AdMob,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  RewardAdPluginEvents,
} from "@capacitor-community/admob";
import {
  auth,
  ensureFreemiumSession,
  getAdRewardStateFromServer,
} from "./firebaseService.js";

const TEST_REWARDED_IDS = {
  android: "ca-app-pub-3940256099942544/5224354917",
  ios: "ca-app-pub-3940256099942544/1712485313",
};
const TEST_BANNER_IDS = {
  android: "ca-app-pub-3940256099942544/6300978111",
  ios: "ca-app-pub-3940256099942544/2934735716",
};
const TEST_APP_OPEN_IDS = {
  android: "ca-app-pub-3940256099942544/9257395921",
  ios: "ca-app-pub-3940256099942544/5575463023",
};
const AppOpenAd = registerPlugin("AppOpenAd");
const AD_STATE_CACHE_MS = 5 * 60 * 1000;
const DEFAULT_DAILY_AD_LIMIT = 3;
const AD_INIT_TIMEOUT_MS = 6000;
const AD_SESSION_TIMEOUT_MS = 8000;
const AD_STATE_TIMEOUT_MS = 8000;
const AD_LOAD_TIMEOUT_MS = 15000;
const AD_PRESENT_TIMEOUT_MS = 8000;
const AD_REWARD_TIMEOUT_MS = 3 * 60 * 1000;

function createAdError(code, cause) {
  const error = new Error(cause?.message || code);
  error.code = code;
  error.cause = cause;
  return error;
}

function isNoFillError(error) {
  return /no ad to show|no fill/i.test(
    `${error?.message || ""} ${error?.cause?.message || ""}`,
  );
}

async function runAdOperation(operation, timeoutMs, errorCode) {
  let timeoutId;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(createAdError(errorCode)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

class AdManager {
  constructor() {
    this.ready = false;
    this.rewarded = false;
    this.shown = false;
    this.loaded = false;
    this.listenersReady = false;
    this.listenerHandles = [];
    this.lastFailure = null;
    this.initPromise = null;
    this.privacyPromise = null;
    this.requestNonPersonalizedAds = false;
    this.pendingShowResolve = null;
    this.pendingShowReject = null;
    this.pendingRewardResolve = null;
    this.pendingRewardReject = null;
    this.refreshPromise = null;
    this.lastRefreshAt = 0;
    this.stateOwnerUid = "";
    this.bannerVisible = false;
    this.bannerPromise = null;
    this.appOpenShownThisLaunch = false;
    this.appOpenPromise = null;
    this.state = {
      credits: 0,
      rewardedToday: 0,
      dailyLimit: DEFAULT_DAILY_AD_LIMIT,
      adsPerCredit: 1,
    };
  }

  isTestMode() {
    return import.meta.env.DEV ||
      import.meta.env.VITE_ADMOB_TEST_MODE === "true";
  }

  getRewardedAdId() {
    const platform = Capacitor.getPlatform();
    if (this.isTestMode()) return TEST_REWARDED_IDS[platform] || "";
    return platform === "ios"
      ? import.meta.env.VITE_ADMOB_IOS_REWARDED_AD_UNIT_ID || ""
      : import.meta.env.VITE_ADMOB_ANDROID_REWARDED_AD_UNIT_ID || "";
  }

  async registerRewardListeners() {
    if (this.listenersReady) return;
    this.listenerHandles = await Promise.all([
      AdMob.addListener(RewardAdPluginEvents.Loaded, () => {
        this.loaded = true;
        this.lastFailure = null;
      }),
      AdMob.addListener(RewardAdPluginEvents.Rewarded, (reward) => {
        this.rewarded = true;
        this.pendingRewardResolve?.(reward);
      }),
      AdMob.addListener(RewardAdPluginEvents.Showed, () => {
        this.shown = true;
        this.pendingShowResolve?.();
      }),
      AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (error) => {
        this.loaded = false;
        this.lastFailure = createAdError(
          "admob/rewarded-load-failed",
          error,
        );
        console.warn(
          "Rewarded ad SDK load failure:",
          error?.code,
          error?.message,
        );
      }),
      AdMob.addListener(RewardAdPluginEvents.FailedToShow, (error) => {
        const failure = createAdError("admob/rewarded-show-failed", error);
        this.loaded = false;
        this.lastFailure = failure;
        this.pendingShowReject?.(failure);
        this.pendingRewardReject?.(failure);
      }),
      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        this.loaded = false;
        if (!this.rewarded) {
          this.pendingRewardReject?.(
            createAdError("admob/rewarded-dismissed-without-reward"),
          );
        }
      }),
    ]);
    this.listenersReady = true;
  }

  async registerBannerListeners() {
    this.listenerHandles.push(
      await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => {
        const height = Math.max(Number(size?.height) || 0, 50);
        document.documentElement.style.setProperty(
          "--native-ad-banner-height",
          `${height}px`,
        );
      }),
      await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (error) => {
        this.bannerVisible = false;
        this.lastFailure = error;
        document.documentElement.classList.remove("native-ad-banner-visible");
      }),
    );
  }

  async init() {
    if (
      !Capacitor.isNativePlatform() ||
      !this.hasConfiguredAdUnit() ||
      this.ready
    ) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      try {
        await this.registerRewardListeners();
        await this.registerBannerListeners();
        await runAdOperation(
          AdMob.initialize({
            initializeForTesting: this.isTestMode(),
            tagForChildDirectedTreatment: false,
            tagForUnderAgeOfConsent: false,
          }),
          AD_INIT_TIMEOUT_MS,
          "admob/initialize-timeout",
        );
        this.ready = true;
        this.privacyPromise ||= this.preparePrivacySettings();
      } catch (error) {
        this.lastFailure = error;
        console.warn("AdMob initialization failed:", error?.message);
      } finally {
        if (!this.ready) this.initPromise = null;
      }
    })();
    return this.initPromise;
  }

  async preparePrivacySettings() {
    try {
      if (Capacitor.getPlatform() === "ios") {
        const tracking = await runAdOperation(
          AdMob.trackingAuthorizationStatus(),
          AD_INIT_TIMEOUT_MS,
          "admob/tracking-status-timeout",
        ).catch(() => null);
        if (tracking?.status === "notDetermined") {
          await runAdOperation(
            AdMob.requestTrackingAuthorization(),
            60000,
            "admob/tracking-authorization-timeout",
          ).catch(() => null);
        }
      }

      const consent = await runAdOperation(
        AdMob.requestConsentInfo(),
        AD_LOAD_TIMEOUT_MS,
        "admob/consent-info-timeout",
      );
      this.requestNonPersonalizedAds = consent?.canRequestAds === false;
      if (consent?.isConsentFormAvailable && consent?.status === "REQUIRED") {
        const result = await runAdOperation(
          AdMob.showConsentForm(),
          60000,
          "admob/consent-form-timeout",
        );
        this.requestNonPersonalizedAds = result?.canRequestAds === false;
      }
    } catch (error) {
      // A privacy-network failure must not leave the button pending forever.
      // Request a non-personalized ad and let the Mobile Ads SDK enforce the
      // device's current UMP eligibility.
      this.requestNonPersonalizedAds = true;
      this.lastFailure = error;
      console.warn("Ad privacy preparation failed:", error?.code || error?.message);
    }
  }

  isAvailable() {
    return Capacitor.isNativePlatform() && Boolean(this.getRewardedAdId());
  }

  async showBannerForFreeUser() {
    if (!Capacitor.isNativePlatform() || !this.getBannerAdId()) return false;
    if (this.bannerVisible) return true;
    if (this.bannerPromise) return this.bannerPromise;

    this.bannerPromise = (async () => {
      await this.init();
      if (!this.ready) return false;
      await runAdOperation(
        this.privacyPromise,
        65000,
        "admob/privacy-timeout",
      );
      await AdMob.showBanner({
        adId: this.getBannerAdId(),
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 0,
        isTesting: this.isTestMode(),
      });
      this.bannerVisible = true;
      document.documentElement.classList.add("native-ad-banner-visible");
      return true;
    })()
      .catch((error) => {
        this.lastFailure = error;
        this.bannerVisible = false;
        document.documentElement.classList.remove("native-ad-banner-visible");
        console.warn("Banner ad failed:", error?.message);
        return false;
      })
      .finally(() => {
        this.bannerPromise = null;
      });
    return this.bannerPromise;
  }

  async hideBanner() {
    document.documentElement.classList.remove("native-ad-banner-visible");
    if (!Capacitor.isNativePlatform() || !this.bannerVisible) return;
    this.bannerVisible = false;
    await AdMob.removeBanner().catch(() => null);
  }

  async showAppOpenForFreeUser() {
    if (
      !Capacitor.isNativePlatform() ||
      !this.getAppOpenAdId() ||
      this.appOpenShownThisLaunch
    ) {
      return false;
    }
    if (this.appOpenPromise) return this.appOpenPromise;

    // Reserve this launch before loading. A no-fill response must not trigger
    // another request every time account state refreshes.
    this.appOpenShownThisLaunch = true;
    this.appOpenPromise = (async () => {
      await this.init();
      if (!this.ready) return false;
      await runAdOperation(
        this.privacyPromise,
        65000,
        "admob/privacy-timeout",
      );
      await AppOpenAd.prepare({
        adId: this.getAppOpenAdId(),
        isTesting: this.isTestMode(),
      });
      await AppOpenAd.show();
      return true;
    })()
      .catch((error) => {
        this.lastFailure = error;
        console.warn("App open ad unavailable:", error?.message);
        return false;
      })
      .finally(() => {
        this.appOpenPromise = null;
      });
    return this.appOpenPromise;
  }

  async syncDisplayAds({ isPremium = false } = {}) {
    if (!Capacitor.isNativePlatform()) return;
    if (isPremium) {
      await this.hideBanner();
      return;
    }
    await this.showBannerForFreeUser();
    void this.showAppOpenForFreeUser();
  }

  async refresh(force = false) {
    if (!auth.currentUser) {
      this.stateOwnerUid = "";
      this.state = {
        credits: 0,
        rewardedToday: 0,
        dailyLimit: DEFAULT_DAILY_AD_LIMIT,
        adsPerCredit: 1,
      };
      this.lastRefreshAt = Date.now();
      return this.state;
    }
    const uid = auth.currentUser.uid;
    if (this.stateOwnerUid !== uid) {
      this.stateOwnerUid = uid;
      this.lastRefreshAt = 0;
      this.state = {
        credits: 0,
        rewardedToday: 0,
        dailyLimit: DEFAULT_DAILY_AD_LIMIT,
        adsPerCredit: 1,
      };
    }
    if (!force && Date.now() - this.lastRefreshAt < AD_STATE_CACHE_MS) {
      return this.state;
    }
    if (this.refreshPromise?.uid === uid) return this.refreshPromise.promise;
    const refreshPromise = (async () => {
      try {
        const nextState = await runAdOperation(
          getAdRewardStateFromServer(),
          AD_STATE_TIMEOUT_MS,
          "admob/reward-state-timeout",
        );
        if (auth.currentUser?.uid === uid && this.stateOwnerUid === uid) {
          this.state = nextState;
          this.lastRefreshAt = Date.now();
        }
      } catch (error) {
        console.warn("Ad reward state unavailable:", error?.code);
      }
      return this.state;
    })().finally(() => {
      if (this.refreshPromise?.promise === refreshPromise) {
        this.refreshPromise = null;
      }
    });
    this.refreshPromise = { uid, promise: refreshPromise };
    return refreshPromise;
  }

  getPremiumQueries() {
    return Math.max(Number(this.state.credits) || 0, 0);
  }

  getAdProgress() {
    const watchedToday = Math.max(Number(this.state.rewardedToday) || 0, 0);
    const dailyLimit = Math.max(
      Number(this.state.dailyLimit) || DEFAULT_DAILY_AD_LIMIT,
      1,
    );
    const adsPerCredit = Math.max(Number(this.state.adsPerCredit) || 1, 1);
    const canEarnMore = watchedToday < dailyLimit;
    return {
      current: canEarnMore
        ? watchedToday % adsPerCredit
        : adsPerCredit,
      required: adsPerCredit,
      watchedToday,
      dailyLimit,
      canEarnMore,
    };
  }

  getBannerAdId() {
    const platform = Capacitor.getPlatform();
    if (this.isTestMode()) return TEST_BANNER_IDS[platform] || "";
    return platform === "ios"
      ? import.meta.env.VITE_ADMOB_IOS_BANNER_AD_UNIT_ID || ""
      : import.meta.env.VITE_ADMOB_ANDROID_BANNER_AD_UNIT_ID || "";
  }

  getAppOpenAdId() {
    const platform = Capacitor.getPlatform();
    if (this.isTestMode()) return TEST_APP_OPEN_IDS[platform] || "";
    return platform === "ios"
      ? import.meta.env.VITE_ADMOB_IOS_APP_OPEN_AD_UNIT_ID || ""
      : import.meta.env.VITE_ADMOB_ANDROID_APP_OPEN_AD_UNIT_ID || "";
  }

  hasConfiguredAdUnit() {
    return Boolean(
      this.getRewardedAdId() ||
        this.getBannerAdId() ||
        this.getAppOpenAdId(),
    );
  }

  async consumePremiumQuery() {
    await this.refresh(true);
    return this.getPremiumQueries() > 0;
  }

  async prepareRewardedAd(uid) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        this.loaded = false;
        this.lastFailure = null;
        await runAdOperation(
          AdMob.prepareRewardVideoAd({
            adId: this.getRewardedAdId(),
            isTesting: this.isTestMode(),
            npa: this.requestNonPersonalizedAds,
            ssv: { userId: uid },
          }),
          AD_LOAD_TIMEOUT_MS,
          "admob/rewarded-load-timeout",
        );
        this.loaded = true;
        return;
      } catch (error) {
        lastError = this.lastFailure || error;
        this.lastFailure = lastError;
        if (attempt === 0 && !isNoFillError(lastError)) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        } else {
          break;
        }
      }
    }
    throw lastError || new Error("admob/rewarded-load-failed");
  }

  async waitForVerifiedReward(previousCredits, previousRewardedToday) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await this.refresh(true);
      const creditGranted = this.getPremiumQueries() > previousCredits;
      const adVerified =
        Math.max(Number(this.state.rewardedToday) || 0, 0) >
        previousRewardedToday;
      if (adVerified || creditGranted) {
        return { verified: true, creditGranted, pending: false };
      }
    }
    return { verified: false, creditGranted: false, pending: true };
  }

  async showRewardedAdModal(onAdCompleted) {
    if (!this.isAvailable()) {
      const result = { verified: false, creditGranted: false };
      if (onAdCompleted) onAdCompleted(result);
      return result;
    }

    this.rewarded = false;
    this.shown = false;
    try {
      await runAdOperation(
        this.init(),
        AD_INIT_TIMEOUT_MS,
        "admob/initialize-timeout",
      );
      await runAdOperation(
        ensureFreemiumSession(),
        AD_SESSION_TIMEOUT_MS,
        "admob/session-timeout",
      );
      if (!this.ready || !auth.currentUser) {
        throw createAdError("admob/session-unavailable");
      }
      await runAdOperation(
        this.privacyPromise,
        65000,
        "admob/privacy-timeout",
      );
      const uid = auth.currentUser.uid;
      await this.refresh(true);
      const previousCredits = this.getPremiumQueries();
      const previousRewardedToday = Math.max(
        Number(this.state.rewardedToday) || 0,
        0,
      );
      await this.prepareRewardedAd(uid);
      const showStarted = new Promise((resolve, reject) => {
        this.pendingShowResolve = resolve;
        this.pendingShowReject = reject;
      });
      const rewardEvent = new Promise((resolve, reject) => {
        this.pendingRewardResolve = resolve;
        this.pendingRewardReject = reject;
      });
      void rewardEvent.catch(() => {});
      const showCall = Promise.resolve().then(() => AdMob.showRewardVideoAd());
      void showCall.catch((error) => {
        const failure = createAdError("admob/rewarded-show-failed", error);
        this.pendingShowReject?.(failure);
        this.pendingRewardReject?.(failure);
      });
      await runAdOperation(
        Promise.race([showStarted, showCall]),
        AD_PRESENT_TIMEOUT_MS,
        "admob/rewarded-presentation-timeout",
      );
      const rewardItem = await runAdOperation(
        Promise.race([showCall, rewardEvent]),
        AD_REWARD_TIMEOUT_MS,
        "admob/rewarded-completion-timeout",
      );
      this.loaded = false;
      const sdkConfirmedReward =
        this.rewarded || Math.max(Number(rewardItem?.amount) || 0, 0) > 0;
      if (!sdkConfirmedReward) {
        const result = { verified: false, creditGranted: false };
        if (onAdCompleted) onAdCompleted(result);
        return result;
      }

      // Production rewards are granted only after AdMob's verified SSV callback.
      const result = await this.waitForVerifiedReward(
        previousCredits,
        previousRewardedToday,
      );
      if (onAdCompleted) onAdCompleted(result);
      return result;
    } catch (error) {
      this.lastFailure = error;
      console.warn(
        "Rewarded ad failed:",
        error?.code,
        error?.message,
        error?.cause?.code,
        error?.cause?.message,
      );
      const result = {
        verified: false,
        creditGranted: false,
        pending: false,
        errorCode: isNoFillError(error)
          ? "admob/no-fill"
          : error?.code || error?.message || "admob/rewarded-failed",
      };
      if (onAdCompleted) onAdCompleted(result);
      return result;
    } finally {
      this.pendingShowResolve = null;
      this.pendingShowReject = null;
      this.pendingRewardResolve = null;
      this.pendingRewardReject = null;
    }
  }
}

export const adManager = new AdManager();
