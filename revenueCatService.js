import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";
import { Capacitor } from "@capacitor/core";
import { doc, getDoc } from "firebase/firestore";
import {
  auth,
  db,
  syncPremiumEntitlementFromServer,
} from "./firebaseService.js";

const ENTITLEMENT_ID = "premium";
const API_KEYS = {
  ios: import.meta.env.VITE_REVENUECAT_IOS_API_KEY,
  android: import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY,
};

let isInitialized = false;
let identifiedUserId = null;

export async function initRevenueCat() {
  if (isInitialized) return true;
  if (!Capacitor.isNativePlatform()) return false;

  const platform = Capacitor.getPlatform();
  const apiKey = API_KEYS[platform];
  if (!apiKey || apiKey.startsWith("test_")) {
    console.warn(`RevenueCat ${platform} üretim anahtarı yapılandırılmamış.`);
    return false;
  }

  try {
    await Purchases.setLogLevel({
      level: import.meta.env.DEV ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN,
    });
    await Purchases.configure({
      apiKey,
      appUserID: auth.currentUser?.uid || null,
    });
    isInitialized = true;
    identifiedUserId = auth.currentUser?.uid || null;
    return true;
  } catch (error) {
    console.warn("RevenueCat initialization failed:", error?.code);
    return false;
  }
}

export async function identifyRevenueCatUser(uid) {
  if (!uid || !Capacitor.isNativePlatform()) return false;
  if (!isInitialized && !(await initRevenueCat())) return false;
  if (identifiedUserId === uid) return true;

  try {
    await Purchases.logIn({ appUserID: uid });
    identifiedUserId = uid;
    return true;
  } catch (error) {
    console.warn("RevenueCat user identification failed:", error?.code);
    return false;
  }
}

export async function logoutRevenueCatUser() {
  if (!isInitialized || !Capacitor.isNativePlatform()) return;
  try {
    await Purchases.logOut();
    identifiedUserId = null;
  } catch (error) {
    console.warn("RevenueCat logout failed:", error?.code);
  }
}

export async function getRevenueCatOfferings() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!isInitialized && !(await initRevenueCat())) return null;

  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages?.length
      ? offerings.current
      : null;
  } catch (error) {
    console.error("RevenueCat offerings failed:", error?.code);
    return null;
  }
}

export async function purchasePackage(packageToPurchase = null) {
  if (!auth.currentUser) {
    return { success: false, requiresLogin: true };
  }
  if (!Capacitor.isNativePlatform()) {
    return { success: false, unavailableOnWeb: true };
  }
  if (!(await identifyRevenueCatUser(auth.currentUser.uid))) {
    return { success: false, configurationError: true };
  }

  try {
    let selectedPackage = packageToPurchase;
    if (!selectedPackage) {
      const offering = await getRevenueCatOfferings();
      selectedPackage = offering?.availablePackages?.[0] || null;
    }
    if (!selectedPackage) {
      return { success: false, noOffering: true };
    }

    const { customerInfo } = await Purchases.purchasePackage({
      aPackage: selectedPackage,
    });
    const sdkPremium = Boolean(
      customerInfo.entitlements.active[ENTITLEMENT_ID],
    );
    if (!sdkPremium) return { success: false };

    const serverPremium = await syncPremiumEntitlementFromServer();
    return {
      success: serverPremium,
      pendingVerification: !serverPremium,
      customerInfo,
    };
  } catch (error) {
    if (error?.userCancelled) {
      return { success: false, userCancelled: true };
    }
    console.error("RevenueCat purchase failed:", error?.code);
    return { success: false, errorCode: error?.code };
  }
}

export async function checkPremiumEntitlement() {
  const user = auth.currentUser;
  if (!user) return false;

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const userData = userSnap.data() || {};
    return userSnap.exists() && (
      userData.isPremium === true ||
      userData.membershipTier === "premium"
    );
  } catch (error) {
    console.warn("Premium entitlement read failed:", error?.code);
    return false;
  }
}

export async function restorePurchases() {
  if (!auth.currentUser) {
    return { success: false, requiresLogin: true, isPremium: false };
  }
  if (!Capacitor.isNativePlatform()) {
    return { success: false, unavailableOnWeb: true, isPremium: false };
  }
  if (!(await identifyRevenueCatUser(auth.currentUser.uid))) {
    return { success: false, configurationError: true, isPremium: false };
  }

  try {
    await Purchases.restorePurchases();
    const isPremium = await syncPremiumEntitlementFromServer();
    return { success: true, isPremium };
  } catch (error) {
    console.error("RevenueCat restore failed:", error?.code);
    return { success: false, errorCode: error?.code, isPremium: false };
  }
}
