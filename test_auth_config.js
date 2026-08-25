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
const firebaseHostingConfig = JSON.parse(
  fs.readFileSync(new URL('./firebase.json', import.meta.url), 'utf8'),
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
  assert.equal(capacitorConfig.plugins.FirebaseAuthentication.skipNativeAuth, false);
  assert.match(authSource, /signInWithCustomToken/);
  assert.match(authSource, /FirebaseAuthentication\.getIdToken/);
  assert.match(authSource, /httpsCallable\(\s*functions,\s*"exchangeNativeAuthToken"/);
  assert.match(authSource, /nativeIdToken:\s*tokenResult\.token/);
  assert.match(authSource, /result\.user\.uid !== nativeUid/);
  assert.match(authSource, /useCredentialManager:\s*true/);
  assert.match(authSource, /isRetryableGoogleNetworkError/);
  assert.match(authSource, /attempt < 2/);
  assert.match(authSource, /auth\/network-request-failed/);
  assert.match(authSource, /Credential Manager compatibility failure; trying legacy Google Sign-In/);
  assert.match(authSource, /useCredentialManager:\s*false/);
  assert.match(authSource, /skipNativeAuth:\s*true/);
  assert.match(authSource, /GoogleAuthProvider\.credential\(idToken\)/);
  assert.match(authSource, /signInWithCredential\(auth, credential\)/);
  assert.match(authSource, /preserveNativeAppleDisplayName/);
  assert.match(authSource, /nativeResult\?\.user\?\.displayName/);
  assert.match(authSource, /auth\/native-google-failed/);
  assert.match(authSource, /waitForAuthPersistenceAfterNativeCredential/);
  const nativeSignInSource = authSource.slice(
    authSource.indexOf('async function signInNatively'),
    authSource.indexOf('export async function signInWithGoogle'),
  );
  assert.ok(
    nativeSignInSource.indexOf('FirebaseAuthentication.signInWithApple') <
      nativeSignInSource.indexOf('bridgeNativeSessionIntoWebView'),
  );
  assert.match(nativeSignInSource, /return signInGoogleCredentialIntoWebView\(nativeResult\)/);
  assert.match(authSource, /FirebaseAuthentication\.signOut/);
});

test('iOS target is entitled and configured for Sign in with Apple', () => {
  assert.match(iosEntitlements, /com\.apple\.developer\.applesignin/);
  assert.match(iosEntitlements, /<string>Default<\/string>/);
  assert.match(xcodeProject, /CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements/);
  assert.match(xcodeProject, /com\.apple\.SignInWithApple/);
  const buildNumbers = [...xcodeProject.matchAll(/CURRENT_PROJECT_VERSION = (\d+)/g)]
    .map(match => Number(match[1]));
  assert.ok(buildNumbers.length >= 2 && buildNumbers.every(value => value >= 13));
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

test('rapid cookie taps do not trigger iOS double-tap page zoom', () => {
  assert.match(styles, /\.cookie-wrapper\s*\{[^}]*touch-action:\s*manipulation/s);
  assert.match(styles, /\.cookie-wrapper\s*\{[^}]*-webkit-touch-callout:\s*none/s);
  assert.match(html, /id="cookie-interactive"/);
  assert.match(mainSource, /event\?\.cancelable/);
  assert.match(mainSource, /addEventListener\('dblclick'/);
  assert.match(mainSource, /event\.preventDefault\(\)/);
});

test('mobile sessions restore locally before creating a new anonymous user', () => {
  assert.match(authSource, /setPersistence\(auth,\s*browserLocalPersistence\)/);
  assert.match(authSource, /const restoredUser = await initialAuthState/);
  assert.match(authSource, /ACCOUNT_STATE_CACHE_MS = 30 \* 1000/);
  assert.match(authSource, /PROFILE_CACHE_MS = 15 \* 60 \* 1000/);
  assert.match(authSource, /APP_SETTINGS_CACHE_MS = 5 \* 60 \* 1000/);
  assert.match(authSource, /cachedProfileMatchesUser/);
  assert.match(authSource, /authProvider/);
});

test('returning social users do not leave orphan anonymous Auth accounts', () => {
  assert.match(authSource, /const anonymousUser = auth\.currentUser/);
  assert.match(authSource, /deleteUser\(anonymousUser\)/);
  assert.match(authSource, /Anonymous account cleanup/);
  assert.match(authSource, /linkWithCredential\(anonymousUser, credential\)/);
  assert.match(authSource, /signInWithCredential\(auth, credential\)/);
  assert.match(authSource, /signInWithCustomToken\(auth, customToken\)/);
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
  assert.match(functionsSource, /authUser\?\.metadata\?\.lastSignInTime/);
  assert.match(functionsSource, /new Date\(authLastLogin \|\| 0\)\.getTime\(\)/);
  assert.match(functionsSource, /exports\.adminUpdateAppSettings = onCall/);
  assert.match(authSource, /callAdminFunction\("adminListUsers"\)/);
  assert.match(adminHtml, /id="btn-refresh-users"/);
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

test('reward progress reopens after a consumed credit until three daily presentations', () => {
  const adSource = fs.readFileSync(new URL('./adManager.js', import.meta.url), 'utf8');
  assert.match(adSource, /DEFAULT_DAILY_AD_LIMIT = 3/);
  assert.match(adSource, /watchedToday % adsPerCredit/);
  assert.match(adSource, /canEarnMore/);
  assert.match(mainSource, /qCount < 1 &&\s*progress\.canEarnMore/);
});

test('profile actions remain above the native banner safe area', () => {
  assert.match(styles, /html\.native-ad-banner-visible \.modal-overlay/);
  assert.match(styles, /html\.native-ad-banner-visible \.profile-modal-box/);
  assert.match(styles, /var\(--native-ad-banner-height, 50px\)/);
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
  assert.doesNotMatch(authSource, /atonumus-fortunecookie/);
});

test('public hosting excludes the mobile app and isolates the admin bundle', () => {
  const publicHosting = firebaseHostingConfig.hosting.find((item) => item.target === 'public');
  const adminHosting = firebaseHostingConfig.hosting.find((item) => item.target === 'admin');
  assert.equal(publicHosting.public, 'dist-public');
  assert.equal(adminHosting.public, 'dist-admin');
  assert.deepEqual(publicHosting.predeploy, ['npm run build:hosting']);
  assert.deepEqual(adminHosting.predeploy, ['npm run build:hosting']);
  assert.equal(adminHosting.rewrites[0].destination, '/admin.html');
  const hostingBuilder = fs.readFileSync(
    new URL('./scripts/build-hosting-sites.js', import.meta.url),
    'utf8',
  );
  assert.match(hostingBuilder, /mobile-only\.html/);
  assert.doesNotMatch(hostingBuilder, /copyFileSync\(resolve\(root, 'index\.html'/);
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
  assert.match(authSource, /Anonymous account cleanup/);
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
