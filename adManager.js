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
const DEFAULT_DAILY_AD_LIMIT = 9;

class AdManager {
  constructor() {
    this.ready = false;
    this.rewarded = false;
    this.loaded = false;
    this.listenersReady = false;
    this.listenerHandles = [];
    this.lastFailure = null;
    this.initPromise = null;
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
      adsPerCredit: 3,
    };
  }

  getRewardedAdId() {
    const platform = Capacitor.getPlatform();
    if (import.meta.env.DEV) return TEST_REWARDED_IDS[platform] || "";
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
      AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
        this.rewarded = true;
      }),
      AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (error) => {
        this.loaded = false;
        this.lastFailure = error;
      }),
      AdMob.addListener(RewardAdPluginEvents.FailedToShow, (error) => {
        this.loaded = false;
        this.lastFailure = error;
      }),
      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        this.loaded = false;
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
        await ensureFreemiumSession();
        await AdMob.initialize({
          initializeForTesting: import.meta.env.DEV,
          tagForChildDirectedTreatment: false,
          tagForUnderAgeOfConsent: false,
        });
        await this.registerRewardListeners();
        await this.registerBannerListeners();
        if (Capacitor.getPlatform() === "ios") {
          const tracking = await AdMob.trackingAuthorizationStatus().catch(
            () => null,
          );
          if (tracking?.status === "notDetermined") {
            await AdMob.requestTrackingAuthorization().catch(() => null);
          }
        }
        const consent = await AdMob.requestConsentInfo().catch(() => null);
        if (consent?.isConsentFormAvailable && consent?.status === "REQUIRED") {
          await AdMob.showConsentForm().catch(() => null);
        }
        this.ready = true;
      } catch (error) {
        this.lastFailure = error;
        console.warn("AdMob initialization failed:", error?.message);
      } finally {
        if (!this.ready) this.initPromise = null;
      }
    })();
    return this.initPromise;
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
      await AdMob.showBanner({
        adId: this.getBannerAdId(),
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 0,
        isTesting: import.meta.env.DEV,
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
      await AppOpenAd.prepare({
        adId: this.getAppOpenAdId(),
        isTesting: import.meta.env.DEV,
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
      this.state = {
        credits: 0,
        rewardedToday: 0,
        dailyLimit: DEFAULT_DAILY_AD_LIMIT,
        adsPerCredit: 3,
      };
      this.lastRefreshAt = Date.now();
      return this.state;
    }
    const uid = auth.currentUser.uid;
    if (this.stateOwnerUid !== uid) {
      this.stateOwnerUid = uid;
      this.lastRefreshAt = 0;
    }
    if (!force && Date.now() - this.lastRefreshAt < AD_STATE_CACHE_MS) {
      return this.state;
    }
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        this.state = await getAdRewardStateFromServer();
        this.lastRefreshAt = Date.now();
      } catch (error) {
        console.warn("Ad reward state unavailable:", error?.code);
      }
      return this.state;
    })().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
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
    const adsPerCredit = Math.max(Number(this.state.adsPerCredit) || 3, 1);
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
    if (import.meta.env.DEV) return TEST_BANNER_IDS[platform] || "";
    return platform === "ios"
      ? import.meta.env.VITE_ADMOB_IOS_BANNER_AD_UNIT_ID || ""
      : import.meta.env.VITE_ADMOB_ANDROID_BANNER_AD_UNIT_ID || "";
  }

  getAppOpenAdId() {
    const platform = Capacitor.getPlatform();
    if (import.meta.env.DEV) return TEST_APP_OPEN_IDS[platform] || "";
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
        await AdMob.prepareRewardVideoAd({
          adId: this.getRewardedAdId(),
          isTesting: import.meta.env.DEV,
          ssv: { userId: uid },
        });
        this.loaded = true;
        return;
      } catch (error) {
        lastError = error;
        this.lastFailure = error;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
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
    try {
      await this.init();
      await ensureFreemiumSession();
      if (!this.ready || !auth.currentUser) {
        const result = { verified: false, creditGranted: false };
        if (onAdCompleted) onAdCompleted(result);
        return result;
      }
      const uid = auth.currentUser.uid;
      await this.refresh(true);
      const previousCredits = this.getPremiumQueries();
      const previousRewardedToday = Math.max(
        Number(this.state.rewardedToday) || 0,
        0,
      );
      await this.prepareRewardedAd(uid);
      const rewardItem = await AdMob.showRewardVideoAd();
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
      console.warn("Rewarded ad failed:", error?.message);
      const result = {
        verified: false,
        creditGranted: false,
        pending: false,
        errorCode: error?.code || error?.message || "admob/rewarded-failed",
      };
      if (onAdCompleted) onAdCompleted(result);
      return result;
    }
  }
}

export const adManager = new AdManager();
