import { initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  CustomProvider,
  ReCaptchaV3Provider,
} from "firebase/app-check";
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  signInAnonymously,
  signInWithPopup,
  signInWithCredential,
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
if (appCheckEnabled) {
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
  } else if (appCheckSiteKey) {
    if (import.meta.env.DEV) {
      globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } else if (import.meta.env.PROD) {
    console.error(
      "Firebase App Check anahtarı eksik. Korumalı Cloud Function çağrıları kapalı kalacaktır.",
    );
  }
}

// IndexedDB initialization can remain pending indefinitely in WKWebView even
// when localStorage is healthy. Select localStorage at Auth construction time
// on native platforms so session hydration and provider credential exchange do
// not inherit that pending IndexedDB operation.
export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: browserLocalPersistence })
  : getAuth(app);
const authPersistenceReady = Promise.resolve(auth);
// Auto-detect networks/proxies that interrupt Firestore's WebChannel transport.
// This is especially useful for localhost development and restrictive mobile
// networks, where the SDK can otherwise spend several seconds reconnecting.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
export const functions = getFunctions(app, "us-central1");
const accountStateRetryAfterByUid = new Map();
const lastKnownAccountStateByUid = new Map();
let anonymousSessionPromise = null;
const userSyncPromises = new Map();
const LOGIN_WRITE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_STATE_CACHE_MS = 30 * 1000;
const PROFILE_CACHE_MS = 15 * 60 * 1000;
const APP_SETTINGS_CACHE_MS = 5 * 60 * 1000;
const CACHE_PREFIX = "fc_cache_v2";
const APP_SETTINGS_CACHE_KEY = `app-settings:${firebaseConfig.projectId}`;

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
      let settled = false;
      let unsubscribe = () => {};
      const finish = (user) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        resolve(user || null);
      };
      unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          console.info("[Auth] Initial session hydration completed.");
          finish(user);
        },
        (error) => {
          console.warn(
            "[Auth] Initial session hydration failed:",
            error?.code,
            error?.message,
          );
          finish(auth.currentUser);
        },
      );
      setTimeout(() => {
        if (!settled) {
          console.warn("[Auth] Initial session hydration timed out.");
        }
        finish(auth.currentUser);
      }, 1000);
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
    console.info("[Auth] Starting anonymous Firebase session.");
    anonymousSessionPromise = signInAnonymously(auth)
      .then((result) => {
        console.info("[Auth] Anonymous Firebase session established.");
        return result.user;
      })
      .catch((error) => {
        console.warn(
          "[Auth] Anonymous Firebase session failed:",
          error?.code,
          error?.message,
        );
        throw error;
      })
      .finally(() => {
        anonymousSessionPromise = null;
      });
  }
  return anonymousSessionPromise;
}

function cleanString(value, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeFortuneName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\s.'’-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
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
        name: sanitizeFortuneName(profile.name),
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
      "functions/unavailable",
      "unavailable",
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
  const getLastKnownState = () => lastKnownAccountStateByUid.get(uid) || null;
  const rememberState = (state) => {
    if (!state) return null;
    const ownedState = { ...state, ownerUid: uid };
    lastKnownAccountStateByUid.set(uid, ownedState);
    return ownedState;
  };
  if (!forceRefresh) {
    const cached = readLocalCache(cacheKey, ACCOUNT_STATE_CACHE_MS);
    if (cached) {
      return rememberState({ ...cached, source: "local-cache" });
    }
  }

  const callableFlag = import.meta.env.VITE_ACCOUNT_STATE_CALLABLE_ENABLED;
  const callableEnabled = callableFlag !== "false";

  const getFirestoreFallback = async () => {
    try {
      const snapshot = await getDoc(doc(db, "users", uid));
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
      const ownedState = rememberState(fallbackState);
      writeLocalCache(cacheKey, ownedState);
      return ownedState;
    } catch (error) {
      console.warn("Firestore hesap durumu sorgulanamadı:", error?.code);
      return getLastKnownState();
    }
  };

  if (
    !callableEnabled ||
    Date.now() < (accountStateRetryAfterByUid.get(uid) || 0)
  ) {
    return (await getFirestoreFallback()) || getLastKnownState();
  }

  try {
    const callable = httpsCallable(functions, "getAccountState");
    const result = await callable();
    const accountState = rememberState(result?.data || null);
    if (accountState) writeLocalCache(cacheKey, accountState);
    accountStateRetryAfterByUid.delete(uid);
    return accountState;
  } catch (error) {
    console.warn("Hesap durumu sorgulanamadı:", error?.code);
    accountStateRetryAfterByUid.set(uid, Date.now() + 60_000);
    return (await getFirestoreFallback()) || getLastKnownState();
  }
}

export async function getAdRewardStateFromServer() {
  if (!auth.currentUser) {
    return {
      credits: 0,
      rewardedToday: 0,
      dailyLimit: 3,
      adsPerCredit: 1,
    };
  }
  const callable = httpsCallable(functions, "getAdRewardState");
  const result = await callable();
  return {
    credits: Math.max(Number(result?.data?.credits) || 0, 0),
    rewardedToday: Math.max(Number(result?.data?.rewardedToday) || 0, 0),
    dailyLimit: Math.max(Number(result?.data?.dailyLimit) || 3, 1),
    adsPerCredit: Math.max(Number(result?.data?.adsPerCredit) || 1, 1),
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

async function runAuthOperation(operation, timeoutMs, errorCode) {
  let timeoutId;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error(errorCode);
          error.code = errorCode;
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestNativeGoogleCredential() {
  // Credential Manager can crash Google Play services before the bridge gets a
  // callback (observed as TransactionTooLargeException on Android 16). The
  // plugin's supported compatibility path uses the legacy Google Sign-In API.
  return FirebaseAuthentication.signInWithGoogle({
    useCredentialManager: false,
    skipNativeAuth: true,
  });
}

async function signInNatively(provider) {
  let nativeResult;
  if (provider === "apple") {
    nativeResult = await runAuthOperation(
      FirebaseAuthentication.signInWithApple({ skipNativeAuth: true }),
      45000,
      "auth/apple-provider-timeout",
    );
  } else {
    // On affected Android devices Credential Manager dies inside Google Play
    // services and never returns an error to JavaScript, so an in-app timeout
    // cannot recover. Use the plugin's supported legacy compatibility path.
    nativeResult = await runAuthOperation(
      requestNativeGoogleCredential(),
      45000,
      "auth/google-provider-timeout",
    );
  }

  const nativeCredential = nativeResult?.credential;
  if (!nativeCredential?.idToken) {
    const error = new Error(`auth/${provider}-credential-missing`);
    error.code = `auth/${provider}-credential-missing`;
    throw error;
  }

  const credential = provider === "apple"
    ? appleProvider.credential({
        idToken: nativeCredential.idToken,
        rawNonce: nativeCredential.nonce,
        accessToken: nativeCredential.accessToken,
      })
    : GoogleAuthProvider.credential(
        nativeCredential.idToken,
        nativeCredential.accessToken || undefined,
      );

  console.info(`[Auth] ${provider} provider credential received.`);

  // signInWithCredential replaces the anonymous JS session directly. An
  // explicit sign-out adds another WebView persistence operation and can leave
  // the provider flow waiting after the native account picker has completed.
  const result = await runAuthOperation(
    signInWithCredential(auth, credential),
    20000,
    `auth/${provider}-web-session-timeout`,
  );
  console.info(`[Auth] ${provider} Firebase web session established.`);
  return preserveNativeAppleDisplayName(result, nativeResult, provider);
}

async function resetFailedNativeSocialSession() {
  if (!isNativeMobileAuthRuntime()) return;
  await runAuthOperation(
    FirebaseAuthentication.signOut(),
    2000,
    "auth/native-reset-timeout",
  ).catch(() => {});
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
      await runAuthOperation(
        FirebaseAuthentication.signOut(),
        3000,
        "auth/native-logout-timeout",
      ).catch((error) => {
        console.warn("Native logout failed:", error?.code || error?.message);
      });
    }
    await runAuthOperation(
      firebaseSignOut(auth),
      5000,
      "auth/web-logout-timeout",
    );
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

export async function syncUserWithDatabase(user, profileData = {}, options = {}) {
  if (!user || user.isAnonymous) return null;
  const hasProfileUpdates = hasExplicitProfileUpdates(profileData);
  const forceFresh = options?.forceFresh === true;
  const syncKey = `${user.uid}:${hasProfileUpdates ? "profile" : forceFresh ? "fresh-login" : "login"}`;
  if (userSyncPromises.has(syncKey)) return userSyncPromises.get(syncKey);

  const syncPromise = (async () => {
    const userRef = doc(db, "users", user.uid);
    try {
      const cachedProfile = !hasProfileUpdates && !forceFresh
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
  if (!uid || auth.currentUser?.uid !== uid || auth.currentUser?.isAnonymous) {
    return null;
  }
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

export async function syncFortuneToCloud(fortuneItem, expectedOwnerUid = "") {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return false;
  if (expectedOwnerUid && user.uid !== expectedOwnerUid) return false;

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
    if (
      hasOwn(fortuneItem || {}, "reflection") ||
      hasOwn(fortuneItem || {}, "reaction") ||
      hasOwn(fortuneItem || {}, "reflectedAt")
    ) {
      payload.reflection = cleanString(fortuneItem?.reflection, 500);
      payload.reaction = ["keep", "act", "release"].includes(fortuneItem?.reaction)
        ? fortuneItem.reaction
        : "";
      payload.reflectedAt = validTimestamp(
        fortuneItem?.reflectedAt || new Date().toISOString(),
      );
    }
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
  if (
    !auth.currentUser ||
    auth.currentUser.isAnonymous ||
    !contentId ||
    !eventType
  ) return false;
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
  if (!user || user.isAnonymous) return [];

  try {
    const callable = httpsCallable(functions, "getMyFortuneHistory");
    const result = await callable();
    return (Array.isArray(result?.data?.items) ? result.data.items : [])
      .slice(0, Math.min(Math.max(Number(maxItems) || 100, 1), 200))
      .map((item) => ({
        ...item,
        id: item.requestId || item.id,
        cloudId: item.requestId || item.id,
        ownerUid: user.uid,
        cloudPersisted: true,
      }));
  } catch (error) {
    console.warn("Cloud fortune history unavailable:", error?.code);
    return [];
  }
}

export async function syncFortuneHistoryToCloud(history = []) {
  if (
    !auth.currentUser ||
    auth.currentUser.isAnonymous ||
    !Array.isArray(history)
  ) return false;
  const items = history
    .filter((item) => item?.cloudPersisted === true)
    .slice(0, 100);
  const results = await Promise.allSettled(
    items.map((item) => syncFortuneToCloud(item)),
  );
  return results.every(
    (result) => result.status === "fulfilled" && result.value === true,
  );
}

export async function clearCloudFortuneHistory() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return false;

  try {
    const callable = httpsCallable(functions, "clearMyFortuneHistory");
    const result = await callable();
    return result?.data?.success === true;
  } catch (error) {
    console.warn("Bulut fal geçmişi temizlenemedi:", error?.code);
    return false;
  }
}

export function onAuthChange(callback) {
  let authChangeVersion = 0;
  return onAuthStateChanged(auth, async (user) => {
    const version = ++authChangeVersion;
    const isCurrentChange = () =>
      version === authChangeVersion &&
      (auth.currentUser?.uid || null) === (user?.uid || null);
    if (!user) {
      if (isCurrentChange()) callback(null, null);
      return;
    }
    if (user.isAnonymous) {
      if (isCurrentChange()) callback(user, null);
      return;
    }
    let timeoutId;
    const syncTimedOut = Symbol("auth-profile-sync-timeout");
    // Initial auth hydration must observe the current server profile instead of
    // reusing the 15-minute convenience cache from an earlier app session.
    const profileSync = syncUserWithDatabase(user, {}, { forceFresh: true });
    const syncedProfile = await Promise.race([
      profileSync,
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(syncTimedOut), 1800);
      }),
    ]);
    clearTimeout(timeoutId);
    if (!isCurrentChange()) return;
    if (syncedProfile === syncTimedOut) {
      console.warn("Auth profile hydration timed out; rendering the signed-in user immediately.");
      // The UI may render local account details, but fortune generation must
      // remain gated until the force-fresh profile attempt settles.
      callback(user, null, { profileHydrationPending: true });
      void profileSync.then((lateProfile) => {
        if (isCurrentChange()) {
          callback(user, lateProfile, { profileHydrationPending: false });
        }
      });
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

export async function getAdminUserDirectory() {
  const data = await callAdminFunction("adminListUsers");
  if (data?.meta) {
    console.info("Admin user directory loaded", data.meta);
  }
  return {
    users: Array.isArray(data?.users)
      ? data.users.map((user) => ({ ...user, fortuneHistory: [] }))
      : [],
    meta: data?.meta || {},
  };
}

export async function getAllUsersFromFirestore() {
  const directory = await getAdminUserDirectory();
  return directory.users;
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

export async function getAppSettingsFromCloud(forceRefresh = false) {
  if (!forceRefresh) {
    const cachedSettings = readLocalCache(
      APP_SETTINGS_CACHE_KEY,
      APP_SETTINGS_CACHE_MS,
    );
    if (cachedSettings) return cachedSettings;
  }

  try {
    const docSnap = await getDocFromServer(doc(db, "settings", "app_config"));
    if (docSnap.exists()) {
      const settings = docSnap.data();
      writeLocalCache(APP_SETTINGS_CACHE_KEY, settings);
      return settings;
    }
  } catch (error) {
    console.warn("App settings fetch failed:", error?.code);
  }
  return {
    instagramHandle: "@fortunecookieai",
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
  writeLocalCache(APP_SETTINGS_CACHE_KEY, savedSettings);
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
