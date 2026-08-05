import { initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  CustomProvider,
  ReCaptchaV3Provider,
} from "firebase/app-check";
import {
  getAuth,
  signInAnonymously,
  signInWithPopup,
  signInWithCustomToken,
  linkWithCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  deleteUser,
  updateProfile,
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { FirebaseAppCheck } from "@capacitor-firebase/app-check";
import {
  initializeFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  collection,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { normalizeProfile } from "./profileSchema.js";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const EXPECTED_FIREBASE_PROJECT_ID = "fortunecookieai-prod";
if (firebaseConfig.projectId !== EXPECTED_FIREBASE_PROJECT_ID) {
  throw new Error(
    `Yanlış Firebase projesi: ${firebaseConfig.projectId || "tanımsız"}. ` +
    `Beklenen proje: ${EXPECTED_FIREBASE_PROJECT_ID}.`,
  );
}

const requiredConfig = ["apiKey", "authDomain", "projectId", "appId"];
for (const key of requiredConfig) {
  if (!firebaseConfig[key]) {
    throw new Error(`Eksik Firebase yapılandırması: ${key}`);
  }
}

const app = initializeApp(firebaseConfig);

const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY;
const appCheckEnabled = import.meta.env.VITE_APP_CHECK_ENABLED === "true";
if (appCheckEnabled && appCheckSiteKey) {
  if (Capacitor.isNativePlatform()) {
    const nativeAppCheckReady = FirebaseAppCheck.initialize({
      isTokenAutoRefreshEnabled: true,
    }).catch((error) => {
      console.warn("Native App Check initialization failed:", error?.message);
    });
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          await Promise.race([
            nativeAppCheckReady,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("app-check-init-timeout")), 4000),
            ),
          ]);
          return Promise.race([
            FirebaseAppCheck.getToken({ forceRefresh: false }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("app-check-token-timeout")), 4000),
            ),
          ]);
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } else {
    if (import.meta.env.DEV) {
      globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
} else if (appCheckEnabled) {
  if (import.meta.env.PROD && !appCheckSiteKey) {
    console.error(
      "Firebase App Check anahtarı eksik. Korumalı Cloud Function çağrıları kapalı kalacaktır.",
    );
  }
}

export const auth = getAuth(app);
const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(
  (error) => {
    console.warn("Persistent authentication could not be enabled:", error?.code);
  },
);
// Auto-detect networks/proxies that interrupt Firestore's WebChannel transport.
// This is especially useful for localhost development and restrictive mobile
// networks, where the SDK can otherwise spend several seconds reconnecting.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
export const functions = getFunctions(app, "us-central1");
let accountStateRetryAfter = 0;
let lastKnownAccountState = null;
let anonymousSessionPromise = null;
const userSyncPromises = new Map();
const LOGIN_WRITE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_STATE_CACHE_MS = 5 * 60 * 1000;
const PROFILE_CACHE_MS = 15 * 60 * 1000;
const APP_SETTINGS_CACHE_MS = 5 * 60 * 1000;
const CACHE_PREFIX = "fc_cache_v2";

function readLocalCache(key, maxAgeMs, validator = () => true) {
  try {
    const storageKey = `${CACHE_PREFIX}:${key}`;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (
      !entry ||
      !Number.isFinite(Number(entry.savedAt)) ||
      Date.now() - Number(entry.savedAt) > maxAgeMs ||
      !validator(entry.value)
    ) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

function writeLocalCache(key, value) {
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}:${key}`,
      JSON.stringify({ savedAt: Date.now(), value }),
    );
  } catch {
    // Private browsing can disable storage; online operation remains available.
  }
}

const initialAuthState = authPersistenceReady.then(
  () =>
    new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    }),
);

export async function ensureFreemiumSession() {
  const restoredUser = await initialAuthState;
  // The observer result proves persistence hydration has completed. Always use
  // auth.currentUser here because restoredUser may refer to a session that was
  // intentionally signed out moments earlier (for example after registration).
  void restoredUser;
  if (auth.currentUser) return auth.currentUser;
  if (!anonymousSessionPromise) {
    anonymousSessionPromise = signInAnonymously(auth)
      .then((result) => result.user)
      .finally(() => {
        anonymousSessionPromise = null;
      });
  }
  return anonymousSessionPromise;
}

function cleanString(value, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

const PROFILE_SYNC_KEYS = [
  "displayName",
  "firstName",
  "lastName",
  "birthdate",
  "birthtime",
  "birthplace",
  "birthCountry",
  "birthCity",
  "birthRegion",
  "timezoneId",
  "risingSign",
  "zodiac",
  "latitude",
  "longitude",
  "timezoneOffset",
  "category",
  "categories",
  "preferredLanguage",
  "profileUpdatedAt",
  "email",
  "photoURL",
  "authProvider",
  "emailVerified",
];

function profilePayloadMatches(data, payload) {
  return PROFILE_SYNC_KEYS.every((key) => {
    if (Array.isArray(payload[key])) {
      return JSON.stringify(data[key] || []) === JSON.stringify(payload[key]);
    }
    return (data[key] ?? null) === (payload[key] ?? null);
  });
}

function profileValue(profileData, cloudData, localKey, cloudKey = localKey) {
  return hasOwn(profileData, localKey)
    ? profileData[localKey]
    : cloudData[cloudKey];
}

function getProfilePayload(user, profileData = {}, cloudData = {}) {
  const candidate = normalizeProfile({
    name: hasOwn(profileData, "name")
      ? profileData.name
      : cloudData.displayName || user.displayName,
    birthdate: profileValue(profileData, cloudData, "birthdate"),
    birthtime: profileValue(profileData, cloudData, "birthtime"),
    birthplace: profileValue(profileData, cloudData, "birthplace"),
    birthCountry: profileValue(profileData, cloudData, "birthCountry"),
    birthCity: profileValue(profileData, cloudData, "birthCity"),
    birthRegion: profileValue(profileData, cloudData, "birthRegion"),
    timezoneId: profileValue(profileData, cloudData, "timezoneId"),
    risingSign: profileValue(profileData, cloudData, "risingSign"),
    zodiac: profileValue(profileData, cloudData, "zodiac"),
    latitude: profileValue(profileData, cloudData, "latitude"),
    longitude: profileValue(profileData, cloudData, "longitude"),
    timezoneOffset: profileValue(profileData, cloudData, "timezoneOffset"),
    category: profileValue(profileData, cloudData, "category"),
    categories: profileValue(profileData, cloudData, "categories"),
    preferredLanguage: profileValue(
      profileData,
      cloudData,
      "preferredLanguage",
    ),
  });

  const displayName = candidate.name || cleanString(user.displayName, 80);
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const providerIds = Array.isArray(user.providerData)
    ? user.providerData.map((provider) => provider?.providerId).filter(Boolean)
    : [];
  return {
    uid: user.uid,
    displayName,
    firstName: cleanString(
      cloudData.firstName || nameParts.slice(0, -1).join(" ") || nameParts[0],
      80,
    ),
    lastName: cleanString(
      cloudData.lastName || (nameParts.length > 1 ? nameParts.at(-1) : ""),
      80,
    ),
    email: cleanString(user.email || cloudData.email, 254),
    photoURL: cleanString(user.photoURL || cloudData.photoURL, 1000),
    authProvider: cleanString(providerIds.join(",") || cloudData.authProvider, 80),
    emailVerified: user.emailVerified === true || cloudData.emailVerified === true,
    birthdate: candidate.birthdate,
    birthtime: candidate.birthtime,
    birthplace: candidate.birthplace,
    birthCountry: candidate.birthCountry,
    birthCity: candidate.birthCity,
    birthRegion: candidate.birthRegion,
    timezoneId: candidate.timezoneId,
    risingSign: candidate.risingSign,
    zodiac: candidate.zodiac,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    timezoneOffset: candidate.timezoneOffset,
    category: candidate.category,
    categories: candidate.categories,
    preferredLanguage: candidate.preferredLanguage,
    profileUpdatedAt: hasOwn(profileData, "name")
      ? new Date().toISOString()
      : cleanString(cloudData.profileUpdatedAt, 30),
    lastLogin: new Date().toISOString(),
  };
}

function cachedProfileMatchesUser(profile, user) {
  if (!profile || profile.uid !== user.uid) return false;
  const expectedEmail = cleanString(user.email, 254).toLowerCase();
  const cachedEmail = cleanString(profile.email, 254).toLowerCase();
  if (expectedEmail && cachedEmail !== expectedEmail) return false;
  const providerIds = (user.providerData || [])
    .map((provider) => provider?.providerId)
    .filter(Boolean);
  return providerIds.length === 0 || Boolean(profile.authProvider);
}

export async function callGenerateFortuneCloudFunction(
  profile = {},
  lang = "tr",
  requestId = "",
) {
  if (!auth.currentUser) return null;

  try {
    const supportedLanguages = new Set([
      "tr",
      "en",
      "de",
      "fr",
      "es",
      "it",
      "el",
      "ko",
      "ja",
      "zh",
    ]);
    const requestedLanguage = supportedLanguages.has(lang) ? lang : "en";
    const callable = httpsCallable(functions, "generateFortune");
    const result = await callable({
      profile: {
        zodiac: cleanString(profile.zodiac, 20),
        risingSign: cleanString(profile.risingSign, 20),
        category: cleanString(profile.category || "general", 20),
        timezoneId: cleanString(profile.timezoneId, 64),
      },
      lang: requestedLanguage,
      requestId,
    });

    const prediction = cleanString(result?.data?.prediction, 360);
    if (!prediction) return null;

    return {
      success: true,
      prediction,
      provider: result?.data?.provider || "Gemini-3.1-Flash-Lite",
      usage: result?.data?.usage || null,
      requestId: result?.data?.requestId || requestId,
      contentId: cleanString(result?.data?.contentId, 128),
      contentCategory: cleanString(result?.data?.contentCategory, 32),
      contentSource: cleanString(result?.data?.contentSource, 32),
      variantType: cleanString(result?.data?.variantType, 32),
    };
  } catch (error) {
    console.warn("Cloud fortune generation unavailable:", error?.code);
    const terminalCodes = new Set([
      "functions/resource-exhausted",
      "resource-exhausted",
      "functions/permission-denied",
      "permission-denied",
      "functions/unauthenticated",
      "unauthenticated",
      "functions/aborted",
      "aborted",
    ]);
    if (terminalCodes.has(error?.code)) throw error;
    return null;
  }
}

export async function syncPremiumEntitlementFromServer() {
  if (!auth.currentUser) return false;
  try {
    const callable = httpsCallable(functions, "syncPremiumEntitlement");
    const result = await callable();
    return result?.data?.isPremium === true;
  } catch (error) {
    console.warn("Premium doğrulaması başarısız:", error?.code);
    return false;
  }
}

export async function getAccountStateFromServer(forceRefresh = false) {
  if (!auth.currentUser) {
    return {
      exists: false,
      isPremium: false,
      membershipTier: "free",
      premiumUsage: null,
    };
  }

  const uid = auth.currentUser.uid;
  const cacheKey = `account:${uid}`;
  if (!forceRefresh) {
    const cached = readLocalCache(cacheKey, ACCOUNT_STATE_CACHE_MS);
    if (cached) {
      lastKnownAccountState = { ...cached, source: "local-cache" };
      return lastKnownAccountState;
    }
  }

  const callableFlag = import.meta.env.VITE_ACCOUNT_STATE_CALLABLE_ENABLED;
  const callableEnabled = callableFlag !== "false";

  const getFirestoreFallback = async () => {
    try {
      const snapshot = await getDoc(doc(db, "users", auth.currentUser.uid));
      const data = snapshot.data() || {};
      const isPremium =
        data.isPremium === true || data.membershipTier === "premium";
      const fallbackState = {
        exists: snapshot.exists(),
        isPremium,
        membershipTier: isPremium ? "premium" : "free",
        premiumUsage: null,
        source: "firestore-fallback",
      };
      lastKnownAccountState = fallbackState;
      writeLocalCache(cacheKey, fallbackState);
      return fallbackState;
    } catch (error) {
      console.warn("Firestore hesap durumu sorgulanamadı:", error?.code);
      return lastKnownAccountState;
    }
  };

  if (!callableEnabled || Date.now() < accountStateRetryAfter) {
    return (await getFirestoreFallback()) || lastKnownAccountState;
  }

  try {
    const callable = httpsCallable(functions, "getAccountState");
    const result = await callable();
    lastKnownAccountState = result?.data || null;
    if (lastKnownAccountState) writeLocalCache(cacheKey, lastKnownAccountState);
    accountStateRetryAfter = 0;
    return lastKnownAccountState;
  } catch (error) {
    console.warn("Hesap durumu sorgulanamadı:", error?.code);
    accountStateRetryAfter = Date.now() + 60_000;
    return (await getFirestoreFallback()) || lastKnownAccountState;
  }
}

export async function getAdRewardStateFromServer() {
  if (!auth.currentUser) {
    return {
      credits: 0,
      rewardedToday: 0,
      dailyLimit: 3,
      adsPerCredit: 3,
    };
  }
  const callable = httpsCallable(functions, "getAdRewardState");
  const result = await callable();
  return {
    credits: Math.max(Number(result?.data?.credits) || 0, 0),
    rewardedToday: Math.max(Number(result?.data?.rewardedToday) || 0, 0),
    dailyLimit: Math.max(Number(result?.data?.dailyLimit) || 3, 1),
    adsPerCredit: Math.max(Number(result?.data?.adsPerCredit) || 3, 1),
    day: result?.data?.day || "",
  };
}

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("profile");
googleProvider.addScope("email");
const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

async function completeSocialSignIn(result) {
  const user = result?.user;
  // onAuthStateChanged owns profile hydration. Waiting for an additional
  // Firestore read/write cycle here made every social login perform the same
  // synchronization twice before the UI became responsive.
  return { success: true, user };
}

async function preserveNativeAppleDisplayName(result, nativeResult, provider) {
  if (provider !== "apple" || !result?.user) return result;

  const displayName = cleanString(nativeResult?.user?.displayName, 80);
  if (displayName && !cleanString(result.user.displayName, 80)) {
    await updateProfile(result.user, { displayName });
  }
  return result;
}

function isNativeMobileAuthRuntime() {
  if (Capacitor.isNativePlatform?.() === true) return true;

  const platform = Capacitor.getPlatform?.();
  if (platform === "android" || platform === "ios") return true;

  // Capacitor serves bundled Android/iOS assets from a localhost WebView.
  // During a very early WebView lifecycle the imported platform helper can
  // briefly report `web`; the injected native bridge is the authoritative
  // fallback. Without this guard Google Auth can incorrectly choose the web
  // popup flow and expose a localhost callback outside the application.
  if (typeof window === "undefined") return false;
  const nativeBridge = window.Capacitor;
  const bridgePlatform = nativeBridge?.getPlatform?.();
  if (bridgePlatform === "android" || bridgePlatform === "ios") return true;

  const hasNativeBridge =
    nativeBridge?.isNativePlatform?.() === true ||
    typeof nativeBridge?.nativeCallback === "function" ||
    typeof nativeBridge?.nativePromise === "function";
  const hostname = window.location.hostname.toLowerCase();
  const isLocalWebViewOrigin =
    hostname === "localhost" || hostname === "127.0.0.1";
  const userAgent = window.navigator?.userAgent || "";
  const isAndroidWebView =
    /Android/i.test(userAgent) && (/[;\s]wv[;)\s]/i.test(userAgent) || /Version\/4\.0/i.test(userAgent));
  const isIOSWebView =
    /(?:iPhone|iPad|iPod)/i.test(userAgent) && !/Safari\//i.test(userAgent);

  // Android System WebView may expose the bundled origin as either
  // http://localhost or https://localhost depending on the device/WebView
  // version. Protocol must therefore not decide whether native auth is used.
  return isLocalWebViewOrigin &&
    (hasNativeBridge || isAndroidWebView || isIOSWebView);
}

function isRetryableGoogleNetworkError(error) {
  const failureText = `${error?.code || ""} ${error?.message || ""}`;
  return (
    /(?:^|\s)(?:err(?:or)?\s*)?-?7(?:\s|$)/i.test(failureText) ||
    /network[_\s-]?(?:error|request[_\s-]?failed)/i.test(failureText)
  );
}

function isCancelledGoogleSignIn(error) {
  const failureText = `${error?.code || ""} ${error?.message || ""}`;
  return /cancel(?:ed|led|lation)?/i.test(failureText);
}

function waitForAuthRetry(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function waitForAuthPersistenceAfterNativeCredential(timeoutMs = 1500) {
  let timeoutId;
  const timedOut = await Promise.race([
    authPersistenceReady.then(() => false),
    new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve(true), timeoutMs);
    }),
  ]);
  clearTimeout(timeoutId);
  if (timedOut) {
    console.warn(
      "Firebase persistence is still initializing; continuing native social sign-in.",
    );
  }
}

async function settleAuthOperation(operation, timeoutMs, label) {
  let timeoutId;
  try {
    const completed = await Promise.race([
      Promise.resolve(operation).then(() => true),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
    if (!completed) console.warn(`${label} timed out; continuing sign-in.`);
    return completed;
  } catch (error) {
    console.warn(`${label} failed; continuing sign-in.`, error?.code || error?.message);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestNativeGoogleCredential() {
  let credentialManagerError = null;

  // Google Play services status 7 is a retryable network failure. Retry the
  // modern Credential Manager flow once instead of immediately falling back
  // to legacy Google Sign-In, whose extra access-token request makes the same
  // transient network problem more likely to fail again.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await FirebaseAuthentication.signInWithGoogle({
        useCredentialManager: true,
        skipNativeAuth: false,
      });
    } catch (error) {
      credentialManagerError = error;
      if (isCancelledGoogleSignIn(error)) throw error;
      if (!isRetryableGoogleNetworkError(error)) break;
      if (attempt === 0) await waitForAuthRetry(900);
    }
  }

  if (isRetryableGoogleNetworkError(credentialManagerError)) {
    const networkError = new Error(
      "Google oturum açma servisine ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.",
    );
    networkError.code = "auth/network-request-failed";
    throw networkError;
  }

  console.warn(
    "Google Credential Manager compatibility failure; trying legacy Google Sign-In:",
    credentialManagerError?.code,
    credentialManagerError?.message,
  );
  return FirebaseAuthentication.signInWithGoogle({
    useCredentialManager: false,
    skipNativeAuth: false,
  });
}

async function bridgeNativeSessionIntoWebView(nativeResult, provider) {
  const nativeUid = cleanString(nativeResult?.user?.uid, 128);
  if (!nativeUid) {
    throw new Error(`auth/${provider}-native-user-missing`);
  }

  const tokenResult = await FirebaseAuthentication.getIdToken({
    forceRefresh: true,
  });
  if (!tokenResult?.token) {
    throw new Error(`auth/${provider}-native-token-missing`);
  }

  const exchangeNativeAuthToken = httpsCallable(
    functions,
    "exchangeNativeAuthToken",
  );
  const exchangeResult = await exchangeNativeAuthToken({
    nativeIdToken: tokenResult.token,
  });
  const customToken = exchangeResult?.data?.customToken;
  if (!customToken) {
    throw new Error("auth/native-session-bridge-failed");
  }

  await waitForAuthPersistenceAfterNativeCredential();
  if (auth.currentUser?.isAnonymous) {
    const anonymousUser = auth.currentUser;
    const deletedAnonymousUser = await settleAuthOperation(
      deleteUser(anonymousUser),
      2000,
      "Anonymous account cleanup",
    );
    if (!deletedAnonymousUser) {
      await settleAuthOperation(
        firebaseSignOut(auth),
        1500,
        "Anonymous account sign-out",
      );
    }
  } else if (auth.currentUser && auth.currentUser.uid !== nativeUid) {
    await firebaseSignOut(auth);
  }

  const result = await signInWithCustomToken(auth, customToken);
  if (result.user.uid !== nativeUid) {
    await firebaseSignOut(auth).catch(() => {});
    throw new Error("auth/native-session-user-mismatch");
  }
  return preserveNativeAppleDisplayName(result, nativeResult, provider);
}

async function signInNatively(provider) {
  let nativeResult;
  if (provider === "apple") {
    nativeResult = await FirebaseAuthentication.signInWithApple({
      skipNativeAuth: false,
    });
  } else {
    // Credential Manager returns the Google ID token directly. The legacy
    // GoogleSignIn path also requests a separate OAuth access token after the
    // account picker; that second request can fail on physical/Play-installed
    // devices even though account selection itself succeeded. Keep the legacy
    // flow only as a compatibility fallback for older Android environments.
    nativeResult = await requestNativeGoogleCredential();
  }
  return bridgeNativeSessionIntoWebView(nativeResult, provider);
}

async function resetFailedNativeSocialSession() {
  if (!isNativeMobileAuthRuntime()) return;
  await FirebaseAuthentication.signOut().catch(() => {});
}

export async function signInWithGoogle() {
  try {
    const result = isNativeMobileAuthRuntime()
      ? await signInNatively("google")
      : await signInWithPopup(auth, googleProvider);
    return completeSocialSignIn(result);
  } catch (error) {
    console.error("Google Sign-In Error:", error?.code, error?.message);
    await resetFailedNativeSocialSession();
    if (error && !error.code) {
      error.code = `${error.name || "auth/native-google-failed"}${error.message ? ` — ${error.message}` : ""}`;
    }
    return {
      success: false,
      error: error?.code || "Giriş işlemi başarısız oldu.",
    };
  }
}

export const loginWithGoogle = signInWithGoogle;

export async function signInWithApple() {
  try {
    const result = isNativeMobileAuthRuntime()
      ? await signInNatively("apple")
      : await signInWithPopup(auth, appleProvider);
    return completeSocialSignIn(result);
  } catch (error) {
    console.error("Apple Sign-In Error:", error?.code, error?.message);
    await resetFailedNativeSocialSession();
    const message =
      error?.code === "auth/operation-not-allowed"
        ? "Apple oturum açma Firebase Authentication panelinde henüz etkin değil."
        : error?.code || "Apple ile giriş işlemi başarısız oldu.";
    return {
      success: false,
      error: message,
    };
  }
}

export const loginWithApple = signInWithApple;

const emailActionSettings = {
  url: "https://fortunecookieai-prod.web.app/",
  handleCodeInApp: false,
};

async function returnToFreemiumSession() {
  await firebaseSignOut(auth).catch(() => {});
  return ensureFreemiumSession();
}

export async function registerWithEmail(email, password, displayName = "") {
  try {
    await authPersistenceReady;
    const normalizedEmail = cleanString(email, 254).toLowerCase();
    const normalizedName = cleanString(displayName, 80);
    const credential = EmailAuthProvider.credential(normalizedEmail, password);
    let result;

    if (auth.currentUser?.isAnonymous) {
      result = await linkWithCredential(auth.currentUser, credential);
    } else {
      result = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password,
      );
    }

    if (normalizedName) {
      await updateProfile(result.user, { displayName: normalizedName });
    }
    await sendEmailVerification(result.user, emailActionSettings);
    await returnToFreemiumSession();
    return { success: true, verificationSent: true };
  } catch (error) {
    console.error("Email registration error:", error?.code);
    return { success: false, error: error?.code || "auth/unknown" };
  }
}

export async function loginWithEmail(email, password) {
  try {
    await authPersistenceReady;
    const result = await signInWithEmailAndPassword(
      auth,
      cleanString(email, 254).toLowerCase(),
      password,
    );
    await result.user.reload();
    if (!result.user.emailVerified) {
      await sendEmailVerification(result.user, emailActionSettings).catch(
        () => {},
      );
      await returnToFreemiumSession();
      return {
        success: false,
        error: "auth/email-not-verified",
        verificationSent: true,
      };
    }
    return { success: true, user: auth.currentUser };
  } catch (error) {
    console.error("Email sign-in error:", error?.code);
    return { success: false, error: error?.code || "auth/unknown" };
  }
}

export async function resetEmailPassword(email) {
  try {
    await sendPasswordResetEmail(
      auth,
      cleanString(email, 254).toLowerCase(),
      emailActionSettings,
    );
    return { success: true };
  } catch (error) {
    // The UI deliberately shows the same response for unknown accounts.
    const safeCodes = new Set(["auth/user-not-found", "auth/invalid-email"]);
    if (safeCodes.has(error?.code)) return { success: true };
    console.error("Password reset error:", error?.code);
    return { success: false, error: error?.code || "auth/unknown" };
  }
}

export async function logoutUser() {
  try {
    if (isNativeMobileAuthRuntime()) {
      await FirebaseAuthentication.signOut().catch((error) => {
        console.warn("Native logout failed:", error?.code || error?.message);
      });
    }
    await firebaseSignOut(auth);
    return { success: true };
  } catch (error) {
    console.error("Logout error:", error?.code);
    return { success: false, error: error?.code };
  }
}

function hasExplicitProfileUpdates(profileData) {
  return PROFILE_SYNC_KEYS.some((key) =>
    hasOwn(profileData, key === "displayName" ? "name" : key),
  );
}

function isRecentLoginWrite(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) &&
    Date.now() - timestamp < LOGIN_WRITE_INTERVAL_MS;
}

export async function syncUserWithDatabase(user, profileData = {}) {
  if (!user) return null;
  const hasProfileUpdates = hasExplicitProfileUpdates(profileData);
  const syncKey = `${user.uid}:${hasProfileUpdates ? "profile" : "login"}`;
  if (userSyncPromises.has(syncKey)) return userSyncPromises.get(syncKey);

  const syncPromise = (async () => {
    const userRef = doc(db, "users", user.uid);
    try {
      const cachedProfile = !hasProfileUpdates
        ? readLocalCache(
            `profile:${user.uid}`,
            PROFILE_CACHE_MS,
            (profile) => cachedProfileMatchesUser(profile, user),
          )
        : null;
      if (cachedProfile) {
        return {
          ...cachedProfile,
          _syncVerified: true,
          _syncSource: "local-cache",
        };
      }
      const docSnap = await getDoc(userRef);
      const cloudData = docSnap.exists() ? docSnap.data() : {};
      const payload = getProfilePayload(user, profileData, cloudData);
      const shouldWrite =
        !docSnap.exists() ||
        hasProfileUpdates ||
        !profilePayloadMatches(cloudData, payload) ||
        !isRecentLoginWrite(cloudData.lastLogin);

      if (!shouldWrite) {
        writeLocalCache(`profile:${user.uid}`, cloudData);
        return {
          ...cloudData,
          _syncVerified: true,
        };
      }

      const writePayload = docSnap.exists()
        ? payload
        : {
            ...payload,
            createdAt: new Date().toISOString(),
          };
      await setDoc(userRef, writePayload, { merge: true });

      // Profile edits still receive a server-authoritative verification.
      // Routine logins use the acknowledged write result and avoid opening a
      // second snapshot listener solely to reread the same document.
      if (!hasProfileUpdates && docSnap.exists()) {
        writeLocalCache(`profile:${user.uid}`, {
          ...cloudData,
          ...writePayload,
        });
        return {
          ...cloudData,
          ...writePayload,
          _syncVerified: true,
        };
      }

      const verifiedSnapshot = await getDocFromServer(userRef);
      const verifiedData = verifiedSnapshot.data() || {};
      if (
        !verifiedSnapshot.exists() ||
        !profilePayloadMatches(verifiedData, payload)
      ) {
        throw new Error("profile-write-verification-failed");
      }

      writeLocalCache(`profile:${user.uid}`, verifiedData);
      return {
        ...verifiedData,
        _syncVerified: true,
      };
    } catch (error) {
      console.error("Firestore user sync failed:", error?.code || error?.message);
      return null;
    }
  })().finally(() => {
    userSyncPromises.delete(syncKey);
  });

  userSyncPromises.set(syncKey, syncPromise);
  return syncPromise;
}

export async function getUserProfileFromCloud(uid) {
  if (!uid || auth.currentUser?.uid !== uid) return null;
  try {
    const docSnap = await getDoc(doc(db, "users", uid));
    return docSnap.exists() ? docSnap.data() : null;
  } catch (error) {
    console.warn("Fetch cloud profile error:", error?.code);
    return null;
  }
}

function fortuneDocumentId(fortuneItem) {
  const rawId = cleanString(
    fortuneItem?.cloudId || fortuneItem?.requestId || fortuneItem?.id || `${Date.now()}`,
    120,
  );
  return rawId.replace(/[^A-Za-z0-9_-]/g, "_") || `${Date.now()}`;
}

function validTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export async function syncFortuneToCloud(fortuneItem) {
  const user = auth.currentUser;
  if (!user) return false;

  try {
    const payload = {
      quote: cleanString(fortuneItem?.quote || fortuneItem?.text, 360),
      zodiacId: cleanString(fortuneItem?.zodiacId, 20),
      zodiacIcon: cleanString(fortuneItem?.zodiacIcon, 8),
      zodiacName: cleanString(fortuneItem?.zodiacName, 40),
      numbers: Array.isArray(fortuneItem?.numbers)
        ? fortuneItem.numbers
            .slice(0, 6)
            .map(Number)
            .filter((value) => Number.isInteger(value) && value >= 1 && value <= 99)
        : [],
      timestamp: validTimestamp(fortuneItem?.timestamp),
      contentId: cleanString(fortuneItem?.contentId, 128),
      contentCategory: cleanString(fortuneItem?.contentCategory, 32),
      contentSource: cleanString(fortuneItem?.contentSource, 32),
      variantType: cleanString(fortuneItem?.variantType, 32),
      requestId: cleanString(fortuneItem?.requestId, 128),
    };
    if (!payload.quote) return false;
    const fortuneRef = doc(
      db,
      "users",
      user.uid,
      "fortunes",
      fortuneDocumentId(fortuneItem),
    );
    await setDoc(fortuneRef, payload, { merge: true });
    return true;
  } catch (error) {
    console.warn("Cloud fortune sync failed:", error?.code);
    return false;
  }
}

export async function trackFortuneEvent({
  eventType,
  contentId,
  requestId = "",
  lang = "en",
  eventId = "",
} = {}) {
  if (!auth.currentUser || !contentId || !eventType) return false;
  const safeEventId =
    cleanString(eventId, 128).replace(/[^A-Za-z0-9_-]/g, "") ||
    `evt_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  try {
    const callable = httpsCallable(functions, "trackFortuneEvent");
    await callable({
      eventType: cleanString(eventType, 32),
      contentId: cleanString(contentId, 128),
      requestId: cleanString(requestId, 128),
      lang: cleanString(lang, 8),
      eventId: safeEventId,
    });
    return true;
  } catch (error) {
    console.warn("Fortune event could not be tracked:", error?.code);
    return false;
  }
}

export async function getCloudFortuneHistory(maxItems = 100) {
  const user = auth.currentUser;
  if (!user) return [];

  let directItems = [];
  try {
    const historyQuery = query(
      collection(db, "users", user.uid, "fortunes"),
      orderBy("timestamp", "desc"),
      limit(Math.min(Math.max(Number(maxItems) || 100, 1), 200)),
    );
    const snapshot = await getDocs(historyQuery);
    directItems = snapshot.docs.map((item) => ({
      id: item.id,
      cloudId: item.id,
      ...item.data(),
      ownerUid: user.uid,
    }));
  } catch (error) {
    console.warn("Cloud fortune history unavailable:", error?.code);
  }

  let serverItems = [];
  try {
    const callable = httpsCallable(functions, "getMyFortuneHistory");
    const result = await callable();
    serverItems = (Array.isArray(result?.data?.items) ? result.data.items : []).map(
      (item) => ({ ...item, ownerUid: user.uid }),
    );
  } catch (error) {
    console.warn("Server AI history unavailable:", error?.code);
  }

  const seen = new Set();
  return [...directItems, ...serverItems]
    .filter((item) => {
      const key = `${cleanString(item?.quote || item?.text, 360)}|${validTimestamp(item?.timestamp)}`;
      if (!item?.quote || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .slice(0, Math.min(Math.max(Number(maxItems) || 100, 1), 200));
}

export async function syncFortuneHistoryToCloud(history = []) {
  if (!auth.currentUser || !Array.isArray(history)) return false;
  const items = history.slice(0, 100);
  const results = await Promise.allSettled(
    items.map((item) => syncFortuneToCloud(item)),
  );
  return results.every(
    (result) => result.status === "fulfilled" && result.value === true,
  );
}

export async function clearCloudFortuneHistory() {
  const user = auth.currentUser;
  if (!user) return false;

  try {
    const snapshot = await getDocs(
      collection(db, "users", user.uid, "fortunes"),
    );
    await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
    return true;
  } catch (error) {
    console.warn("Bulut fal geçmişi temizlenemedi:", error?.code);
    return false;
  }
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null, null);
      return;
    }
    if (user.isAnonymous) {
      callback(user, null);
      return;
    }
    let timeoutId;
    const syncTimedOut = Symbol("auth-profile-sync-timeout");
    const syncedProfile = await Promise.race([
      syncUserWithDatabase(user),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(syncTimedOut), 1800);
      }),
    ]);
    clearTimeout(timeoutId);
    if (syncedProfile === syncTimedOut) {
      console.warn("Auth profile hydration timed out; rendering the signed-in user immediately.");
      callback(user, null);
      return;
    }
    callback(user, syncedProfile);
  });
}

export function waitForInitialAuth() {
  return initialAuthState;
}

export async function currentUserIsAdmin() {
  const user = auth.currentUser;
  if (!user) return false;
  const token = await user.getIdTokenResult(true);
  return token.claims.admin === true;
}

export async function getAllUsersFromFirestore() {
  const data = await callAdminFunction("adminListUsers");
  return Array.isArray(data?.users)
    ? data.users.map((user) => ({ ...user, fortuneHistory: [] }))
    : [];
}

export async function getUserHistoryForAdmin(uid) {
  const data = await callAdminFunction("adminGetUserHistory", { uid });
  return Array.isArray(data?.items) ? data.items : [];
}

export async function toggleUserPremiumStatusInCloud(uid, isPremium) {
  try {
    if (!(await currentUserIsAdmin())) return false;
    const callable = httpsCallable(functions, "adminSetPremium");
    const result = await callable({ uid, isPremium: Boolean(isPremium) });
    return result?.data?.success === true;
  } catch (error) {
    console.warn("Admin premium update failed:", error?.code);
    return false;
  }
}

export async function deleteUserFromCloud(uid) {
  try {
    if (!(await currentUserIsAdmin())) return false;
    const callable = httpsCallable(functions, "adminDeleteUser");
    const result = await callable({ uid });
    return result?.data?.success === true;
  } catch (error) {
    console.warn("Admin user deletion failed:", error?.code);
    return false;
  }
}

export async function deleteMyAccountFromCloud() {
  if (!auth.currentUser || auth.currentUser.isAnonymous) return false;
  const callable = httpsCallable(functions, "deleteMyAccount");
  const result = await callable();
  return result?.data?.success === true;
}

export async function getAppSettingsFromCloud() {
  const cachedSettings = readLocalCache("app-settings", APP_SETTINGS_CACHE_MS);
  if (cachedSettings) return cachedSettings;

  try {
    const docSnap = await getDocFromServer(doc(db, "settings", "app_config"));
    if (docSnap.exists()) {
      const settings = docSnap.data();
      writeLocalCache("app-settings", settings);
      return settings;
    }
  } catch (error) {
    console.warn("App settings fetch failed:", error?.code);
  }
  return {
    instagramHandle: "@fortunecookie.ai",
    appName: "Fortune Cookie AI",
    freeDailyLimit: 1,
    premiumDailyLimit: 5,
  };
}

export async function saveAppSettingsToCloud(settings) {
  const payload = {
    instagramHandle: cleanString(settings.instagramHandle, 80),
    appName: cleanString(settings.appName, 80),
    freeDailyLimit: Math.min(Math.max(Number(settings.freeDailyLimit) || 1, 1), 20),
    premiumDailyLimit: Math.min(
      Math.max(Number(settings.premiumDailyLimit) || 5, 1),
      50,
    ),
  };
  const result = await callAdminFunction("adminUpdateAppSettings", payload);
  if (result?.success !== true) return false;
  const savedSettings = result.settings || payload;
  writeLocalCache("app-settings", savedSettings);
  return true;
}

async function callAdminFunction(name, data = {}) {
  if (!(await currentUserIsAdmin())) {
    throw new Error("admin/permission-denied");
  }
  const callable = httpsCallable(functions, name);
  const result = await callable(data);
  return result?.data || null;
}

export async function seedFortuneContentLibrary() {
  return callAdminFunction("adminSeedFortuneContent");
}

export async function listFortuneContent(filters = {}) {
  return callAdminFunction("adminListFortuneContent", filters);
}

export async function upsertFortuneContent(content = {}) {
  return callAdminFunction("adminUpsertFortuneContent", content);
}

export async function reviewFortuneContent(id, status, qualityScore = 3) {
  return callAdminFunction("adminReviewFortuneContent", {
    id,
    status,
    qualityScore,
  });
}

export async function generateFortuneDrafts({
  lang,
  category,
  count,
} = {}) {
  return callAdminFunction("adminGenerateFortuneDrafts", {
    lang,
    category,
    count,
  });
}
