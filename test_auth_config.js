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
  assert.match(authSource, /useCredentialManager:\s*true/);
  assert.match(authSource, /isRetryableGoogleNetworkError/);
  assert.match(authSource, /attempt < 2/);
  assert.match(authSource, /auth\/network-request-failed/);
  assert.match(authSource, /Credential Manager compatibility failure; trying legacy Google Sign-In/);
  assert.match(authSource, /useCredentialManager:\s*false/);
  assert.match(authSource, /skipNativeAuth:\s*true/);
  assert.match(authSource, /auth\/native-google-failed/);
  assert.doesNotMatch(
    authSource,
    /GoogleAuthProvider\.credential\(\s*nativeCredential\.idToken,\s*nativeCredential\.accessToken/,
  );
});

test('mobile sessions restore locally before creating a new anonymous user', () => {
  assert.match(authSource, /setPersistence\(auth,\s*browserLocalPersistence\)/);
  assert.match(authSource, /const restoredUser = await initialAuthState/);
  assert.match(authSource, /ACCOUNT_STATE_CACHE_MS = 5 \* 60 \* 1000/);
  assert.match(authSource, /PROFILE_CACHE_MS = 15 \* 60 \* 1000/);
  assert.match(authSource, /APP_SETTINGS_CACHE_MS = 5 \* 60 \* 1000/);
  assert.match(authSource, /cachedProfileMatchesUser/);
  assert.match(authSource, /authProvider/);
});

test('returning social users do not leave orphan anonymous Auth accounts', () => {
  assert.match(authSource, /const anonymousUser = auth\.currentUser/);
  assert.match(authSource, /deleteUser\(anonymousUser\)/);
  assert.match(authSource, /auth\/credential-already-in-use/);
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
});

test('server settings and trusted history are authoritative', () => {
  assert.match(functionsSource, /settings\/app_config/);
  assert.match(functionsSource, /premiumDailyLimit/);
  assert.match(functionsSource, /users\/\$\{uid\}\/fortunes\/\$\{requestId\}/);
  assert.match(authSource, /fortuneItem\?\.requestId/);
  assert.match(authSource, /getMyFortuneHistory/);
});

test('Google and Apple sign-in controls are enabled provider buttons', () => {
  assert.match(html, /id="btn-signin-google"/);
  assert.match(html, /id="btn-signin-apple"/);
  assert.doesNotMatch(html, /id="btn-signin-apple"[^>]*disabled/);
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
