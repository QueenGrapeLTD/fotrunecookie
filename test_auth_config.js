import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const authSource = fs.readFileSync(new URL('./firebaseService.js', import.meta.url), 'utf8');
const functionsSource = fs.readFileSync(
  new URL('./functions/index.js', import.meta.url),
  'utf8',
);
const adminGuardSource = fs.readFileSync(
  new URL('./adminGuard.js', import.meta.url),
  'utf8',
);
const adminHtml = fs.readFileSync(new URL('./admin.html', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const appStoreCheckSource = fs.readFileSync(
  new URL('./scripts/app-store-check.js', import.meta.url),
  'utf8',
);
const xcodeProject = fs.readFileSync(
  new URL('./ios/App/App.xcodeproj/project.pbxproj', import.meta.url),
  'utf8',
);
const iosEntitlements = fs.readFileSync(
  new URL('./ios/App/App/App.entitlements', import.meta.url),
  'utf8',
);
const iosInfoPlist = fs.readFileSync(
  new URL('./ios/App/App/Info.plist', import.meta.url),
  'utf8',
);
const capacitorConfig = JSON.parse(
  fs.readFileSync(new URL('./capacitor.config.json', import.meta.url), 'utf8'),
);

test('social authentication never redirects a production session to localhost', () => {
  assert.doesNotMatch(authSource, /signInWithRedirect/);
  assert.match(authSource, /signInWithPopup/);
  assert.match(authSource, /isNativeMobileAuthRuntime\(\)/);
  assert.match(authSource, /Capacitor\.isNativePlatform/);
  assert.match(authSource, /nativeBridge\?\.nativePromise/);
  assert.match(authSource, /hostname === "localhost"/);
  assert.match(authSource, /hostname === "127\.0\.0\.1"/);
  assert.match(authSource, /isAndroidWebView/);
  assert.doesNotMatch(authSource, /isBundledMobileOrigin/);
});

test('native Google and Apple providers bridge into Firebase Auth', () => {
  assert.deepEqual(
    capacitorConfig.plugins.FirebaseAuthentication.providers,
    ['google.com', 'apple.com'],
  );
  assert.equal(capacitorConfig.plugins.FirebaseAuthentication.skipNativeAuth, true);
  assert.match(authSource, /signInWithCredential/);
  assert.match(authSource, /runAuthOperation/);
  assert.match(authSource, /auth\/apple-provider-timeout/);
  assert.match(authSource, /auth\/google-provider-timeout/);
  assert.match(authSource, /auth\/\$\{provider\}-web-session-timeout/);
  assert.match(authSource, /useCredentialManager:\s*true/);
  assert.match(authSource, /isRetryableGoogleNetworkError/);
  assert.match(authSource, /attempt < 2/);
  assert.match(authSource, /auth\/network-request-failed/);
  assert.match(authSource, /Credential Manager compatibility failure; trying legacy Google Sign-In/);
  assert.match(authSource, /useCredentialManager:\s*false/);
  assert.match(authSource, /skipNativeAuth:\s*true/);
  assert.match(authSource, /preserveNativeAppleDisplayName/);
  assert.match(authSource, /nativeResult\?\.user\?\.displayName/);
  assert.match(authSource, /auth\/native-google-failed/);
  assert.match(authSource, /GoogleAuthProvider\.credential\(/);
  assert.match(authSource, /appleProvider\.credential\(/);
  const nativeSignInSource = authSource.slice(
    authSource.indexOf('async function signInNatively'),
    authSource.indexOf('export async function signInWithGoogle'),
  );
  assert.ok(
    nativeSignInSource.indexOf('FirebaseAuthentication.signInWithApple') <
      nativeSignInSource.indexOf('signInWithCredential'),
  );
  assert.ok(
    nativeSignInSource.indexOf('requestNativeGoogleCredential()') <
      nativeSignInSource.indexOf('signInWithCredential'),
  );
  assert.doesNotMatch(authSource, /exchangeNativeAuthToken/);
  assert.doesNotMatch(authSource, /FirebaseAuthentication\.getIdToken/);
  assert.match(authSource, /FirebaseAuthentication\.signOut/);
});

test('iOS target is entitled and configured for Sign in with Apple', () => {
  assert.match(iosEntitlements, /com\.apple\.developer\.applesignin/);
  assert.match(iosEntitlements, /<string>Default<\/string>/);
  assert.match(xcodeProject, /CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements/);
  assert.match(xcodeProject, /com\.apple\.SignInWithApple/);
  assert.match(xcodeProject, /CURRENT_PROJECT_VERSION = 12/);
  assert.match(xcodeProject, /TARGETED_DEVICE_FAMILY = "1,2"/);
});

test('iOS social sign-in has its native callback and recoverable button state', () => {
  assert.match(iosInfoPlist, /<key>CFBundleURLTypes<\/key>/);
  assert.match(iosInfoPlist, /com\.googleusercontent\.apps\.53381061591-gmsqu8nbojakstbe7l90ljvap4a28r0b/);
  assert.match(mainSource, /Google sign-in handler failed/);
  assert.match(mainSource, /Apple sign-in handler failed/);
  assert.match(mainSource, /removeAttribute\('aria-busy'\)/);
});

test('iOS web layout respects notch and home indicator safe areas', () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(styles, /safe-area-inset-top/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /calc\(20px \+ var\(--safe-area-top\)\)/);
  assert.match(styles, /bottom: calc\(30px \+ var\(--safe-area-bottom\)\)/);
});

test('iOS profile modal stays fixed and does not focus-zoom form controls', () => {
  assert.match(styles, /#modal-profile\s*\{[^}]*align-items:\s*stretch/s);
  assert.match(styles, /\.profile-modal-box\s*\{[^}]*height:\s*100%/s);
  assert.match(styles, /\.profile-modal-box \.modal-body\s*\{[^}]*min-height:\s*0/s);
  assert.match(styles, /\.profile-modal-box input,[\s\S]*font-size:\s*16px !important/);
  assert.match(styles, /overscroll-behavior:\s*none/);
});

test('rapid cookie taps do not trigger iOS double-tap page zoom', () => {
  assert.match(html, /maximum-scale=1\.0/);
  assert.match(html, /user-scalable=no/);
  assert.match(styles, /\.cookie-wrapper\s*\{[^}]*touch-action:\s*none/s);
  assert.match(styles, /\.cookie-wrapper\s*\{[^}]*-webkit-touch-callout:\s*none/s);
  assert.match(html, /id="cookie-interactive"/);
  assert.match(mainSource, /event\?\.cancelable/);
  assert.match(mainSource, /addEventListener\('touchend'/);
  assert.match(mainSource, /\{ passive: false \}/);
  assert.match(mainSource, /Date\.now\(\) - lastCookieTouchAt < 750/);
  assert.match(mainSource, /addEventListener\('dblclick'/);
  assert.match(mainSource, /event\.preventDefault\(\)/);
});

test('mobile sessions restore locally before creating a new anonymous user', () => {
  assert.match(authSource, /initializeAuth\(app, \{ persistence: browserLocalPersistence \}\)/);
  assert.match(authSource, /Capacitor\.isNativePlatform\(\)/);
  assert.match(authSource, /const authPersistenceReady = Promise\.resolve\(auth\)/);
  assert.doesNotMatch(authSource, /\n\s*setPersistence,\n/);
  assert.match(authSource, /const restoredUser = await initialAuthState/);
  assert.match(authSource, /Initial session hydration timed out/);
  assert.match(authSource, /ACCOUNT_STATE_CACHE_MS = 30 \* 1000/);
  assert.match(authSource, /PROFILE_CACHE_MS = 15 \* 60 \* 1000/);
  assert.match(authSource, /APP_SETTINGS_CACHE_MS = 5 \* 60 \* 1000/);
  assert.match(authSource, /cachedProfileMatchesUser/);
  assert.match(authSource, /authProvider/);
});

test('social users replace the local anonymous session without a persistence gate', () => {
  assert.match(authSource, /signInWithCredential\(auth, credential\)/);
  assert.match(authSource, /skipNativeAuth:\s*true/);
  assert.doesNotMatch(authSource, /auth\/persistence-timeout/);
  assert.doesNotMatch(authSource, /auth\/anonymous-signout-timeout/);
  assert.match(authSource, /auth\/native-reset-timeout/);
});

test('anonymous bootstrap does not wait for remote account hydration', () => {
  assert.match(mainSource, /getProfile\(currentLang\),\s*800/s);
  assert.match(mainSource, /ensureFreemiumSession\(\),\s*1200/s);
  assert.match(mainSource, /void settleWithTimeout\(\s*getAppSettingsFromCloud\(\)/s);
  assert.match(mainSource, /void settleWithTimeout\(\s*initialUserHydration/s);
  assert.match(mainSource, /markInitialUserHydrationReady\(\);\s*updateProfileBadge\(\)/s);
});

test('admin premium overrides survive RevenueCat synchronization', () => {
  assert.match(authSource, /httpsCallable\(functions, "adminSetPremium"\)/);
  assert.match(functionsSource, /premiumOverride: isPremium/);
  assert.match(functionsSource, /manualPremium = userSnap\.data\(\)\?\.premiumOverride === true/);
  assert.match(functionsSource, /isAdmin \|\| isReviewer \|\| manualPremium/);
});

test('admin pages require an explicit per-tab Google authorization gate', () => {
  assert.match(adminGuardSource, /sessionStorage\.getItem\(ADMIN_SESSION_KEY\)/);
  assert.match(adminGuardSource, /currentUserIsAdmin\(\)/);
  assert.match(adminGuardSource, /Google ile güvenli giriş/);
  assert.match(adminGuardSource, /logoutUser\(\)/);
  assert.match(adminHtml, /html:not\(\.admin-authorized\)/);
});

test('admin mutations are validated by callable server operations', () => {
  assert.match(authSource, /httpsCallable\(functions, "adminSetPremium"\)/);
  assert.match(authSource, /httpsCallable\(functions, "adminDeleteUser"\)/);
  assert.match(functionsSource, /exports\.adminSetPremium = onCall/);
  assert.match(functionsSource, /validatedAdminTarget\(request\)/);
  assert.match(functionsSource, /uid === adminUid/);
  assert.match(functionsSource, /targetUser\?\.customClaims\?\.admin === true/);
  assert.match(functionsSource, /deleteUserData\(uid\)/);
  assert.match(functionsSource, /exports\.adminGetUserHistory = onCall/);
  assert.match(functionsSource, /exports\.adminListUsers = onCall/);
  assert.match(functionsSource, /getAuth\(\)\.listUsers\(1000, pageToken\)/);
  assert.match(functionsSource, /db\.doc\(`users\/\$\{user\.uid\}`\)/);
  assert.match(functionsSource, /authUserCount: authUsers\.length/);
  assert.match(functionsSource, /exports\.adminUpdateAppSettings = onCall/);
  assert.match(authSource, /callAdminFunction\("adminListUsers"\)/);
  assert.match(authSource, /callAdminFunction\("adminUpdateAppSettings"/);
});

test('server settings and trusted history are authoritative', () => {
  assert.match(functionsSource, /settings\/app_config/);
  assert.match(functionsSource, /premiumDailyLimit/);
  assert.match(functionsSource, /limits: serverSettings/);
  assert.match(mainSource, /const serverLimits = serverState\.limits \|\| \{\}/);
  assert.match(mainSource, /configVersion: Math\.max\(Number\(serverLimits\.configVersion\)/);
  assert.match(authSource, /APP_SETTINGS_CACHE_KEY = `app-settings:\$\{firebaseConfig\.projectId\}`/);
  assert.match(functionsSource, /users\/\$\{uid\}\/fortunes\/\$\{requestId\}/);
  assert.match(authSource, /fortuneItem\?\.requestId/);
  assert.match(authSource, /getMyFortuneHistory/);
  assert.match(functionsSource, /async function syncUserEmailDirectory/);
  assert.match(functionsSource, /user_directory\/\$\{emailId\}/);
  assert.match(functionsSource, /await syncUserEmailDirectory\(uid, userData\)/);
  assert.doesNotMatch(functionsSource, /onDocumentWritten/);
  assert.match(html, /id="label-profile-sun"/);
});

test('anonymous users remain local except for expiring reward security ledgers', () => {
  assert.match(authSource, /if \(!user \|\| user\.isAnonymous\) return null/);
  assert.match(authSource, /if \(!user \|\| user\.isAnonymous\) return false/);
  assert.match(mainSource, /accountStateCache\?\.isPremium === true/);
  assert.match(functionsSource, /isAnonymousRequest\(request\)/);
  assert.match(functionsSource, /reason: "anonymous-local-only"/);
  assert.match(functionsSource, /persistHistory: isPremium/);
  assert.match(functionsSource, /if \(persistHistory\)/);
  assert.match(functionsSource, /anonymousAuthCount: anonymousAuthUids\.size/);
  assert.match(functionsSource, /expireAt: expiresAfter\(REQUEST_RETENTION_MS\)/);
  assert.match(functionsSource, /expireAt: expiresAfter\(AD_TRANSACTION_RETENTION_MS\)/);
});

test('anonymous UI uses configurable limits and keeps device history without a UID', () => {
  const historySource = fs.readFileSync(
    new URL('./historyStore.js', import.meta.url),
    'utf8',
  );
  assert.match(mainSource, /t\('freeAllowance', \{ limit: freeLimit \}\)/);
  assert.match(mainSource, /updateProfileMembershipStatus\(true\)/);
  assert.match(mainSource, /auth\.currentUser && !auth\.currentUser\.isAnonymous/);
  assert.match(historySource, /HISTORY_LOCAL_KEY = 'fortune_cookie_history_v2'/);
  assert.match(historySource, /localStorage\.setItem\(HISTORY_LOCAL_KEY/);
  assert.match(historySource, /History file mirror could not be written/);
});

test('reward progress reopens after a consumed credit until nine daily ads', () => {
  const adSource = fs.readFileSync(new URL('./adManager.js', import.meta.url), 'utf8');
  assert.match(adSource, /DEFAULT_DAILY_AD_LIMIT = 9/);
  assert.match(adSource, /watchedToday % adsPerCredit/);
  assert.match(adSource, /canEarnMore/);
  assert.match(mainSource, /qCount < 1 &&\s*progress\.canEarnMore/);
});

test('premium delivery starts from approved content with a safe AI adaptation fallback', () => {
  assert.match(functionsSource, /selectApprovedContent\(\{/);
  assert.match(functionsSource, /let prediction = selectedContent\.text/);
  assert.match(functionsSource, /provider = "FortuneCookieAI-Curated"/);
  assert.match(functionsSource, /variantType = "approved-fallback"/);
  assert.match(functionsSource, /variantType = "ai-adaptation"/);
});

test('all runtime Firebase clients are locked to the production project', () => {
  assert.match(authSource, /EXPECTED_FIREBASE_PROJECT_ID = "fortunecookieai-prod"/);
  assert.match(appStoreCheckSource, /expectedFirebaseIosAppId = '1:53381061591:ios:a47ef8928c618a83d04992'/);
  assert.doesNotMatch(authSource, /atonumus-fortunecookie/);
});

test('Google and Apple sign-in controls are enabled provider buttons', () => {
  assert.match(html, /id="btn-signin-google"/);
  assert.match(html, /id="btn-signin-apple"/);
  assert.doesNotMatch(html, /id="btn-signin-apple"[^>]*disabled/);
});

test('successful social credentials render the authenticated account without waiting for cloud sync', () => {
  assert.match(mainSource, /function renderAuthenticatedAccount/);
  assert.match(mainSource, /renderAuthenticatedAccount\(res\.user, \{ closeProfile: true \}\)/);
  assert.match(mainSource, /authLoggedBox\?\.classList\.remove\('hidden'\)/);
  assert.match(mainSource, /modalProfile\?\.classList\.add\('hidden'\)/);
  assert.match(authSource, /Auth profile hydration timed out; rendering the signed-in user immediately/);
  assert.match(authSource, /signInWithCredential\(auth, credential\)/);
});

test('email authentication requires verification and preserves anonymous registration state', () => {
  assert.match(html, /id="input-auth-email"/);
  assert.match(html, /id="input-auth-password"/);
  assert.match(html, /id="btn-email-login"/);
  assert.match(html, /id="btn-email-register"/);
  assert.match(html, /id="btn-email-reset"/);
  assert.match(authSource, /EmailAuthProvider\.credential/);
  assert.match(authSource, /linkWithCredential\(auth\.currentUser, credential\)/);
  assert.match(authSource, /sendEmailVerification/);
  assert.match(authSource, /emailVerified/);
  assert.match(authSource, /sendPasswordResetEmail/);
});

test('history deletion is available only from the profile confirmation flow', () => {
  assert.doesNotMatch(html, /id="btn-clear-history"/);
  assert.match(html, /id="btn-delete-history"/);
  assert.match(html, /id="modal-delete-history"/);
  assert.match(html, /id="btn-confirm-delete-history"/);
});

test('fortune requests preserve every supported interface language', () => {
  for (const language of ['tr', 'en', 'de', 'fr', 'es', 'it', 'el', 'ko', 'ja', 'zh']) {
    assert.match(authSource, new RegExp(`"${language}"`));
  }
  assert.match(authSource, /lang:\s*requestedLanguage/);
  assert.doesNotMatch(authSource, /lang:\s*lang === "tr" \? "tr" : "en"/);
});
