import { Capacitor } from "@capacitor/core";
import {
  AdMob,
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
    this.state = {
      credits: 0,
      rewardedToday: 0,
      dailyLimit: DEFAULT_DAILY_AD_LIMIT,
      adsPerCredit: 3,
    };
  }

  getAdId() {
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

  async init() {
    if (!Capacitor.isNativePlatform() || !this.getAdId() || this.ready) return;
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
    return Capacitor.isNativePlatform() && Boolean(this.getAdId());
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
          adId: this.getAdId(),
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
