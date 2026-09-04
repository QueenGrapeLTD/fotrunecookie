import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeProfile } from './profileSchema.js';

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

test('cloud profile merge preserves explicit astrology consent values and safe legacy defaults', () => {
  const source = functionBody(main, 'mergeCloudProfile', 'renderProfileInputs');
  const mergeCloudProfile = new Function(
    'normalizeProfile',
    'currentLang',
    `${source}; return mergeCloudProfile;`,
  )(normalizeProfile, 'tr');
  const optedInLocal = normalizeProfile({
    zodiac: 'scorpio',
    risingSign: 'aries',
    astrologyOptIn: true,
    risingSource: 'manual',
  });

  const explicitlyDisabled = mergeCloudProfile(optedInLocal, {
    astrologyOptIn: false,
    risingSource: '',
  });
  assert.equal(explicitlyDisabled.astrologyOptIn, false);
  assert.equal(explicitlyDisabled.risingSource, '');

  const cloudAbsent = mergeCloudProfile(optedInLocal, {});
  assert.equal(cloudAbsent.astrologyOptIn, true);
  assert.equal(cloudAbsent.risingSource, 'manual');

  const legacy = mergeCloudProfile(normalizeProfile({
    birthtime: '12:00',
    zodiac: 'scorpio',
    risingSign: 'aries',
  }), {});
  assert.equal(legacy.astrologyOptIn, false);
  assert.equal(legacy.risingSource, '');
});

test('profile modal edits a draft and close discards it', () => {
  const categories = functionBody(main, 'renderCategoryPills', 'triggerCrumbExplosion');
  assert.match(categories, /profileDraft\.category = catId/);
  assert.doesNotMatch(categories, /userProfile\.category = catId/);
  const setup = functionBody(main, 'setupEventListeners');
  assert.match(setup, /beginProfileDraft\(\);\s*modalProfile\.classList\.remove/);
  assert.match(setup, /discardProfileDraft\(\{ closeModal: true \}\)/);
  assert.match(setup, /profileDraft\.risingSign = e\.target\.value/);
  assert.match(setup, /profileDraft\.risingSource = e\.target\.value \? 'manual' : ''/);
  assert.match(setup, /profileDraftRisingSelectionTouched = true/);
  assert.doesNotMatch(setup, /userProfile\.risingSign = e\.target\.value/);
  const beginDraft = functionBody(main, 'beginProfileDraft', 'discardProfileDraft');
  assert.match(beginDraft, /profileDraftManualRising = profileDraft\.risingSource === 'manual'/);
  const birthDraft = functionBody(main, 'updateDraftBirthFields');
  assert.match(birthDraft, /clearRising && !profileDraftManualRising/);
});

test('optional astrology saves manual rising independently and calculates only complete automatic input', () => {
  const save = functionBody(main, 'handleSaveProfile', 'handleClearHistory');
  assert.match(save, /const dependenciesChanged = birthDependencyKey\(candidate\) !== birthDependencyKey\(userProfile\)/);
  assert.match(save, /candidate\.zodiac = calculatedSun\?\.id \|\| ''/);
  assert.match(save, /if \(profileDraftRisingSelectionTouched\) \{\s*candidate\.risingSign = selectedRising;\s*candidate\.risingSource = selectedRising \? 'manual' : ''/s);
  assert.match(save, /else if \(profileDraftManualRising\) \{\s*candidate\.risingSign = selectedRising;\s*candidate\.risingSource = selectedRising \? 'manual' : ''/s);
  assert.match(save, /completeRisingInputs && dependenciesChanged/);
  assert.match(save, /candidate\.risingSource = candidate\.risingSign \? 'calculated' : ''/);
  assert.match(save, /dependenciesChanged && !completeRisingInputs/);
  assert.match(save, /candidate\.risingSign = '';\s*candidate\.risingSource = ''/s);
  assert.match(save, /calculateRisingSign\(/);
  assert.match(save, /const astrologyChanged = profileDraftRisingSelectionTouched \|\| dependenciesChanged/);
  assert.match(save, /if \(!hasAstrologyInput\) \{\s*candidate\.astrologyOptIn = false/s);
  assert.match(save, /else if \(astrologyChanged\) \{\s*candidate\.astrologyOptIn = Boolean\(candidate\.zodiac \|\| candidate\.risingSign\)/s);
  assert.doesNotMatch(save, /candidate\.astrologyOptIn = true/);
  assert.match(save, /const savedProfile = await saveProfile\(normalizedCandidate, ownerUid\)/);
  assert.ok(save.indexOf('replaceAuthoritativeProfile(savedProfile') > save.indexOf('await saveProfile'));
  assert.doesNotMatch(main, /unlockAIRisingSign|btn-unlock-rising-free|ai-rising-unlock-panel/);
});

test('optional astrology is collapsed by default and is not stripped on iOS', () => {
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  assert.match(html, /<details class="profile-section profile-section-birth astro-personalization-details">/);
  assert.match(html, /<summary class="profile-section-heading astro-personalization-summary">/);
  assert.doesNotMatch(html, /profile-section-birth astro-personalization-details" open/);
  assert.match(html, /id="input-profile-birthtime" class="input-text" \/>/);
  assert.doesNotMatch(html, /feat-rising-1|Yükselen Burç Analizi/);
  const capture = functionBody(main, 'captureFortuneRequestContext', 'premiumRequestMatchesContext');
  assert.match(capture, /normalizeProfile\(\s*userProfile,\s*language,?\s*\)/s);
  assert.doesNotMatch(capture, /Capacitor|getFortuneProfileForPlatform/);
  assert.match(main, /inputProfileBirthtime\.value = profile\.birthtime \|\| ''/);
  assert.doesNotMatch(css, /html\.platform-ios \.profile-section-birth/);
  assert.doesNotMatch(main, /isIOSPlatform|getFortuneProfileForPlatform/);
});

test('astrology presentation requires the same explicit opt-in as fortune context', () => {
  const profileBadge = functionBody(main, 'updateProfileBadge', 'checkAndShowAnniversaryReminder');
  assert.match(profileBadge, /const astrologyEnabled = userProfile\.astrologyOptIn === true/);
  assert.match(profileBadge, /astrologyEnabled && userProfile\.risingSign/);
  const render = functionBody(main, 'renderFortuneResult', 'resetCookieTapProgress');
  assert.match(render, /requestProfile\.astrologyOptIn === true && requestProfile\.zodiac/);
  assert.match(render, /lastGeneratedFortune\.zodiacId = null/);
  const language = functionBody(main, 'updateLanguageUI');
  assert.match(language, /userProfile\.astrologyOptIn === true && userProfile\.zodiac/);
  const story = functionBody(main, 'openStoryModal', 'syncStartupAccountUI');
  assert.match(story, /userProfile\.astrologyOptIn === true && userProfile\.zodiac/);
  assert.match(story, /const storyZodiacIcon = zObj \? zObj\.icon : '🥠'/);
  assert.match(story, /:\s*'Fortune'/);
  assert.match(story, /zodiacIcon: storyZodiacIcon/);
  assert.match(story, /zodiacName: storyZodiacName/);
  assert.doesNotMatch(story, /zodiacIcon: lastGeneratedFortune\.zodiacIcon|zodiacName: lastGeneratedFortune\.zodiacName/);
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
