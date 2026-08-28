import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const firebase = fs.readFileSync(new URL('./firebaseService.js', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
const netlify = fs.readFileSync(new URL('./netlify.toml', import.meta.url), 'utf8');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} is missing`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  return source.slice(start, end < 0 ? source.length : end);
}

test('fortune access waits for current profile hydration before entitlement and context capture', () => {
  const crack = functionBody(main, 'crackCookie', 'resetToLanding');
  const hydration = crack.indexOf('await waitForCurrentProfileHydration()');
  const entitlement = crack.indexOf('getVerifiedAccountState(true)');
  const capture = crack.indexOf('captureFortuneRequestContext()');
  assert.ok(hydration >= 0 && hydration < entitlement);
  assert.ok(entitlement < capture);
  assert.match(main, /completeProfileHydration\(expectedAuthContext\)/);
});

test('fortune request context is immutable and stale completions cannot render or save', () => {
  const capture = functionBody(main, 'captureFortuneRequestContext', 'assertFortuneRequestContextCurrent');
  assert.match(capture, /Object\.freeze\(\{/);
  for (const field of ['authContext', 'authUid', 'isAnonymous', 'ownerUid', 'language', 'profileRevision']) {
    assert.match(capture, new RegExp(`\\b${field}\\b`));
  }
  assert.match(capture, /categories: Object\.freeze/);
  const validator = functionBody(main, 'assertFortuneRequestContextCurrent', 'mergeCloudProfile');
  assert.match(validator, /authContextKey\(\) !== requestContext\.authContext/);
  assert.match(validator, /currentLang !== requestContext\.language/);
  assert.match(validator, /profileRevision !== requestContext\.profileRevision/);
  assert.match(validator, /app\/stale-fortune-context/);
  const render = functionBody(main, 'renderFortuneResult', 'resetCookieTapProgress');
  assert.ok((render.match(/assertFortuneRequestContextCurrent\(requestContext\)/g) || []).length >= 2);
  assert.match(main, /Eski sonuç kaydedilmedi/);
});

test('profile modal edits a draft and close discards it', () => {
  const categories = functionBody(main, 'renderCategoryPills', 'triggerCrumbExplosion');
  assert.match(categories, /profileDraft\.category = catId/);
  assert.doesNotMatch(categories, /userProfile\.category = catId/);
  const setup = functionBody(main, 'setupEventListeners');
  assert.match(setup, /beginProfileDraft\(\);\s*modalProfile\.classList\.remove/);
  assert.match(setup, /discardProfileDraft\(\{ closeModal: true \}\)/);
  assert.match(setup, /profileDraft\.risingSign = e\.target\.value/);
  assert.doesNotMatch(setup, /userProfile\.risingSign = e\.target\.value/);
});

test('profile save is the sole commit and clears or recalculates stale signs', () => {
  const save = functionBody(main, 'handleSaveProfile', 'handleClearHistory');
  assert.match(save, /const dependenciesChanged = birthDependencyKey\(candidate\) !== birthDependencyKey\(userProfile\)/);
  assert.match(save, /candidate\.zodiac = calculatedSun\?\.id \|\| ''/);
  assert.match(save, /if \(!completeRisingInputs\) \{\s*candidate\.risingSign = ''/s);
  assert.match(save, /dependenciesChanged \|\| !candidate\.risingSign/);
  assert.match(save, /calculateRisingSign\(/);
  assert.match(save, /const savedProfile = await saveProfile\(normalizedCandidate, ownerUid\)/);
  assert.ok(save.indexOf('replaceAuthoritativeProfile(savedProfile') > save.indexOf('await saveProfile'));
  const unlock = functionBody(main, 'unlockAIRisingSign', 'updateProfileBadge');
  assert.match(unlock, /profileDraft\.risingSign = calculatedRising\.id/);
  assert.doesNotMatch(unlock, /saveProfile|syncUserWithDatabase/);
});

test('explicit language changes persist in sequence and win over older same-owner hydration', () => {
  const language = functionBody(main, 'setLanguage', 'updateLanguageUI');
  assert.match(language, /sequence = \+\+languageSelectionVersion/);
  assert.match(language, /explicitLanguageByAuthContext\.set/);
  assert.match(language, /languagePersistenceQueue = languagePersistenceQueue/);
  assert.match(language, /saveProfile\(profileSnapshot, selectedOwnerUid\)/);
  assert.match(language, /syncUserWithDatabase\(selectedUser, savedProfile\)/);
  const authHydration = main.slice(main.indexOf('// Firebase Auth State Observer'));
  assert.match(authHydration, /explicitLanguageByAuthContext\.get\(expectedAuthContext\)\?\.lang/);
  assert.match(authHydration, /applyHydratedLanguage\(profileLanguage\)/);
  assert.doesNotMatch(authHydration, /setLanguage\(profileLanguage\)/);
});

test('initial account profile sync bypasses the fifteen-minute cache', () => {
  assert.match(firebase, /syncUserWithDatabase\(user, profileData = \{\}, options = \{\}\)/);
  assert.match(firebase, /const forceFresh = options\?\.forceFresh === true/);
  assert.match(firebase, /!hasProfileUpdates && !forceFresh/);
  assert.match(firebase, /syncUserWithDatabase\(user, \{\}, \{ forceFresh: true \}\)/);
  assert.match(firebase, /callback\(user, null, \{ profileHydrationPending: true \}\)/);
  assert.match(main, /if \(!profileHydrationPending\) completeProfileHydration\(expectedAuthContext\)/);
});

test('history sharing preserves the selected fortune content', () => {
  assert.match(main, /quote: item\.quote/);
  assert.match(main, /numbers: item\.numbers \|\|/);
  assert.match(main, /requestId: item\.requestId \|\| ''/);
  assert.match(main, /contentSource: item\.contentSource \|\| ''/);
});

test('full SPA CSP permits both birth-location services', () => {
  const csp = vercel.headers[0].headers.find((header) => header.key === 'Content-Security-Policy')?.value || '';
  for (const origin of ['https://photon.komoot.io', 'https://api.open-meteo.com']) {
    assert.match(csp, new RegExp(origin.replaceAll('.', '\\.')));
    assert.match(netlify, new RegExp(origin.replaceAll('.', '\\.')));
  }
});
