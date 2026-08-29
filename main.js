import { zodiacSigns, categories, fortunes, uiText, getRandomFortune } from './fortunes.js';
import { fetchRemoteAIPrediction } from './aiEngine.js';
import { soundManager } from './audio.js';
import { generateStoryCardCanvas } from './cardExporter.js';
import {
  getProfile,
  saveProfile,
  getHistory,
  saveFortuneToHistory,
  mergeHistoryFromCloud,
  clearHistory,
  checkAnniversaryFortunes
} from './historyStore.js';
import { calculateRisingSign, calculateSunSign } from './astrologyCalc.js';
import {
  resolveBirthLocation,
  calculateUtcOffsetForLocalDate
} from './locationService.js';
import { adManager } from './adManager.js';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import {
  initRevenueCat,
  purchasePackage,
  checkPremiumEntitlement,
  restorePurchases,
  identifyRevenueCatUser,
  logoutRevenueCatUser
} from './revenueCatService.js';
import {
  loginWithGoogle,
  loginWithApple,
  loginWithEmail,
  registerWithEmail,
  resetEmailPassword,
  logoutUser,
  onAuthChange,
  auth,
  syncUserWithDatabase,
  syncFortuneToCloud,
  getCloudFortuneHistory,
  clearCloudFortuneHistory,
  getAccountStateFromServer,
  getAppSettingsFromCloud,
  ensureFreemiumSession,
  waitForInitialAuth,
  deleteMyAccountFromCloud,
  trackFortuneEvent
} from './firebaseService.js';
import { escapeHtml, localDayKey } from './securityUtils.js';
import { DEFAULT_PROFILE, normalizeProfile } from './profileSchema.js';
import { SUPPORTED_LANGUAGES, normalizeLanguage, translate } from './i18n.js';

const supportedLanguages = SUPPORTED_LANGUAGES;

function triggerHapticFeedback(intensity = 1) {
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
      window.Capacitor.Plugins.Haptics.impact({ style: intensity >= 3 ? 'HEAVY' : 'MEDIUM' });
      return;
    }
  } catch (e) {}

  if (navigator.vibrate) {
    if (intensity === 1) {
      navigator.vibrate(35);
    } else if (intensity === 2) {
      navigator.vibrate(60);
    } else {
      navigator.vibrate([70, 40, 110]);
    }
  }
}

function detectDeviceLanguage() {
  const savedLang = localStorage.getItem('app_language');
  if (savedLang && supportedLanguages.includes(savedLang)) {
    return savedLang;
  }

  const deviceLanguages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || navigator.userLanguage || 'en'];
  for (const deviceLanguage of deviceLanguages) {
    const normalized = normalizeLanguage(deviceLanguage, '');
    if (normalized) return normalized;
  }

  return 'en';
}

let currentLang = detectDeviceLanguage();
let userProfile = normalizeProfile(
  { ...DEFAULT_PROFILE, preferredLanguage: currentLang },
  currentLang,
);
let isAnimating = false;
let fortuneRequestInFlight = false;
let cookieTapCount = 0;
let appSettings = {
  freeDailyLimit: 1,
  premiumDailyLimit: 5
};
let accountStateCache = null;
let authUiVersion = 0;
let profileRevision = 0;
let profileDraft = null;
let profileDraftManualRising = false;
let languageSelectionVersion = 0;
let languagePersistenceQueue = Promise.resolve();
const explicitLanguageByAuthContext = new Map();
let hydratedProfileAuthContext = 'uninitialized';
let activeProfileHydration = {
  authContext: 'uninitialized',
  promise: Promise.resolve(),
  resolve: () => {},
};
const profileHydrationListeners = new Set();
const isIOSPlatform = Capacitor.getPlatform() === 'ios';

function getFortuneProfileForPlatform(profile = userProfile) {
  if (!isIOSPlatform) return profile;
  return {
    ...profile,
    birthdate: '',
    birthtime: '',
    birthplace: '',
    zodiac: '',
    risingSign: '',
  };
}

let lastGeneratedFortune = {
  quote: '',
  numbers: [],
  zodiacName: '',
  zodiacIcon: '',
  contentId: '',
  contentCategory: '',
  contentSource: '',
  variantType: '',
  requestId: '',
  cloudPersisted: false,
};

function recordFortuneEvent(eventType) {
  if (!lastGeneratedFortune.contentId) return;
  void trackFortuneEvent({
    eventType,
    contentId: lastGeneratedFortune.contentId,
    requestId: lastGeneratedFortune.requestId,
    lang: currentLang,
  });
}

// DOM Elements
const stateLanding = document.getElementById('state-landing');
const stateResult = document.getElementById('state-result');

const selectLanguage = document.getElementById('select-language');
const btnSoundToggle = document.getElementById('btn-sound-toggle');
const soundIcon = document.getElementById('sound-icon');

const cookieInteractive = document.getElementById('cookie-interactive');
const crumbCanvas = document.getElementById('crumb-canvas');
const appTitleText = document.getElementById('app-title-text');
const subtitleText = document.getElementById('subtitle-text');
const pillText = document.getElementById('pill-text');

// User Profile Badge
const userProfileBadge = document.getElementById('user-profile-badge');
const badgeUserName = document.getElementById('badge-user-name');
const badgeUserZodiac = document.getElementById('badge-user-zodiac');
const badgeUserRising = document.getElementById('badge-user-rising');

// Modals
const btnOpenProfile = document.getElementById('btn-open-profile');
const modalProfile = document.getElementById('modal-profile');
const btnCloseProfile = document.getElementById('btn-close-profile');
const inputProfileName = document.getElementById('input-profile-name');
const inputProfileBirthdate = document.getElementById('input-profile-birthdate');
const inputProfileBirthtime = document.getElementById('input-profile-birthtime');
const inputBirthCountry = document.getElementById('input-birth-country');
const inputBirthCity = document.getElementById('input-birth-city');
const inputBirthRegion = document.getElementById('input-birth-region');
const inputProfileLatitude = document.getElementById('input-profile-latitude');
const inputProfileLongitude = document.getElementById('input-profile-longitude');
const inputProfileTimezone = document.getElementById('input-profile-timezone');
const btnResolveLocation = document.getElementById('btn-resolve-location');
const locationLookupStatus = document.getElementById('location-lookup-status');
const risingSignBox = document.getElementById('rising-sign-box');
const badgeCalculatedRising = document.getElementById('badge-calculated-rising');
const zodiacGridContainer = document.getElementById('zodiac-grid-container');
const categoryPillsContainer = document.getElementById('category-pills-container');
const btnSaveProfile = document.getElementById('btn-save-profile');

const btnOpenHistory = document.getElementById('btn-open-history');
const modalHistory = document.getElementById('modal-history');
const btnCloseHistory = document.getElementById('btn-close-history');
const historyListContainer = document.getElementById('history-list-container');

// Result Card DOM
const cardTitleText = document.getElementById('card-title-text');
const fortuneQuoteText = document.getElementById('fortune-quote-text');
const luckyTitleText = document.getElementById('lucky-title-text');
const luckyNumbersContainer = document.getElementById('lucky-numbers-container');
const zodiacActiveBadge = document.getElementById('zodiac-active-badge');
const zodiacBadgeIcon = document.getElementById('zodiac-badge-icon');
const zodiacBadgeName = document.getElementById('zodiac-badge-name');
const zodiacBadgeRising = document.getElementById('zodiac-badge-rising');

const btnAgain = document.getElementById('btn-again');
const btnAgainText = document.getElementById('btn-again-text');
const btnStory = document.getElementById('btn-story');
const btnStoryText = document.getElementById('btn-story-text');

// Story Modal DOM
const modalStory = document.getElementById('modal-story');
const modalTitleText = document.getElementById('modal-title-text');
const storyPreviewWrapper = document.getElementById('story-preview-wrapper');
const btnCloseStory = document.getElementById('btn-close-story');

// Ad Elements
const btnWatchAdReward = document.getElementById('btn-watch-ad-reward');
const btnCloseAd = document.getElementById('btn-close-ad');

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

function setBootstrapStatus(message) {
  const status = document.getElementById('app-bootstrap-status');
  if (status) status.textContent = message;
}

function t(key, vars) {
  return translate(currentLang, key, vars);
}

function profileOwnerUid(user = auth.currentUser) {
  return user && !user.isAnonymous ? user.uid : null;
}

function authContextKey(user = auth.currentUser) {
  if (!user) return 'signed-out';
  return `${user.isAnonymous ? 'anonymous' : 'account'}:${user.uid}`;
}

function isCurrentAuthContext(expectedKey) {
  return authContextKey() === expectedKey;
}

function replaceAuthoritativeProfile(profile, fallbackLanguage = currentLang) {
  userProfile = normalizeProfile(profile, fallbackLanguage);
  profileRevision += 1;
  profileDraft = null;
  profileDraftManualRising = false;
  return userProfile;
}

function notifyProfileHydrationChange() {
  for (const listener of profileHydrationListeners) listener();
  profileHydrationListeners.clear();
}

function beginProfileHydration(expectedAuthContext) {
  activeProfileHydration.resolve();
  let resolveHydration;
  const promise = new Promise((resolve) => {
    resolveHydration = resolve;
  });
  activeProfileHydration = {
    authContext: expectedAuthContext,
    promise,
    resolve: resolveHydration,
  };
  notifyProfileHydrationChange();
}

function completeProfileHydration(expectedAuthContext) {
  if (activeProfileHydration.authContext !== expectedAuthContext) return;
  hydratedProfileAuthContext = expectedAuthContext;
  activeProfileHydration.resolve();
  notifyProfileHydrationChange();
}

async function waitForCurrentProfileHydration() {
  while (true) {
    const expectedAuthContext = authContextKey();
    if (hydratedProfileAuthContext === expectedAuthContext) return expectedAuthContext;
    if (activeProfileHydration.authContext === expectedAuthContext) {
      await activeProfileHydration.promise;
    } else {
      await new Promise((resolve) => profileHydrationListeners.add(resolve));
    }
    if (authContextKey() === expectedAuthContext && hydratedProfileAuthContext === expectedAuthContext) {
      return expectedAuthContext;
    }
  }
}

function captureFortuneRequestContext() {
  const user = auth.currentUser;
  const language = currentLang;
  const normalizedProfile = normalizeProfile(
    getFortuneProfileForPlatform(userProfile),
    language,
  );
  const immutableProfile = Object.freeze({
    ...normalizedProfile,
    categories: Object.freeze([...(normalizedProfile.categories || [])]),
  });
  return Object.freeze({
    authContext: authContextKey(user),
    authUid: user?.uid || null,
    isAnonymous: user?.isAnonymous === true,
    ownerUid: profileOwnerUid(user),
    language,
    profileRevision,
    profile: immutableProfile,
  });
}

function assertFortuneRequestContextCurrent(requestContext) {
  if (
    !requestContext ||
    authContextKey() !== requestContext.authContext ||
    currentLang !== requestContext.language ||
    profileRevision !== requestContext.profileRevision
  ) {
    const error = new Error('Fortune request context changed before completion.');
    error.code = 'app/stale-fortune-context';
    throw error;
  }
}

function mergeCloudProfile(localProfile, cloudProfile) {
  const merged = { ...localProfile };
  const fields = {
    displayName: 'name',
    birthdate: 'birthdate',
    birthtime: 'birthtime',
    birthplace: 'birthplace',
    birthCountry: 'birthCountry',
    birthCity: 'birthCity',
    birthRegion: 'birthRegion',
    timezoneId: 'timezoneId',
    risingSign: 'risingSign',
    zodiac: 'zodiac',
    latitude: 'latitude',
    longitude: 'longitude',
    timezoneOffset: 'timezoneOffset',
    category: 'category',
    categories: 'categories',
    preferredLanguage: 'preferredLanguage',
  };
  if (cloudProfile && typeof cloudProfile === 'object') {
    Object.entries(fields).forEach(([cloudKey, localKey]) => {
      if (Object.prototype.hasOwnProperty.call(cloudProfile, cloudKey)) {
        merged[localKey] = cloudProfile[cloudKey];
      }
    });
  }
  return normalizeProfile(merged, currentLang);
}

function renderProfileInputs(profile = userProfile) {
  if (inputProfileName) inputProfileName.value = profile.name || '';
  if (inputProfileBirthdate) inputProfileBirthdate.value = profile.birthdate || '';
  if (inputProfileBirthtime) inputProfileBirthtime.value = profile.birthtime || '12:00';
  if (inputBirthCountry) inputBirthCountry.value = profile.birthCountry || '';
  if (inputBirthCity) inputBirthCity.value = profile.birthCity || '';
  if (inputBirthRegion) inputBirthRegion.value = profile.birthRegion || '';
  if (inputProfileLatitude) {
    inputProfileLatitude.value = profile.latitude !== null && profile.latitude !== '' && Number.isFinite(Number(profile.latitude))
      ? String(profile.latitude)
      : '';
  }
  if (inputProfileLongitude) {
    inputProfileLongitude.value = profile.longitude !== null && profile.longitude !== '' && Number.isFinite(Number(profile.longitude))
      ? String(profile.longitude)
      : '';
  }
  if (inputProfileTimezone) {
    inputProfileTimezone.value = profile.timezoneOffset !== null && profile.timezoneOffset !== '' && Number.isFinite(Number(profile.timezoneOffset))
      ? String(profile.timezoneOffset)
      : '';
  }
  const selectProfileRising = document.getElementById('select-profile-rising');
  if (selectProfileRising) selectProfileRising.value = profile.risingSign || '';
  if (profile.birthplace && profile.timezoneId) {
    const offset = Number(profile.timezoneOffset);
    setLocationLookupStatus(
      `✓ ${profile.birthplace} · ${profile.timezoneId}${Number.isFinite(offset) ? ` · UTC${offset >= 0 ? '+' : ''}${offset}` : ''}`,
      'success',
    );
  } else {
    setLocationLookupStatus('Ülke ve şehir girerek doğum yerini doğrulayın.');
  }
}

function beginProfileDraft() {
  profileDraft = normalizeProfile({ ...userProfile }, currentLang);
  profileDraftManualRising = false;
  renderProfileInputs(profileDraft);
  renderCategoryPills(profileDraft);
  void updateAstrologyCalculations(profileDraft);
  return profileDraft;
}

function discardProfileDraft({ closeModal = false } = {}) {
  profileDraft = null;
  profileDraftManualRising = false;
  renderProfileInputs(userProfile);
  renderCategoryPills(userProfile);
  void updateAstrologyCalculations(userProfile);
  if (closeModal) modalProfile.classList.add('hidden');
}

function birthDependencyKey(profile = {}) {
  return [
    profile.birthdate,
    profile.birthtime,
    profile.birthCountry,
    profile.birthCity,
    profile.birthRegion,
    profile.timezoneId,
    profile.latitude,
    profile.longitude,
    profile.timezoneOffset,
  ].map(value => String(value ?? '').trim()).join('|');
}

function updateDraftBirthFields({ clearRising = false } = {}) {
  if (!profileDraft) return null;
  profileDraft.birthdate = inputProfileBirthdate?.value || '';
  profileDraft.birthtime = inputProfileBirthtime?.value || '';
  profileDraft.birthCountry = inputBirthCountry?.value.trim() || '';
  profileDraft.birthCity = inputBirthCity?.value.trim() || '';
  profileDraft.birthRegion = inputBirthRegion?.value.trim() || '';
  profileDraft.latitude = inputProfileLatitude?.value === ''
    ? null
    : Number(inputProfileLatitude?.value);
  profileDraft.longitude = inputProfileLongitude?.value === ''
    ? null
    : Number(inputProfileLongitude?.value);
  profileDraft.timezoneOffset = inputProfileTimezone?.value === ''
    ? null
    : Number(inputProfileTimezone?.value);
  const calculatedSun = calculateSunSign(profileDraft.birthdate);
  profileDraft.zodiac = calculatedSun?.id || '';
  if (clearRising) {
    profileDraft.risingSign = '';
    profileDraftManualRising = false;
    const risingSelect = document.getElementById('select-profile-rising');
    if (risingSelect) risingSelect.value = '';
  }
  return profileDraft;
}

let initialUserHydrationResolved = false;
let resolveInitialUserHydration;
const initialUserHydration = new Promise((resolve) => {
  resolveInitialUserHydration = resolve;
});

function markInitialUserHydrationReady() {
  if (initialUserHydrationResolved) return;
  initialUserHydrationResolved = true;
  resolveInitialUserHydration();
}

function finishBootstrap() {
  const loading = document.getElementById('app-bootstrap-loading');
  if (!loading) return;
  loading.classList.add('is-ready');
  window.setTimeout(() => loading.remove(), 350);
}

async function settleWithTimeout(promise, timeoutMs, label, fallbackValue) {
  let timeoutId;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((resolve) => {
        timeoutId = window.setTimeout(() => {
          console.warn(`${label} initialization timed out; continuing in degraded mode.`);
          resolve(fallbackValue);
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    console.warn(`${label} initialization failed; continuing in degraded mode.`, error);
    return fallbackValue;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

async function init() {
  try {
    document.documentElement.classList.toggle(
      'platform-android',
      Capacitor.getPlatform() === 'android',
    );
    document.documentElement.classList.toggle(
      'platform-ios',
      Capacitor.getPlatform() === 'ios',
    );

    setBootstrapStatus(t('bootstrapSettings'));
    const restoredUser = await settleWithTimeout(
      waitForInitialAuth(),
      1100,
      'Firebase auth restore',
      auth.currentUser,
    );
    replaceAuthoritativeProfile(await settleWithTimeout(
      getProfile(currentLang, profileOwnerUid(restoredUser)),
      800,
      'Profile',
      userProfile,
    ), currentLang);

    // Register the auth observer only after local profile hydration, so an
    // already signed-in user's cloud profile cannot be overwritten by a late
    // local read.
    setupEventListeners();

    setBootstrapStatus(t('bootstrapSession'));
    await settleWithTimeout(
      ensureFreemiumSession(),
      1200,
      'Firebase session',
      null,
    );

    // Native SDK setup must not block the first usable screen. Firebase's
    // persisted session and local caches are enough to hydrate the UI first.
    void Promise.all([
      settleWithTimeout(adManager.init(), 7000, 'AdMob', null),
      settleWithTimeout(initRevenueCat(), 7000, 'RevenueCat', null),
    ]).then(() => updateAdStatusUI()).catch(() => {});

    // Remote settings and account state refine the already usable local UI.
    // They must never hold the first screen behind a network-dependent gate.
    void settleWithTimeout(
      getAppSettingsFromCloud(),
      5000,
      'Cloud settings',
      appSettings,
    ).then((settings) => {
      appSettings = settings || appSettings;
      return updateAdStatusUI();
    }).catch(() => {});
    const profileLanguage = normalizeLanguage(userProfile?.preferredLanguage, '');
    if (profileLanguage && profileLanguage !== currentLang) {
      currentLang = profileLanguage;
      localStorage.setItem('app_language', currentLang);
      document.documentElement.lang = currentLang;
    }

    renderProfileInputs(userProfile);

    if (selectLanguage) selectLanguage.value = currentLang;
    updateProfileBadge();
    updateAstrologyCalculations();
    renderCategoryPills();
    updateLanguageUI();

    void settleWithTimeout(
      initialUserHydration,
      5000,
      'Initial account hydration',
      null,
    ).then(() => updateAdStatusUI()).catch(() => {});
  } catch (error) {
    console.error('Application bootstrap failed:', error);
  } finally {
    finishBootstrap();
    setTimeout(() => checkAndShowAnniversaryReminder(), 1000);
  }
}

async function updateAdStatusUI(forceRefresh = false) {
  const requestedLanguage = currentLang;
  const requestedAuthContext = authContextKey();
  await adManager.refresh(forceRefresh);
  if (!isCurrentAuthContext(requestedAuthContext)) return;
  const btnPremiumTop = document.getElementById('btn-premium-top');
  const btnWatchAdReward = document.getElementById('btn-watch-ad-reward');
  const premiumUsageCounter = document.getElementById('premium-usage-counter');
  const premiumUsageText = document.getElementById('premium-usage-text');

  const cookieInteractive = document.getElementById('cookie-interactive');
  const cookieHero = cookieInteractive?.closest('.cookie-hero');
  const vipAiModeBadge = document.getElementById('vip-ai-mode-badge');
  const paperSlipText = document.getElementById('paper-slip-text');

  const accountState = await getVerifiedAccountState(forceRefresh);
  if (
    requestedLanguage !== currentLang ||
    !isCurrentAuthContext(requestedAuthContext)
  ) return;
  const isPremium =
    accountState?.isPremium === true ||
    accountState?.membershipTier === 'premium';
  if (accountState) void adManager.syncDisplayAds({ isPremium });
  const premiumLimit =
    Number(accountState?.premiumUsage?.limit) ||
    Number(appSettings.premiumDailyLimit) ||
    5;
  const hasAdCredit = adManager.getPremiumQueries() > 0;
  const isVipModeActive = isPremium || hasAdCredit;

  // Toggle Golden Premium AI Cookie Appearance & Badge
  if (isVipModeActive) {
    if (cookieInteractive) cookieInteractive.classList.add('vip-gold-mode');
    if (cookieHero) cookieHero.classList.add('vip-gold-mode');
    if (vipAiModeBadge) {
      vipAiModeBadge.classList.remove('hidden');
      vipAiModeBadge.textContent = `✨ ${t(isPremium ? 'personalAiOpen' : 'rewardedAiOpen')}`;
    }
    if (paperSlipText) paperSlipText.textContent = t('personalPaperText');
  } else {
    if (cookieInteractive) cookieInteractive.classList.remove('vip-gold-mode');
    if (cookieHero) cookieHero.classList.remove('vip-gold-mode');
    if (vipAiModeBadge) vipAiModeBadge.classList.add('hidden');
    if (paperSlipText) paperSlipText.textContent = t('paperText');
  }

  if (isPremium) {
    // 1. Header Premium Button turns Green
    if (btnPremiumTop) {
      btnPremiumTop.classList.add('premium-active-green');
      const labelText = document.getElementById('premium-top-label-text');
      if (labelText) labelText.textContent = 'Premium';
    }

    // 2. Hide Watch Ad Button completely for Premium users!
    if (btnWatchAdReward) {
      btnWatchAdReward.classList.add('hidden');
      btnWatchAdReward.style.display = 'none';
    }

    // 3. Show the server-authoritative daily usage counter.
    if (premiumUsageCounter) {
      premiumUsageCounter.classList.remove('hidden');
      if (premiumUsageText) {
        const usage = accountState?.premiumUsage;
        if (usage) {
          const used = Math.max(0, Number(usage.used) || 0);
          const remaining = Number.isFinite(Number(usage.remaining))
            ? Math.max(0, Number(usage.remaining))
            : Math.max(0, premiumLimit - used);
          premiumUsageText.textContent = t('usage', { used, limit: premiumLimit, remaining });
        } else {
          premiumUsageText.textContent = t('premiumActive', { limit: premiumLimit });
        }
      }
    }
  } else {
    // Non-Premium Users
    const qCount = adManager.getPremiumQueries();
    const progress = adManager.getAdProgress();
    if (btnPremiumTop) {
      btnPremiumTop.classList.remove('premium-active-green');
      const labelText = document.getElementById('premium-top-label-text');
      if (labelText) labelText.textContent = 'Premium';
    }

    if (btnWatchAdReward) {
      const adsAvailable = adManager.isAvailable();
      const canWatchForCredit =
        adsAvailable &&
        qCount < 1 &&
        progress.canEarnMore;
      btnWatchAdReward.classList.toggle('hidden', !canWatchForCredit);
      btnWatchAdReward.style.display = canWatchForCredit ? 'flex' : 'none';
    }

    if (premiumUsageCounter) {
      premiumUsageCounter.classList.add('hidden');
    }

    const btnMainText = document.getElementById('btn-watch-ad-main-text');
    const heroAdStatus = document.getElementById('hero-ad-status');

    if (qCount > 0) {
      if (btnMainText) btnMainText.textContent = `✨ ${t('aiReady')}`;
      if (heroAdStatus) {
        heroAdStatus.textContent = t('rightsAvailable', { count: qCount });
        heroAdStatus.style.color = '#10B981';
      }
    } else {
      if (btnMainText) {
        btnMainText.textContent = t('watchAd');
      }
      if (heroAdStatus) {
        heroAdStatus.textContent = t('adProgress', progress);
        heroAdStatus.style.color = '#B45309';
      }
    }
  }
}

export async function refreshAppUIState() {
  await updateAdStatusUI();
  updateProfileBadge();
  await updateAstrologyCalculations();
}

async function updateAstrologyCalculations(profile = profileDraft || userProfile) {
  const bDate = inputProfileBirthdate ? inputProfileBirthdate.value : '';
  const bTime = inputProfileBirthtime ? inputProfileBirthtime.value : '12:00';
  const sunSignBox = document.getElementById('sun-sign-box');
  const badgeCalculatedSun = document.getElementById('badge-calculated-sun');
  const risingSignBox = document.getElementById('rising-sign-box');
  const badgeCalculatedRising = document.getElementById('badge-calculated-rising');
  const aiRisingUnlockPanel = document.getElementById('ai-rising-unlock-panel');

  if (bDate) {
    // 1. Calculate Sun Sign (ALWAYS TOP)
    const calculatedSun = calculateSunSign(bDate);
    if (calculatedSun) {
      const sName = calculatedSun.name[currentLang] || calculatedSun.name.en;
      if (badgeCalculatedSun) badgeCalculatedSun.textContent = `☀️ ${calculatedSun.icon} ${sName}`;
      if (sunSignBox) sunSignBox.classList.remove('hidden');
    } else {
      if (sunSignBox) sunSignBox.classList.add('hidden');
    }

    // 2. Rising Sign (BELOW SUN SIGN) - Unlocked via AI / Ad / Premium
    if (risingSignBox) risingSignBox.classList.remove('hidden');

    if (profile.risingSign) {
      const rObj = zodiacSigns.find(z => z.id === profile.risingSign);
      const rName = rObj ? (rObj.name[currentLang] || rObj.name.en) : '';
      const rIcon = rObj ? rObj.icon : '✨';
      if (badgeCalculatedRising) badgeCalculatedRising.textContent = `🌅 ${rIcon} ${rName}`;
      if (aiRisingUnlockPanel) aiRisingUnlockPanel.classList.add('hidden');
    } else {
      if (badgeCalculatedRising) badgeCalculatedRising.textContent = `🌅 ${t('locked')} 🔒`;
      if (aiRisingUnlockPanel) aiRisingUnlockPanel.classList.remove('hidden');
    }
  } else {
    if (sunSignBox) sunSignBox.classList.add('hidden');
    if (risingSignBox) risingSignBox.classList.add('hidden');
  }
}

function setLocationLookupStatus(message, state = '') {
  if (!locationLookupStatus) return;
  locationLookupStatus.textContent = message;
  locationLookupStatus.classList.toggle('is-success', state === 'success');
  locationLookupStatus.classList.toggle('is-error', state === 'error');
}

function refreshBirthTimezoneOffset(profile = profileDraft || userProfile) {
  if (!profile.timezoneId || !inputProfileBirthdate?.value) return null;
  const offset = calculateUtcOffsetForLocalDate(
    profile.timezoneId,
    inputProfileBirthdate.value,
    inputProfileBirthtime?.value || '12:00',
  );
  if (offset === null) return null;
  inputProfileTimezone.value = String(offset);
  profile.timezoneOffset = offset;
  return offset;
}

async function handleResolveBirthLocation() {
  if (!profileDraft) beginProfileDraft();
  const country = inputBirthCountry?.value.trim() || '';
  const city = inputBirthCity?.value.trim() || '';
  const region = inputBirthRegion?.value.trim() || '';

  if (country.length < 2 || city.length < 2) {
    setLocationLookupStatus('Ülke ve şehir alanlarını eksiksiz doldurun.', 'error');
    return;
  }

  btnResolveLocation.disabled = true;
  setLocationLookupStatus('Konum ve saat dilimi aranıyor…');
  try {
    const resolved = await resolveBirthLocation({
      country,
      city,
      region,
      language: currentLang,
    });
    inputProfileLatitude.value = resolved.latitude.toFixed(4);
    inputProfileLongitude.value = resolved.longitude.toFixed(4);
    profileDraft.birthCountry = country;
    profileDraft.birthCity = city;
    profileDraft.birthRegion = region;
    profileDraft.birthplace = resolved.displayName;
    profileDraft.timezoneId = resolved.timezoneId;
    profileDraft.latitude = resolved.latitude;
    profileDraft.longitude = resolved.longitude;
    profileDraft.risingSign = '';
    profileDraftManualRising = false;
    const risingSelect = document.getElementById('select-profile-rising');
    if (risingSelect) risingSelect.value = '';
    const offset = refreshBirthTimezoneOffset(profileDraft);
    const offsetText = offset === null ? 'doğum tarihini girince hesaplanacak' : `UTC${offset >= 0 ? '+' : ''}${offset}`;
    setLocationLookupStatus(
      `✓ ${resolved.displayName} · ${resolved.timezoneId} · ${offsetText}`,
      'success',
    );
    await updateAstrologyCalculations(profileDraft);
  } catch (error) {
    setLocationLookupStatus(
      error?.message || 'Konum bulunamadı. Bilgileri kontrol edip tekrar deneyin.',
      'error',
    );
  } finally {
    btnResolveLocation.disabled = false;
  }
}

// Calculate into the modal draft. The Save action is the only profile commit.
async function unlockAIRisingSign() {
  if (!profileDraft) beginProfileDraft();
  const bDate = inputProfileBirthdate ? inputProfileBirthdate.value : '';
  const bTime = inputProfileBirthtime ? inputProfileBirthtime.value : '12:00';

  const location = {
    latitude: inputProfileLatitude?.value,
    longitude: inputProfileLongitude?.value,
    timezoneOffset: inputProfileTimezone?.value
  };

  if (!bDate || !bTime || location.latitude === '' || location.longitude === '' || location.timezoneOffset === '') {
    showToast('⚠️ Doğum tarihi ve saatini girip doğum yerinizi bulun.');
    return;
  }

  showToast('🌅 Yükselen burcunuz hesaplanıyor...');

  const calculatedRising = calculateRisingSign(bDate, bTime, location);
  if (calculatedRising) {
    profileDraft.birthdate = bDate;
    profileDraft.birthtime = bTime;
    profileDraft.latitude = Number(location.latitude);
    profileDraft.longitude = Number(location.longitude);
    profileDraft.timezoneOffset = Number(location.timezoneOffset);
    profileDraft.risingSign = calculatedRising.id;
    profileDraftManualRising = true;
    const risingSelect = document.getElementById('select-profile-rising');
    if (risingSelect) risingSelect.value = calculatedRising.id;

    await updateAstrologyCalculations(profileDraft);
    showToast(`✨ Yükselen burcunuz: ${calculatedRising.icon} ${calculatedRising.name[currentLang] || calculatedRising.name.en}`);
  }
}

function updateProfileBadge() {
  if (userProfile && userProfile.name && userProfile.name.trim().length > 0) {
    badgeUserName.textContent = userProfile.name;
    const zObj = zodiacSigns.find(z => z.id === userProfile.zodiac);
    badgeUserZodiac.textContent = zObj ? zObj.icon : '✨';

    if (userProfile.risingSign) {
      const rObj = zodiacSigns.find(z => z.id === userProfile.risingSign);
      badgeUserRising.textContent = rObj ? `🌅 ${rObj.icon}` : '🌅';
      badgeUserRising.classList.remove('hidden');
    } else {
      badgeUserRising.classList.add('hidden');
    }

    userProfileBadge.classList.remove('hidden');
  } else {
    userProfileBadge.classList.add('hidden');
  }
}

let activeAnniversaryItem = null;

function checkAndShowAnniversaryReminder() {
  checkAnniversaryFortunes(auth.currentUser?.uid || null).then(item => {
    if (!item) return;
    const todayStr = localDayKey();
    const lastShown = localStorage.getItem('fc_last_anniversary_shown');
    if (lastShown !== todayStr) {
      localStorage.setItem('fc_last_anniversary_shown', todayStr);
      showAnniversaryModal(item);
    }
  }).catch(err => {
    console.warn('Anniversary check error:', err);
  });
}

function showAnniversaryModal(item) {
  if (!item) return;
  activeAnniversaryItem = item;
  const modal = document.getElementById('modal-anniversary-reminder');
  const quoteEl = document.getElementById('anniversary-quote-text');
  const dateEl = document.getElementById('anniversary-date-text');

  if (quoteEl) quoteEl.textContent = `"${item.quote || item.text || ''}"`;
  if (dateEl && item.timestamp) {
    const d = new Date(item.timestamp);
    dateEl.textContent = `📅 ${d.toLocaleDateString(currentLang, { year: 'numeric', month: 'long', day: 'numeric' })}`;
  }

  if (modal) {
    modal.classList.remove('hidden');
    const modalCanvas = modal.querySelector('.card-fireworks-canvas');
    if (modalCanvas) {
      setTimeout(() => startCardFireworksAnimation(modalCanvas), 50);
    }
  }
}



function renderCategoryPills(profile = profileDraft || userProfile) {
  const selectedCategory =
    profile.category || profile.categories?.[0] || 'general';
  categoryPillsContainer.innerHTML = categories.map(cat => {
    const isSelected = selectedCategory === cat.id;
    const name = cat.name[currentLang] || cat.name.en;
    return `
      <button class="category-pill ${isSelected ? 'active' : ''}" data-cat-id="${cat.id}">
        ${name}
      </button>
    `;
  }).join('');

  categoryPillsContainer.querySelectorAll('.category-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const catId = btn.getAttribute('data-cat-id');
      if (!profileDraft) beginProfileDraft();
      profileDraft.category = catId;
      profileDraft.categories = [catId];
      renderCategoryPills(profileDraft);
    });
  });
}

function triggerCrumbExplosion() {
  const ctx = crumbCanvas.getContext('2d');
  crumbCanvas.width = 300;
  crumbCanvas.height = 240;
  
  const particles = [];
  const colors = ['#D97706', '#F59E0B', '#FDE68A', '#B45309', '#FFFBEB'];

  for (let i = 0; i < 45; i++) {
    particles.push({
      x: 150,
      y: 120,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.7) * 12,
      size: Math.random() * 6 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.3
    });
  }

  let startTime = null;

  function animate(timestamp) {
    if (!startTime) startTime = timestamp;
    const progress = timestamp - startTime;

    ctx.clearRect(0, 0, crumbCanvas.width, crumbCanvas.height);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.4; // gravity
      p.alpha -= 0.02;
      p.rotation += p.vRot;

      if (p.alpha > 0) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    });

    if (progress < 900) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, crumbCanvas.width, crumbCanvas.height);
    }
  }

  requestAnimationFrame(animate);
}

let fireworksAnimationId = null;

function startCardFireworksAnimation(customCanvas = null) {
  const canvas = customCanvas || document.getElementById('card-fireworks-canvas');
  if (!canvas) return;

  const card = canvas.parentElement;
  if (!card) return;

  const cardWidth = card.clientWidth || 380;
  const cardHeight = card.clientHeight || 460;
  canvas.width = cardWidth;
  canvas.height = cardHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (fireworksAnimationId) {
    cancelAnimationFrame(fireworksAnimationId);
    fireworksAnimationId = null;
  }

  const particles = [];
  const stardust = [];
  const colors = ['#F59E0B', '#FBBF24', '#FDE68A', '#EC4899', '#8B5CF6', '#3B82F6', '#10B981', '#FFFFFF'];

  // Initialize rising ambient cosmic stardust
  for (let s = 0; s < 25; s++) {
    stardust.push({
      x: Math.random() * cardWidth,
      y: Math.random() * cardHeight,
      speedY: Math.random() * 0.4 + 0.15,
      size: Math.random() * 2 + 0.8,
      alpha: Math.random() * 0.7 + 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
      pulseSpeed: Math.random() * 0.03 + 0.01
    });
  }

  function createBurst(cx, cy, count = 40) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
      const speed = Math.random() * 6.5 + 2.2;
      particles.push({
        x: cx,
        y: cy,
        history: [],
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 3.8 + 1.6,
        decay: Math.random() * 0.016 + 0.010,
        gravity: 0.07,
        isStar: Math.random() > 0.4
      });
    }
  }

  // Launch initial grand fireworks bursts lower down, just above the fortune quote
  createBurst(canvas.width * 0.28, canvas.height * 0.42, 40);
  createBurst(canvas.width * 0.72, canvas.height * 0.45, 40);
  createBurst(canvas.width * 0.5, canvas.height * 0.38, 50);

  let lastAmbientBurstTime = Date.now();

  function drawStarShape(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render & update rising stardust
    stardust.forEach(sd => {
      sd.y -= sd.speedY;
      sd.alpha += Math.sin(Date.now() * sd.pulseSpeed) * 0.015;
      if (sd.y < -10) {
        sd.y = canvas.height + 10;
        sd.x = Math.random() * canvas.width;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0.1, Math.min(0.9, sd.alpha));
      ctx.fillStyle = sd.color;
      ctx.shadowBlur = 6;
      ctx.shadowColor = sd.color;
      ctx.beginPath();
      ctx.arc(sd.x, sd.y, sd.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Periodically launch ambient micro bursts every 2.2 seconds
    const now = Date.now();
    if (now - lastAmbientBurstTime > 2200) {
      lastAmbientBurstTime = now;
      const randX = Math.random() * (canvas.width * 0.7) + canvas.width * 0.15;
      const randY = Math.random() * (canvas.height * 0.22) + canvas.height * 0.36;
      createBurst(randX, randY, 25);
    }

    // Render & update fireworks particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      
      // Store trail points
      p.history.push({ x: p.x, y: p.y });
      if (p.history.length > 4) p.history.shift();

      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.975;
      p.vy *= 0.975;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        particles.splice(i, 1);
        continue;
      }

      // Draw light trail
      if (p.history.length > 1) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p.history[0].x, p.history[0].y);
        for (let h = 1; h < p.history.length; h++) {
          ctx.lineTo(p.history[h].x, p.history[h].y);
        }
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.6;
        ctx.globalAlpha = Math.max(0, p.alpha * 0.4);
        ctx.stroke();
        ctx.restore();
      }

      // Draw particle head (star or glow circle)
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = p.color;

      if (p.isStar) {
        drawStarShape(ctx, p.x, p.y, 4, p.size * 1.5, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    fireworksAnimationId = requestAnimationFrame(render);
  }

  render();
}

function stopCardFireworksAnimation() {
  if (fireworksAnimationId) {
    cancelAnimationFrame(fireworksAnimationId);
    fireworksAnimationId = null;
  }
}

function generateLuckyNumbers() {
  const nums = new Set();
  while (nums.size < 6) {
    nums.add(Math.floor(Math.random() * 99) + 1);
  }
  return Array.from(nums);
}

async function getDailyCrackCount() {
  const today = localDayKey();
  const storedDate = localStorage.getItem('fc_crack_date');
  if (storedDate !== today) {
    localStorage.setItem('fc_crack_date', today);
    localStorage.setItem('fc_crack_count', '0');
    return 0;
  }
  return parseInt(localStorage.getItem('fc_crack_count') || '0', 10);
}

async function incrementDailyCrackCount() {
  const current = await getDailyCrackCount();
  const next = current + 1;
  localStorage.setItem('fc_crack_count', next.toString());
  return next;
}

async function getVerifiedAccountState(forceRefresh = false) {
  const requestedAuthContext = authContextKey();
  if (!auth.currentUser) {
    accountStateCache = null;
    return {
      exists: false,
      isPremium: false,
      membershipTier: 'free',
      premiumUsage: {
        used: 0,
        limit: Number(appSettings.premiumDailyLimit) || 5,
        remaining: Number(appSettings.premiumDailyLimit) || 5,
        day: localDayKey(),
      },
    };
  }

  if (
    !forceRefresh &&
    accountStateCache &&
    accountStateCache.ownerUid === auth.currentUser.uid
  ) return accountStateCache;
  const serverState = await getAccountStateFromServer(forceRefresh);
  if (!isCurrentAuthContext(requestedAuthContext)) return null;
  if (
    serverState?.ownerUid &&
    serverState.ownerUid !== auth.currentUser?.uid
  ) return null;
  if (serverState) {
    const serverLimits = serverState.limits || {};
    const freeDailyLimit = Number(serverLimits.freeDailyLimit);
    const premiumDailyLimit = Number(serverLimits.premiumDailyLimit);
    if (Number.isFinite(freeDailyLimit) && Number.isFinite(premiumDailyLimit)) {
      appSettings = {
        ...appSettings,
        freeDailyLimit: Math.min(Math.max(Math.trunc(freeDailyLimit), 1), 20),
        premiumDailyLimit: Math.min(Math.max(Math.trunc(premiumDailyLimit), 1), 50),
        configVersion: Math.max(Number(serverLimits.configVersion) || 0, 0),
      };
    }
    const isPremium =
      serverState.isPremium === true ||
      serverState.membershipTier === 'premium';
    accountStateCache = {
      ...serverState,
      isPremium,
      membershipTier: isPremium ? 'premium' : 'free',
    };
    return accountStateCache;
  }

  const isPremium = await checkPremiumEntitlement();
  if (!isCurrentAuthContext(requestedAuthContext)) return null;
  return {
    exists: true,
    isPremium,
    membershipTier: isPremium ? 'premium' : 'free',
    ownerUid: auth.currentUser?.uid || null,
    premiumUsage: {
      used: Number(accountStateCache?.premiumUsage?.used) || 0,
      limit: Number(appSettings.premiumDailyLimit) || 5,
      remaining: Number(appSettings.premiumDailyLimit) || 5,
      day: localDayKey(),
    },
    unavailable: true,
  };
}

const waitFor = ms => new Promise(resolve => setTimeout(resolve, ms));

function startReadingSequence(isAiModeActive) {
  const badge = document.getElementById('ai-fortune-loading-badge');
  const primary = document.getElementById('ai-loading-primary');
  const secondary = document.getElementById('ai-loading-secondary');
  const paperSlipText = document.getElementById('paper-slip-text');
  const cookieHero = cookieInteractive.closest('.cookie-hero');
  const messages = isAiModeActive
    ? [
        [t('loadingOpened'), t('loadingReading')],
        [t('preparingFortune'), t('loadingSelecting')],
        [t('aiReady'), t('loadingFinishing')],
      ]
    : [
        [t('loadingOpened'), t('preparingFortune')],
        [t('aiReady'), t('loadingFinishing')],
      ];
  let messageIndex = 0;

  const showMessage = () => {
    const [title, detail] = messages[messageIndex % messages.length];
    if (primary) primary.textContent = title;
    if (secondary) secondary.textContent = detail;
    messageIndex += 1;
  };

  showMessage();
  if (badge) badge.classList.remove('hidden');
  if (paperSlipText) paperSlipText.textContent = `✨ ${t('preparingFortune').replace(/…$/, '').toLocaleUpperCase(currentLang)}`;
  cookieInteractive.setAttribute('aria-busy', 'true');

  const readingTimer = setTimeout(() => {
    cookieInteractive.classList.add('cookie-reading');
    if (cookieHero) cookieHero.classList.add('cookie-reading');
  }, 1450);
  const messageTimer = setInterval(showMessage, 1900);

  return () => {
    clearTimeout(readingTimer);
    clearInterval(messageTimer);
    if (badge) badge.classList.add('hidden');
    cookieInteractive.classList.remove('cookie-reading');
    if (cookieHero) cookieHero.classList.remove('cookie-reading');
    cookieInteractive.removeAttribute('aria-busy');
  };
}

async function renderFortuneResult(
  fortuneText,
  generation = {},
  persistence = {},
) {
  const requestContext = persistence.requestContext;
  assertFortuneRequestContextCurrent(requestContext);
  const requestLang = requestContext.language;
  const requestProfile = requestContext.profile;
  const numbers = generateLuckyNumbers();
  const texts = uiText[requestLang] || uiText.en;
  const resultCard = fortuneQuoteText.closest('.fortune-card');
  const normalizedFortuneLength = String(fortuneText || '').trim().length;
  const historyOwnerUid = requestContext.ownerUid || null;
  const persistCloudHistory =
    persistence.persistCloudHistory === true && Boolean(historyOwnerUid);

  fortuneQuoteText.textContent = `"${fortuneText}"`;
  if (resultCard) {
    resultCard.dataset.quoteSize =
      normalizedFortuneLength > 175 ? 'xlong' :
      normalizedFortuneLength > 135 ? 'long' :
      normalizedFortuneLength > 100 ? 'medium' : 'short';
  }
  luckyNumbersContainer.innerHTML = numbers.map(num => `
    <div class="number-badge">${num < 10 ? '0' + num : num}</div>
  `).join('');

  if (!isIOSPlatform && requestProfile.zodiac) {
    const zObj = zodiacSigns.find(z => z.id === requestProfile.zodiac);
    if (zObj) {
      zodiacBadgeIcon.textContent = zObj.icon;
      zodiacBadgeName.textContent = zObj.name[requestLang] || zObj.name.en;

      if (requestProfile.risingSign) {
        const rObj = zodiacSigns.find(z => z.id === requestProfile.risingSign);
        if (rObj) {
          const risingPrefix = texts.risingPrefix || '🌅 Rising: ';
          zodiacBadgeRising.textContent = `${risingPrefix}${rObj.name[requestLang] || rObj.name.en}`;
          zodiacBadgeRising.classList.remove('hidden');
        } else {
          zodiacBadgeRising.classList.add('hidden');
        }
      } else {
        zodiacBadgeRising.classList.add('hidden');
      }

      zodiacActiveBadge.classList.remove('hidden');
      lastGeneratedFortune.zodiacId = zObj.id;
      lastGeneratedFortune.zodiacIcon = zObj.icon;
      lastGeneratedFortune.zodiacName = zObj.name[requestLang] || zObj.name.en;
    }
  } else {
    zodiacActiveBadge.classList.add('hidden');
    lastGeneratedFortune.zodiacId = null;
    lastGeneratedFortune.zodiacIcon = '🥠';
    lastGeneratedFortune.zodiacName = 'Fortune';
  }

  lastGeneratedFortune.quote = fortuneText;
  lastGeneratedFortune.numbers = numbers;
  lastGeneratedFortune.userName = requestProfile.name || '';
  lastGeneratedFortune.contentId = generation.contentId || '';
  lastGeneratedFortune.contentCategory = generation.contentCategory || '';
  lastGeneratedFortune.contentSource = generation.contentSource || '';
  lastGeneratedFortune.variantType = generation.variantType || '';
  lastGeneratedFortune.requestId = generation.requestId || '';
  lastGeneratedFortune.cloudPersisted = persistCloudHistory;

  assertFortuneRequestContextCurrent(requestContext);
  try {
    const savedFortune = await saveFortuneToHistory(
      lastGeneratedFortune,
      historyOwnerUid,
    );
    if (savedFortune && persistCloudHistory) {
      const cloudSynced = await syncFortuneToCloud(savedFortune, historyOwnerUid);
      if (!cloudSynced) {
        console.warn('Fal geçmişi buluta zenginleştirilemedi; yerel kopya korundu.');
      }
    }
  } catch (error) {
    console.warn('Fal geçmişe kaydedilemedi:', error);
  }

  // The history write may have awaited storage or the cloud. Never reveal an
  // old account/language/profile result if its context changed meanwhile.
  assertFortuneRequestContextCurrent(requestContext);
  soundManager.playChime();
  stateLanding.classList.remove('active');
  stateLanding.classList.add('hidden');
  stateResult.classList.remove('hidden');
  stateResult.classList.add('active');
  startCardFireworksAnimation();
  recordFortuneEvent('result_view');
}

function resetCookieTapProgress() {
  cookieTapCount = 0;
  cookieInteractive.classList.remove(
    'crack-stage-1',
    'crack-stage-2',
    'cookie-tap-impact',
  );
  cookieInteractive.setAttribute('aria-label', t('cookieAria'));
}

async function crackCookie() {
  if (isAnimating || fortuneRequestInFlight) return;
  // Acquire the request lock before the first awaited account lookup.
  fortuneRequestInFlight = true;

  let accountState;
  let dailyCount;
  let entitlementAuthContext;
  try {
    await waitForCurrentProfileHydration();
    entitlementAuthContext = authContextKey();
    accountState = await getVerifiedAccountState(true);
    dailyCount = await getDailyCrackCount();
    await waitForCurrentProfileHydration();
    if (authContextKey() !== entitlementAuthContext) {
      throw Object.assign(new Error('Fortune entitlement context changed.'), {
        code: 'app/stale-fortune-context',
      });
    }
  } catch (error) {
    console.warn('Cookie access state could not be loaded:', error);
    fortuneRequestInFlight = false;
    resetCookieTapProgress();
    showToast(
      error?.code === 'app/stale-fortune-context'
        ? 'Oturum veya profil değişti. Şans Kurabiyesine yeniden dokunun.'
        : 'Kullanım bilgisi alınamadı. Lütfen yeniden deneyin.',
    );
    return;
  }
  const isPremium = accountState?.isPremium === true;
  const MAX_FREE_DAILY_CRACKS = Number(appSettings.freeDailyLimit) || 1;
  const MAX_PREMIUM_DAILY_CRACKS =
    Number(accountState?.premiumUsage?.limit) ||
    Number(appSettings.premiumDailyLimit) ||
    5;

  if (isPremium) {
    const premiumUsed = accountState?.premiumUsage
      ? Number(accountState.premiumUsage.used) || 0
      : null;
    if (premiumUsed !== null && premiumUsed >= MAX_PREMIUM_DAILY_CRACKS) {
      showToast(`⚠️ Günlük ${MAX_PREMIUM_DAILY_CRACKS} AI Şans Kurabiyesi hakkını doldurdun. Yarın tekrar gelebilirsin!`);
      fortuneRequestInFlight = false;
      resetCookieTapProgress();
      return;
    }
  } else {
    const hasAdQuery = adManager.getPremiumQueries() > 0;
    if (dailyCount >= MAX_FREE_DAILY_CRACKS && !hasAdQuery) {
      showToast(`⚠️ Günlük ${MAX_FREE_DAILY_CRACKS} ücretsiz Şans Kurabiyesi hakkını doldurdun. Premium üyelikle daha fazlasını açabilirsin.`);
      const modalPremium = document.getElementById('modal-premium-store');
      if (modalPremium) modalPremium.classList.remove('hidden');
      fortuneRequestInFlight = false;
      resetCookieTapProgress();
      return;
    }
  }

  isAnimating = true;
  const animationStartedAt = Date.now();
  const hasAdQuery = adManager.getPremiumQueries() > 0;
  const isAiModeActive = isPremium || hasAdQuery;
  const requestContext = captureFortuneRequestContext();
  const fortuneProfile = requestContext.profile;
  const historyOwnerUid = requestContext.ownerUid;
  const historyPersistence = {
    persistCloudHistory: isPremium && Boolean(historyOwnerUid),
    requestContext,
  };

  triggerHapticFeedback(3);
  soundManager.playCrack();
  triggerCrumbExplosion();
  cookieInteractive.classList.add('cookie-cracking');
  const stopReadingSequence = startReadingSequence(isAiModeActive);

  try {
    let fortuneText = '';
    let generation = {};
    if (isPremium) {
      const result = await fetchRemoteAIPrediction(fortuneProfile, requestContext.language, {
        requireRemote: true,
      });
      fortuneText = result.prediction;
      generation = result;
      accountStateCache = null;
    } else {
      const consumed = await adManager.consumePremiumQuery();
      if (consumed) {
        const result = await fetchRemoteAIPrediction(fortuneProfile, requestContext.language, {
          requireRemote: true,
        });
        fortuneText = result.prediction;
        generation = result;
      } else {
        fortuneText = getRandomFortune(
          requestContext.language,
          fortuneProfile.category || 'general',
          fortuneProfile,
        );
        await incrementDailyCrackCount();
      }
    }

    const elapsed = Date.now() - animationStartedAt;
    await waitFor(Math.max(1550 - elapsed, 0));
    assertFortuneRequestContextCurrent(requestContext);
    await renderFortuneResult(fortuneText, generation, historyPersistence);
  } catch (err) {
    console.error('Error cracking cookie:', err);
    const errorCode = String(err?.code || '');
    if (errorCode.includes('stale-fortune-context')) {
      showToast('Oturum, dil veya profil değişti. Eski sonuç kaydedilmedi; yeniden deneyin.');
    } else if (errorCode.includes('resource-exhausted')) {
      accountStateCache = null;
      showToast(`Günlük ${MAX_PREMIUM_DAILY_CRACKS} AI Şans Kurabiyesi hakkın doldu. Sayaç yarın yenilenir.`);
    } else if (errorCode.includes('aborted')) {
      showToast('Şans Kurabiyesi isteğin hâlâ işleniyor. Lütfen birkaç saniye bekle.');
    } else if (
      errorCode.includes('permission-denied') ||
      errorCode.includes('unauthenticated')
    ) {
      showToast('Premium üyelik doğrulanamadı. Hesabınıza yeniden giriş yapıp deneyin.');
    } else {
      showToast(t('aiUnavailable'));
    }
    stateResult.classList.remove('active');
    stateResult.classList.add('hidden');
    stateLanding.classList.remove('hidden');
    stateLanding.classList.add('active');
    resetCookieTapProgress();
  } finally {
    stopReadingSequence();
    cookieInteractive.classList.remove('cookie-cracking');
    isAnimating = false;
    fortuneRequestInFlight = false;
    updateAdStatusUI(true).catch(error => {
      console.warn('Kullanım bilgisi yenilenemedi:', error);
    });
  }
}

function resetToLanding() {
  if (isAnimating) return;

  resetCookieTapProgress();
  stopCardFireworksAnimation();
  stateResult.classList.remove('active');
  stateResult.classList.add('hidden');

  stateLanding.classList.remove('hidden');
  stateLanding.classList.add('active');
}

async function renderHistoryList() {
  const ownerUid = auth.currentUser?.isAnonymous ? null : auth.currentUser?.uid || null;
  let history = await getHistory(ownerUid);
  // History is fetched only when this modal opens, so always reconcile here.
  // This prevents an earlier empty cache from hiding cookies created on another
  // device or persisted by the trusted backend seconds ago.
  const historySyncKey = ownerUid ? `fc_history_sync_v4:${ownerUid}` : '';
  if (ownerUid && accountStateCache?.isPremium === true) {
    try {
      const cloudHistory = await getCloudFortuneHistory();
      history = await mergeHistoryFromCloud(cloudHistory, ownerUid);
      localStorage.setItem(historySyncKey, String(Date.now()));
    } catch (error) {
      console.warn('Fortune Cookie history reconciliation failed:', error);
    }
  }
  const texts = uiText[currentLang] || uiText.en;
  if (!history || history.length === 0) {
    historyListContainer.innerHTML = `<p class="no-history-text">${texts.noHistory}</p>`;
    return;
  }

  historyListContainer.innerHTML = history.map(item => {
    const safeNumbers = Array.isArray(item.numbers)
      ? item.numbers.map(Number).filter(num => Number.isInteger(num) && num >= 1 && num <= 99).slice(0, 6)
      : [];
    const parsedTimestamp = new Date(item.timestamp);
    const dateLabel = Number.isNaN(parsedTimestamp.getTime())
      ? ''
      : parsedTimestamp.toLocaleDateString(currentLang);
    return `
    <div class="history-item" data-id="${escapeHtml(item.id)}">
      <div class="history-item-header">
        <span class="history-item-zodiac">${escapeHtml(item.zodiacIcon || '🥠')} ${escapeHtml(item.zodiacName || 'Fortune')}</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="history-item-date">${escapeHtml(dateLabel)}</span>
          <button class="btn-share-history-item" data-id="${escapeHtml(item.id)}" title="Hikaye Kartı Paylaş">🚀 Paylaş</button>
        </div>
      </div>
      <p class="history-item-quote">"${escapeHtml(item.quote)}"</p>
      <div class="history-item-numbers">
        ${safeNumbers.map(num => `<span>${num < 10 ? '0' + num : num}</span>`).join('')}
      </div>
    </div>
  `;
  }).join('');

  // Wire up share buttons for history items
  historyListContainer.querySelectorAll('.btn-share-history-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const itemId = btn.getAttribute('data-id');
      const item = history.find(h => h.id === itemId);
      if (item) {
        lastGeneratedFortune = {
          quote: item.quote,
          numbers: item.numbers || [7, 12, 28, 34, 49, 77],
          zodiacIcon: item.zodiacIcon || '✨',
          zodiacName: item.zodiacName || '',
          userName: userProfile.name || '',
          contentId: item.contentId || '',
          contentCategory: item.contentCategory || '',
          contentSource: item.contentSource || '',
          variantType: item.variantType || '',
          requestId: item.requestId || '',
        };
        modalHistory.classList.add('hidden');
        openStoryModal();
      }
    });
  });
}

async function handleSaveProfile() {
  btnSaveProfile.disabled = true;
  try {
    await languagePersistenceQueue;
    if (!profileDraft) beginProfileDraft();
    const expectedAuthContext = authContextKey();
    const ownerUid = profileOwnerUid();
    const registeredUser = auth.currentUser && !auth.currentUser.isAnonymous
      ? auth.currentUser
      : null;
    const resolvedLocationKey = [
      profileDraft.birthCountry,
      profileDraft.birthCity,
      profileDraft.birthRegion,
    ].map(value => String(value || '').trim().toLocaleLowerCase('tr')).join('|');
    const nextLocationKey = [
      inputBirthCountry?.value,
      inputBirthCity?.value,
      inputBirthRegion?.value,
    ].map(value => String(value || '').trim().toLocaleLowerCase('tr')).join('|');

    const candidate = {
      ...profileDraft,
      name: inputProfileName?.value.trim() || '',
      birthdate: inputProfileBirthdate?.value || '',
      birthtime: inputProfileBirthtime?.value || '',
      birthCountry: inputBirthCountry?.value.trim() || '',
      birthCity: inputBirthCity?.value.trim() || '',
      birthRegion: inputBirthRegion?.value.trim() || '',
      preferredLanguage: currentLang,
    };
    if (resolvedLocationKey !== nextLocationKey) {
      candidate.timezoneId = '';
      candidate.latitude = null;
      candidate.longitude = null;
      candidate.timezoneOffset = null;
      inputProfileLatitude.value = '';
      inputProfileLongitude.value = '';
      inputProfileTimezone.value = '';
      setLocationLookupStatus('Konum değişti. Koordinatları doğrulamak için “Konumu Bul” düğmesini kullanın.');
    } else {
      candidate.latitude = inputProfileLatitude?.value === ''
        ? null
        : Number(inputProfileLatitude?.value);
      candidate.longitude = inputProfileLongitude?.value === ''
        ? null
        : Number(inputProfileLongitude?.value);
      candidate.timezoneOffset = inputProfileTimezone?.value === ''
        ? null
        : Number(inputProfileTimezone?.value);
    }
    candidate.birthplace = [
      candidate.birthRegion,
      candidate.birthCity,
      candidate.birthCountry,
    ].filter(Boolean).join(', ');

    const dependenciesChanged = birthDependencyKey(candidate) !== birthDependencyKey(userProfile);
    const calculatedSun = calculateSunSign(candidate.birthdate);
    candidate.zodiac = calculatedSun?.id || '';
    const completeRisingInputs = Boolean(
      candidate.birthdate &&
      candidate.birthtime &&
      Number.isFinite(candidate.latitude) &&
      Number.isFinite(candidate.longitude) &&
      Number.isFinite(candidate.timezoneOffset),
    );
    const selectedRising = document.getElementById('select-profile-rising')?.value || '';
    if (!completeRisingInputs) {
      candidate.risingSign = '';
    } else if (profileDraftManualRising && selectedRising) {
      candidate.risingSign = selectedRising;
    } else if (dependenciesChanged || !candidate.risingSign) {
      candidate.risingSign = calculateRisingSign(
        candidate.birthdate,
        candidate.birthtime,
        candidate,
      )?.id || '';
    }

    const normalizedCandidate = normalizeProfile(candidate, currentLang);
    const savedProfile = await saveProfile(normalizedCandidate, ownerUid);
    if (!savedProfile) throw new Error('local-profile-save-failed');
    if (!isCurrentAuthContext(expectedAuthContext)) {
      throw Object.assign(new Error('profile-auth-context-changed'), {
        code: 'app/stale-profile-context',
      });
    }
    replaceAuthoritativeProfile(savedProfile, currentLang);

    if (registeredUser) {
      const cloudProfile = await syncUserWithDatabase(registeredUser, userProfile);
      if (cloudProfile?._syncVerified !== true) {
        showToast('Profil cihazda kaydedildi; bulut kaydı doğrulanamadı. Bağlantınızı kontrol edip tekrar deneyin.');
        return;
      }
    }

    await refreshAppUIState();
    modalProfile.classList.add('hidden');
    renderProfileInputs(userProfile);
    showToast(t('saved'));
  } catch (error) {
    console.error('Profil kaydedilemedi:', error);
    showToast('Profil kaydedilemedi. Lütfen tekrar deneyin.');
  } finally {
    btnSaveProfile.disabled = false;
  }
}

async function handleClearHistory() {
  const ownerUid = auth.currentUser?.isAnonymous
    ? null
    : auth.currentUser?.uid || null;
  if (ownerUid && !(await clearCloudFortuneHistory())) return false;
  await clearHistory(ownerUid);
  if (ownerUid) {
    localStorage.setItem(`fc_history_sync_v4:${ownerUid}`, String(Date.now()));
  }
  if (!modalHistory.classList.contains('hidden')) await renderHistoryList();
  return true;
}

function applyHydratedLanguage(lang) {
  const normalized = normalizeLanguage(lang, currentLang);
  currentLang = normalized;
  localStorage.setItem('app_language', normalized);
  document.documentElement.lang = normalized;
  if (selectLanguage) selectLanguage.value = normalized;
}

function setLanguage(lang) {
  const normalized = normalizeLanguage(lang, currentLang);
  const selectedAuthContext = authContextKey();
  const selectedOwnerUid = profileOwnerUid();
  const selectedUser = auth.currentUser && !auth.currentUser.isAnonymous
    ? auth.currentUser
    : null;
  const sequence = ++languageSelectionVersion;
  explicitLanguageByAuthContext.set(selectedAuthContext, { sequence, lang: normalized });
  applyHydratedLanguage(normalized);
  userProfile = normalizeProfile({
    ...userProfile,
    preferredLanguage: normalized,
  }, normalized);
  profileRevision += 1;
  if (profileDraft) profileDraft.preferredLanguage = normalized;
  void updateAstrologyCalculations(profileDraft || userProfile);
  renderCategoryPills(profileDraft || userProfile);
  updateLanguageUI();
  void updateAdStatusUI();

  languagePersistenceQueue = languagePersistenceQueue
    .catch(() => {})
    .then(async () => {
      const latestSelection = explicitLanguageByAuthContext.get(selectedAuthContext);
      if (latestSelection?.sequence !== sequence) return false;
      let profileBase;
      if (isCurrentAuthContext(selectedAuthContext)) {
        await waitForCurrentProfileHydration();
        profileBase = userProfile;
      } else {
        profileBase = await getProfile(normalized, selectedOwnerUid);
      }
      const profileSnapshot = normalizeProfile({
        ...profileBase,
        preferredLanguage: normalized,
      }, normalized);
      const savedProfile = await saveProfile(profileSnapshot, selectedOwnerUid);
      if (!savedProfile) throw new Error('language-profile-save-failed');
      if (
        selectedUser &&
        isCurrentAuthContext(selectedAuthContext) &&
        explicitLanguageByAuthContext.get(selectedAuthContext)?.sequence === sequence
      ) {
        const cloudProfile = await syncUserWithDatabase(selectedUser, savedProfile);
        if (cloudProfile?._syncVerified !== true) {
          throw new Error('language-cloud-sync-unverified');
        }
      }
      return true;
    })
    .catch((error) => {
      console.warn('Language preference persistence failed:', error?.message);
      return false;
    });
  return languagePersistenceQueue;
}

function updateLanguageUI() {
  const texts = uiText[currentLang] || uiText.en;
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((element) => {
    const label = t(element.dataset.i18nAria);
    element.setAttribute('aria-label', label);
    element.title = label;
  });

  if (appTitleText) appTitleText.textContent = t('appTitle');
  if (subtitleText) subtitleText.textContent = texts.subtitle;
  if (pillText) pillText.textContent = texts.pillText;

  const paperSlipText = document.getElementById('paper-slip-text');
  if (paperSlipText) paperSlipText.textContent = t('paperText');
  if (cookieInteractive) cookieInteractive.setAttribute('aria-label', t('cookieAria'));

  if (cardTitleText) cardTitleText.textContent = t('cardTitle');
  if (luckyTitleText) luckyTitleText.textContent = t('luckyTitle');
  if (btnAgainText) btnAgainText.textContent = t('again');
  if (btnStoryText) btnStoryText.textContent = t('storyCard');
  if (modalTitleText) modalTitleText.textContent = texts.modalTitle;
  const btnShareStoryText = document.getElementById('btn-share-story-text');
  if (btnShareStoryText) btnShareStoryText.textContent = t('shareStory');

  document.getElementById('profile-title-text').textContent = texts.profileTitle;
  document.getElementById('history-title-text').textContent = texts.historyTitle;
  const labelZodiac = document.getElementById('label-profile-zodiac');
  if (labelZodiac) labelZodiac.textContent = texts.selectZodiac;
  document.getElementById('label-profile-category').textContent = texts.selectCategory;
  document.getElementById('input-profile-name').placeholder = texts.namePlaceholder;
  document.getElementById('btn-save-profile-text').textContent = texts.btnSaveProfile;

  // Profile Modal Extra Labels
  const socialLoginLabelText = document.getElementById('social-login-label-text');
  if (socialLoginLabelText) socialLoginLabelText.textContent = texts.socialLoginLabel || '';
  const btnGoogleText = document.getElementById('btn-google-text');
  if (btnGoogleText) btnGoogleText.textContent = texts.btnGoogle || '';
  const btnAppleText = document.getElementById('btn-apple-text');
  if (btnAppleText) btnAppleText.textContent = texts.btnApple || '';
  const dividerOrText = document.getElementById('divider-or-text');
  if (dividerOrText) dividerOrText.textContent = texts.dividerOr || '';
  const labelProfileLang = document.getElementById('label-profile-lang');
  if (labelProfileLang) labelProfileLang.textContent = texts.labelLang || '';
  const labelProfileName = document.getElementById('label-profile-name');
  if (labelProfileName) labelProfileName.textContent = texts.labelName || '';
  const labelProfileBirthdate = document.getElementById('label-profile-birthdate');
  if (labelProfileBirthdate) labelProfileBirthdate.textContent = texts.labelBirthdate || '';
  const labelProfileBirthtime = document.getElementById('label-profile-birthtime');
  if (labelProfileBirthtime) labelProfileBirthtime.textContent = texts.labelBirthtime || '';
  const labelProfileRising = document.getElementById('label-profile-rising');
  if (labelProfileRising) labelProfileRising.textContent = texts.labelRising || '';
  const labelProfileSun = document.getElementById('label-profile-sun');
  if (labelProfileSun) labelProfileSun.textContent = texts.labelSun || '';

  // Rewarded Video Ad Modal Translations
  const adVideoTitle = document.getElementById('ad-video-title');
  if (adVideoTitle) adVideoTitle.textContent = texts.adVideoTitle || '';
  const adVideoDesc = document.querySelector('.ad-video-body p');
  if (adVideoDesc) adVideoDesc.textContent = texts.adVideoDesc || '';
  const btnCloseAdText = document.getElementById('btn-close-ad-text');
  if (btnCloseAdText) btnCloseAdText.textContent = texts.btnClaimReward || '';

  // Top & Landing Action Buttons Translations
  const premiumTopLabelText = document.getElementById('premium-top-label-text');
  if (premiumTopLabelText) premiumTopLabelText.textContent = texts.premiumTopLabel || 'Premium';

  const btnWatchAdMainText = document.getElementById('btn-watch-ad-main-text');
  if (btnWatchAdMainText) {
    btnWatchAdMainText.textContent = t('watchAd');
  }

  const btnPremiumLandingTitle = document.getElementById('btn-premium-landing-title');
  if (btnPremiumLandingTitle) btnPremiumLandingTitle.textContent = texts.btnPremiumTitle || 'Premium Paket';

  const btnPremiumLandingSub = document.getElementById('btn-premium-landing-sub');
  if (btnPremiumLandingSub) btnPremiumLandingSub.textContent = texts.btnPremiumSub || 'Sınırsız & Reklamsız';

  // Premium Modal Full Multi-language Translations
  const premiumStoreTitle = document.getElementById('premium-store-title');
  if (premiumStoreTitle) premiumStoreTitle.textContent = texts.premiumStoreTitle || 'Premium Pass';

  const premiumStoreSubtitle = document.getElementById('premium-store-subtitle');
  if (premiumStoreSubtitle) {
    premiumStoreSubtitle.textContent = t('premiumAllowance', {
      limit: Number(appSettings.premiumDailyLimit) || 5,
    });
  }

  const planBadgeText = document.getElementById('plan-badge-text');
  if (planBadgeText) planBadgeText.textContent = texts.planBadge || '🔥';

  const planYearlyTitle = document.getElementById('plan-yearly-title');
  if (planYearlyTitle) planYearlyTitle.textContent = texts.planYearlyTitle || '';

  const planYearlyPeriodText = document.getElementById('plan-yearly-period-text');
  if (planYearlyPeriodText) planYearlyPeriodText.textContent = texts.planYearlyPeriod || '';

  const planYearlyNote = document.getElementById('plan-yearly-note');
  if (planYearlyNote) planYearlyNote.textContent = texts.planYearlyNote || '';

  const planMonthlyTitle = document.getElementById('plan-monthly-title');
  if (planMonthlyTitle) planMonthlyTitle.textContent = texts.planMonthlyTitle || '';

  const planMonthlyPeriodText = document.getElementById('plan-monthly-period-text');
  if (planMonthlyPeriodText) planMonthlyPeriodText.textContent = texts.planMonthlyPeriod || '';

  const featUnlimited1 = document.getElementById('feat-unlimited-1');
  if (featUnlimited1) {
    featUnlimited1.textContent = t('premiumDailyFeature', {
      limit: Number(appSettings.premiumDailyLimit) || 5,
    });
  }
  const featUnlimited2 = document.getElementById('feat-unlimited-2');
  if (featUnlimited2) {
    featUnlimited2.textContent = t('premiumDailyFeature', {
      limit: Number(appSettings.premiumDailyLimit) || 5,
    });
  }

  const featRising1 = document.getElementById('feat-rising-1');
  if (featRising1) featRising1.textContent = texts.featRising || '';
  const featRising2 = document.getElementById('feat-rising-2');
  if (featRising2) featRising2.textContent = texts.featRising || '';

  const featNoAds1 = document.getElementById('feat-no-ads-1');
  if (featNoAds1) featNoAds1.textContent = texts.featNoAds || '';
  const featNoAds2 = document.getElementById('feat-no-ads-2');
  if (featNoAds2) featNoAds2.textContent = texts.featNoAds || '';

  const featHistory1 = document.getElementById('feat-history-1');
  if (featHistory1) featHistory1.textContent = texts.featHistory || '';

  const btnBuyYearlyText = document.getElementById('btn-buy-yearly-text');
  if (btnBuyYearlyText) btnBuyYearlyText.textContent = texts.btnBuyYearly || '';

  const btnBuyMonthlyText = document.getElementById('btn-buy-monthly-text');
  if (btnBuyMonthlyText) btnBuyMonthlyText.textContent = texts.btnBuyMonthly || '';

  const premiumLegalText = document.getElementById('premium-legal-text');
  if (premiumLegalText) premiumLegalText.textContent = texts.premiumLegalText || '';
  const btnLogoutText = document.getElementById('btn-logout-text');
  if (btnLogoutText) btnLogoutText.textContent = t('logout');
  const btnDeleteAccountText = document.getElementById('btn-delete-account-text');
  if (btnDeleteAccountText) btnDeleteAccountText.textContent = t('deleteButton');
  const btnDeleteHistoryText = document.getElementById('btn-delete-history-text');
  if (btnDeleteHistoryText) btnDeleteHistoryText.textContent = t('historyDeleteButton');
  const historyDeleteConfirmTitle = document.getElementById('history-delete-confirm-title');
  if (historyDeleteConfirmTitle) historyDeleteConfirmTitle.textContent = t('historyDeleteConfirmTitle');
  const historyDeleteConfirmBody = document.getElementById('history-delete-confirm-body');
  if (historyDeleteConfirmBody) historyDeleteConfirmBody.textContent = t('historyDeleteConfirmBody');
  const btnCancelDeleteHistory = document.getElementById('btn-cancel-delete-history');
  if (btnCancelDeleteHistory) btnCancelDeleteHistory.textContent = t('cancel');
  const btnConfirmDeleteHistory = document.getElementById('btn-confirm-delete-history');
  if (btnConfirmDeleteHistory) btnConfirmDeleteHistory.textContent = t('historyDeleteConfirm');
  const deleteConfirmTitle = document.getElementById('delete-confirm-title');
  if (deleteConfirmTitle) deleteConfirmTitle.textContent = t('deleteConfirmTitle');
  const deleteConfirmBody = document.getElementById('delete-confirm-body');
  if (deleteConfirmBody) deleteConfirmBody.textContent = t('deleteConfirmBody');
  const btnCancelDelete = document.getElementById('btn-cancel-delete-account');
  if (btnCancelDelete) btnCancelDelete.textContent = t('cancel');
  const btnConfirmDelete = document.getElementById('btn-confirm-delete-account');
  if (btnConfirmDelete) btnConfirmDelete.textContent = t('confirmDelete');
  const providerBadge = document.getElementById('user-provider-badge');
  if (providerBadge && auth.currentUser && !auth.currentUser.isAnonymous) {
    const usesApple = auth.currentUser.providerData?.some(provider => provider.providerId === 'apple.com');
    providerBadge.textContent = t(usesApple ? 'appleConnected' : 'googleConnected');
  }

  if (inputBirthCountry) inputBirthCountry.placeholder = currentLang === 'tr' ? 'Türkiye' : t('country');
  if (inputBirthCity) inputBirthCity.placeholder = t('city');
  if (inputBirthRegion) inputBirthRegion.placeholder = t('region');
  if (locationLookupStatus && !userProfile.birthplace) {
    locationLookupStatus.textContent = t('locationPrompt');
  }
  const locationAttribution = document.querySelector('.location-attribution');
  if (locationAttribution) locationAttribution.textContent = t('locationAttribution');

  const risingSelect = document.getElementById('select-profile-rising');
  if (risingSelect) {
    const currentValue = risingSelect.value;
    const options = risingSelect.querySelectorAll('option');
    if (options[0]) options[0].textContent = t('chooseRising');
    zodiacSigns.forEach((sign, index) => {
      if (options[index + 1]) {
        options[index + 1].textContent = `${sign.icon} ${sign.name[currentLang] || sign.name.en}`;
      }
    });
    risingSelect.value = currentValue;
  }

  // Refresh active result card zodiac sign translations if visible
  if (userProfile.zodiac) {
    const zObj = zodiacSigns.find(z => z.id === userProfile.zodiac);
    if (zObj && zodiacBadgeName) {
      zodiacBadgeName.textContent = zObj.name[currentLang] || zObj.name.en;
    }
    if (userProfile.risingSign && zodiacBadgeRising) {
      const rObj = zodiacSigns.find(z => z.id === userProfile.risingSign);
      if (rObj) {
        const risingPrefix = texts.risingPrefix || '🌅 Rising: ';
        zodiacBadgeRising.textContent = `${risingPrefix}${rObj.name[currentLang] || rObj.name.en}`;
      }
    }
  }

  // Refresh profile badge translations
  updateProfileBadge();
  updateAstrologyCalculations();
  void updateProfileMembershipStatus();
}

let activeStoryCanvas = null;

async function openStoryModal() {
  const zObj = !isIOSPlatform && userProfile.zodiac ? zodiacSigns.find(z => z.id === userProfile.zodiac) : null;
  const locZodiacName = zObj ? (zObj.name[currentLang] || zObj.name.en) : lastGeneratedFortune.zodiacName;

  activeStoryCanvas = await generateStoryCardCanvas({
    quote: lastGeneratedFortune.quote,
    luckyNumbers: lastGeneratedFortune.numbers,
    zodiacIcon: lastGeneratedFortune.zodiacIcon,
    zodiacName: locZodiacName,
    userName: lastGeneratedFortune.userName,
    lang: currentLang,
    brandName: 'Fortune Cookie AI',
    socialHandle: '@fortunecookieai'
  });

  storyPreviewWrapper.innerHTML = '';
  storyPreviewWrapper.appendChild(activeStoryCanvas);

  modalStory.classList.remove('hidden');
  recordFortuneEvent('story_open');
  const modalCanvas = modalStory.querySelector('.card-fireworks-canvas');
  if (modalCanvas) {
    setTimeout(() => startCardFireworksAnimation(modalCanvas), 50);
  }
}

async function shareStoryCard() {
  const texts = uiText[currentLang] || uiText.en;
  if (!activeStoryCanvas) return;
  recordFortuneEvent('share_start');

  try {
    const dataUrl = activeStoryCanvas.toDataURL('image/jpeg', 0.95);
    const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    const fileName = `fortune_story_${Date.now()}.jpg`;

    let fileUri = null;

    // The native share sheet needs a temporary cache file. This is not saved
    // to the user's gallery and is discarded by the operating system.
    try {
      const saved = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache
      });
      fileUri = saved.uri;
    } catch (fsErr) {
      console.warn('Share cache write failed:', fsErr);
    }

    // 1. Try Native Capacitor Share with actual image file array
    if (fileUri && window.Capacitor && window.Capacitor.isNativePlatform()) {
      await Share.share({
        title: texts.cardTitle || 'Fortune Cookie AI',
        text: '✨ Fortune Cookie AI · @fortunecookieai',
        files: [fileUri],
        dialogTitle: texts.btnShareStory || 'Hikayeyi Paylaş'
      });
      recordFortuneEvent('share_complete');
      showToast(texts.toastShared);
      return;
    }

    // 2. Web API Navigator.share with File object (Chrome, Safari Mobile, etc.)
    if (navigator.canShare) {
      activeStoryCanvas.toBlob(async (blob) => {
        if (blob) {
          const file = new File([blob], fileName, { type: 'image/jpeg' });
          if (navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({
                title: texts.cardTitle || 'Fortune Cookie AI',
                text: '✨ Fortune Cookie AI · @fortunecookieai',
                files: [file]
              });
              recordFortuneEvent('share_complete');
              showToast(texts.toastShared);
              return;
            } catch (shareErr) {
              if (shareErr.name !== 'AbortError') {
                console.warn('Web file share error:', shareErr);
                showToast(texts.shareUnavailable || 'Paylaşım bu cihazda kullanılamıyor.');
              }
              return;
            }
          }
        }
        showToast(texts.shareUnavailable || 'Paylaşım bu cihazda kullanılamıyor.');
      }, 'image/jpeg', 0.95);
    } else {
      showToast(texts.shareUnavailable || 'Paylaşım bu cihazda kullanılamıyor.');
    }
  } catch (e) {
    if (e.name !== 'AbortError' && e.message !== 'Share canceled') {
      console.error('Share story error:', e);
      showToast(texts.shareUnavailable || 'Paylaşım bu cihazda kullanılamıyor.');
    }
  }
}

function showToast(msg) {
  toastMessage.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}


async function updateProfileMembershipStatus(forceRefresh = false) {
  const requestedLanguage = currentLang;
  const requestedAuthContext = authContextKey();
  const accountState = await getVerifiedAccountState(forceRefresh);
  if (
    requestedLanguage !== currentLang ||
    !isCurrentAuthContext(requestedAuthContext)
  ) return;
  const isPremium = accountState?.isPremium === true;
  const premiumLimit =
    Number(accountState?.premiumUsage?.limit) ||
    Number(appSettings.premiumDailyLimit) ||
    5;
  const freeLimit =
    Number(accountState?.limits?.freeDailyLimit) ||
    Number(appSettings.freeDailyLimit) ||
    1;
  const membershipCard = document.getElementById('profile-membership-card');
  const badgeTag = document.getElementById('membership-badge-tag');
  const subtext = document.getElementById('membership-subtext');
  const btnUpgrade = document.getElementById('btn-profile-upgrade');

  if (!membershipCard) return;

  if (isPremium) {
    membershipCard.className = 'profile-membership-card premium-tier';
    if (badgeTag) badgeTag.textContent = `⭐ ${t('accountPremium')}`;
    if (subtext) subtext.textContent = t('premiumAllowance', { limit: premiumLimit });
    if (btnUpgrade) {
      btnUpgrade.textContent = `🔥 ${t('premiumEnabled')}`;
      btnUpgrade.style.opacity = '0.85';
    }
  } else {
    membershipCard.className = 'profile-membership-card free-tier';
    if (badgeTag) badgeTag.textContent = `🌱 ${t('accountFree')}`;
    if (subtext) subtext.textContent = t('freeAllowance', { limit: freeLimit });
    if (btnUpgrade) {
      btnUpgrade.textContent = `⭐ ${t('upgrade')}`;
      btnUpgrade.style.opacity = '1';
    }
  }
}

function renderAuthenticatedAccount(user, { closeProfile = false } = {}) {
  if (!user || user.isAnonymous) return;

  const authUnloggedBox = document.getElementById('auth-unlogged-box');
  const authLoggedBox = document.getElementById('auth-logged-box');
  const userAvatarImg = document.getElementById('user-avatar-img');
  const userDisplayName = document.getElementById('user-display-name');
  const userEmailText = document.getElementById('user-email-text');
  const userProviderBadge = document.getElementById('user-provider-badge');

  authUnloggedBox?.classList.add('hidden');
  authLoggedBox?.classList.remove('hidden');
  if (userDisplayName) userDisplayName.textContent = user.displayName || t('userFallback');
  if (userEmailText) userEmailText.textContent = user.email || '';
  if (userProviderBadge) {
    const usesApple = user.providerData?.some(provider => provider.providerId === 'apple.com');
    const usesPassword = user.providerData?.some(provider => provider.providerId === 'password');
    userProviderBadge.textContent = t(
      usesApple ? 'appleConnected' : usesPassword ? 'emailConnected' : 'googleConnected',
    );
  }
  if (userAvatarImg) {
    userAvatarImg.onerror = () => {
      userAvatarImg.onerror = null;
      userAvatarImg.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`;
    };
    userAvatarImg.src = user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`;
  }
  if (closeProfile) modalProfile?.classList.add('hidden');
}

function setupEventListeners() {
  let lastCookieTouchAt = 0;

  const registerCookieTap = (event) => {
    if (event?.cancelable) event.preventDefault();
    if (isAnimating || fortuneRequestInFlight) return;
    cookieTapCount += 1;
    triggerHapticFeedback(1);
    cookieInteractive.classList.remove('cookie-tap-impact');
    void cookieInteractive.offsetWidth;
    cookieInteractive.classList.add('cookie-tap-impact');

    if (cookieTapCount === 1) {
      cookieInteractive.classList.add('crack-stage-1');
      cookieInteractive.setAttribute('aria-label', t('firstCrack'));
      showToast(t('firstCrack'));
      return;
    }
    if (cookieTapCount === 2) {
      cookieInteractive.classList.add('crack-stage-2');
      cookieInteractive.setAttribute('aria-label', t('secondCrack'));
      showToast(t('secondCrack'));
      return;
    }

    cookieTapCount = 0;
    cookieInteractive.setAttribute('aria-label', t('preparingFortune'));
    showToast(`✨ ${t('preparingFortune')}`);
    void crackCookie();
  };

  // iOS decides whether to zoom before dblclick fires. Cancelling touchend keeps
  // rapid cookie taps inside the app and also suppresses the synthetic click.
  cookieInteractive.addEventListener('touchend', (event) => {
    event.preventDefault();
    lastCookieTouchAt = Date.now();
    registerCookieTap(event);
  }, { passive: false });

  // Three deliberate taps reveal progressive cracks, then start one request.
  cookieInteractive.addEventListener('click', (event) => {
    if (Date.now() - lastCookieTouchAt < 750) {
      event.preventDefault();
      return;
    }
    registerCookieTap(event);
  });
  cookieInteractive.addEventListener('dblclick', (event) => {
    event.preventDefault();
  });

  // Keyboard Access (Enter / Space) for Cookie Cracking
  cookieInteractive.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      registerCookieTap(e);
    }
  });

  btnAgain.addEventListener('click', resetToLanding);
  btnStory.addEventListener('click', openStoryModal);

  // Profile Modal & Inputs
  btnOpenProfile.addEventListener('click', async () => {
    await updateProfileMembershipStatus(true);
    beginProfileDraft();
    modalProfile.classList.remove('hidden');
  });
  btnCloseProfile.addEventListener('click', () => discardProfileDraft({ closeModal: true }));
  btnSaveProfile.addEventListener('click', handleSaveProfile);
  if (btnResolveLocation) {
    btnResolveLocation.addEventListener('click', handleResolveBirthLocation);
  }

  const btnProfileUpgrade = document.getElementById('btn-profile-upgrade');
  if (btnProfileUpgrade) {
    btnProfileUpgrade.addEventListener('click', () => {
      modalProfile.classList.add('hidden');
      const modalPremium = document.getElementById('modal-premium-store');
      if (modalPremium) modalPremium.classList.remove('hidden');
    });
  }

  const btnDeleteAccount = document.getElementById('btn-delete-account');
  const modalDeleteAccount = document.getElementById('modal-delete-account');
  const btnCancelDeleteAccount = document.getElementById('btn-cancel-delete-account');
  const btnConfirmDeleteAccount = document.getElementById('btn-confirm-delete-account');
  const btnDeleteHistory = document.getElementById('btn-delete-history');
  const modalDeleteHistory = document.getElementById('modal-delete-history');
  const btnCancelDeleteHistory = document.getElementById('btn-cancel-delete-history');
  const btnConfirmDeleteHistory = document.getElementById('btn-confirm-delete-history');
  btnDeleteHistory?.addEventListener('click', () => {
    modalDeleteHistory?.classList.remove('hidden');
    btnConfirmDeleteHistory?.focus();
  });
  btnCancelDeleteHistory?.addEventListener('click', () => {
    modalDeleteHistory?.classList.add('hidden');
    btnDeleteHistory?.focus();
  });
  modalDeleteHistory?.addEventListener('click', (event) => {
    if (event.target === modalDeleteHistory) {
      modalDeleteHistory.classList.add('hidden');
    }
  });
  btnConfirmDeleteHistory?.addEventListener('click', async () => {
    btnConfirmDeleteHistory.disabled = true;
    btnConfirmDeleteHistory.textContent = t('clearing');
    try {
      if (!(await handleClearHistory())) throw new Error('history-delete-failed');
      modalDeleteHistory?.classList.add('hidden');
      showToast(t('historyDeleteSuccess'));
    } catch (error) {
      console.warn('Fortune Cookie history could not be cleared:', error);
      showToast(t('historyDeleteError'));
    } finally {
      btnConfirmDeleteHistory.disabled = false;
      btnConfirmDeleteHistory.textContent = t('historyDeleteConfirm');
    }
  });
  if (btnDeleteAccount) {
    btnDeleteAccount.addEventListener('click', () => {
      if (!auth.currentUser || auth.currentUser.isAnonymous) return;
      modalDeleteAccount?.classList.remove('hidden');
      btnConfirmDeleteAccount?.focus();
    });
  }
  btnCancelDeleteAccount?.addEventListener('click', () => {
    modalDeleteAccount?.classList.add('hidden');
    btnDeleteAccount?.focus();
  });
  modalDeleteAccount?.addEventListener('click', (event) => {
    if (event.target === modalDeleteAccount) {
      modalDeleteAccount.classList.add('hidden');
    }
  });
  btnConfirmDeleteAccount?.addEventListener('click', async () => {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) {
        modalDeleteAccount?.classList.add('hidden');
        return;
      }

      modalDeleteAccount?.classList.add('hidden');
      btnDeleteAccount.disabled = true;
      const deleteButtonText = document.getElementById('btn-delete-account-text');
      if (deleteButtonText) deleteButtonText.textContent = t('deleting');
      try {
        const uid = user.uid;
        if (!(await deleteMyAccountFromCloud())) {
          throw new Error('account-delete-failed');
        }
        await clearHistory(uid);
        const clearedProfile = normalizeProfile(
          { ...DEFAULT_PROFILE, preferredLanguage: currentLang },
          currentLang,
        );
        replaceAuthoritativeProfile(
          await saveProfile(clearedProfile, uid) || clearedProfile,
          currentLang,
        );
        localStorage.removeItem('fc_crack_date');
        localStorage.removeItem('fc_crack_count');
        localStorage.removeItem('fc_last_anniversary_shown');
        accountStateCache = null;
        modalProfile.classList.add('hidden');
        showToast(t('deleteSuccess'));
      } catch (error) {
        console.error('Account deletion failed:', error);
        showToast(t('deleteError'));
        btnDeleteAccount.disabled = false;
        if (deleteButtonText) deleteButtonText.textContent = t('deleteButton');
      }
  });

  // Google Sign-In Handler
  const btnSignInGoogle = document.getElementById('btn-signin-google');
  if (btnSignInGoogle) {
    btnSignInGoogle.addEventListener('click', async () => {
      btnSignInGoogle.disabled = true;
      btnSignInGoogle.setAttribute('aria-busy', 'true');
      showToast(`🔑 ${t('signingGoogle')}`);
      try {
        const res = await loginWithGoogle();
        if (res.success && res.user) {
          showToast(`🎉 ${t('welcome', { name: res.user.displayName || t('userFallback') })}`);
          renderAuthenticatedAccount(res.user, { closeProfile: true });
          accountStateCache = null;
        } else {
          showToast(`⚠️ ${t('signInFailed', { error: res.error || t('cancelled') })}`);
        }
      } catch (error) {
        console.error('Google sign-in handler failed:', error);
        showToast(`⚠️ ${t('signInFailed', { error: error?.code || t('cancelled') })}`);
      } finally {
        btnSignInGoogle.disabled = false;
        btnSignInGoogle.removeAttribute('aria-busy');
      }
    });
  }

  const btnSignInApple = document.getElementById('btn-signin-apple');
  if (btnSignInApple && Capacitor.getPlatform() !== 'android') {
    btnSignInApple.addEventListener('click', async () => {
      btnSignInApple.disabled = true;
      btnSignInApple.setAttribute('aria-busy', 'true');
      showToast(t('signingApple'));
      try {
        const res = await loginWithApple();
        if (res.success && res.user) {
          showToast(t('welcome', { name: res.user.displayName || t('userFallback') }));
          renderAuthenticatedAccount(res.user, { closeProfile: true });
          accountStateCache = null;
        } else {
          showToast(t('signInFailed', { error: res.error || t('cancelled') }));
        }
      } catch (error) {
        console.error('Apple sign-in handler failed:', error);
        showToast(t('signInFailed', { error: error?.code || t('cancelled') }));
      } finally {
        btnSignInApple.disabled = false;
        btnSignInApple.removeAttribute('aria-busy');
      }
    });
  }

  const inputAuthName = document.getElementById('input-auth-name');
  const inputAuthEmail = document.getElementById('input-auth-email');
  const inputAuthPassword = document.getElementById('input-auth-password');
  const btnEmailLogin = document.getElementById('btn-email-login');
  const btnEmailRegister = document.getElementById('btn-email-register');
  const btnEmailReset = document.getElementById('btn-email-reset');
  const emailAuthStatus = document.getElementById('email-auth-status');

  const setEmailAuthBusy = (busy) => {
    [btnEmailLogin, btnEmailRegister, btnEmailReset].forEach((button) => {
      if (button) button.disabled = busy;
    });
  };
  const setEmailAuthStatus = (message, isError = false) => {
    if (!emailAuthStatus) return;
    emailAuthStatus.textContent = message;
    emailAuthStatus.classList.toggle('error', isError);
  };
  const validEmailAuthFields = () => {
    const email = inputAuthEmail?.value.trim() || '';
    const password = inputAuthPassword?.value || '';
    return /^\S+@\S+\.\S+$/.test(email) && password.length >= 8;
  };
  const emailAuthErrorMessage = (code) => {
    if (code === 'auth/email-not-verified') return t('emailVerificationRequired');
    if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') return t('emailInUse');
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return t('emailInvalidCredentials');
    return t('emailAuthError');
  };

  if (btnEmailLogin) {
    btnEmailLogin.addEventListener('click', async () => {
      if (!validEmailAuthFields()) {
        setEmailAuthStatus(t('emailInvalidFields'), true);
        return;
      }
      setEmailAuthBusy(true);
      setEmailAuthStatus(t('emailAuthBusy'));
      const result = await loginWithEmail(inputAuthEmail.value, inputAuthPassword.value);
      if (result.success && result.user) {
        inputAuthPassword.value = '';
        setEmailAuthStatus('');
        accountStateCache = null;
        renderAuthenticatedAccount(result.user, { closeProfile: true });
        showToast(t('welcome', { name: result.user.displayName || t('userFallback') }));
      } else {
        setEmailAuthStatus(emailAuthErrorMessage(result.error), true);
      }
      setEmailAuthBusy(false);
    });
  }

  if (btnEmailRegister) {
    btnEmailRegister.addEventListener('click', async () => {
      if (!validEmailAuthFields()) {
        setEmailAuthStatus(t('emailInvalidFields'), true);
        return;
      }
      setEmailAuthBusy(true);
      setEmailAuthStatus(t('emailAuthBusy'));
      const result = await registerWithEmail(
        inputAuthEmail.value,
        inputAuthPassword.value,
        inputAuthName?.value || '',
      );
      inputAuthPassword.value = '';
      if (result.success) {
        setEmailAuthStatus(t('emailVerificationSent'));
      } else {
        setEmailAuthStatus(emailAuthErrorMessage(result.error), true);
      }
      setEmailAuthBusy(false);
    });
  }

  if (btnEmailReset) {
    btnEmailReset.addEventListener('click', async () => {
      const email = inputAuthEmail?.value.trim() || '';
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        setEmailAuthStatus(t('emailInvalidFields'), true);
        return;
      }
      setEmailAuthBusy(true);
      setEmailAuthStatus(t('emailAuthBusy'));
      const result = await resetEmailPassword(email);
      setEmailAuthStatus(result.success ? t('emailResetSent') : t('emailAuthError'), !result.success);
      setEmailAuthBusy(false);
    });
  }

  const authUnloggedBox = document.getElementById('auth-unlogged-box');
  const authLoggedBox = document.getElementById('auth-logged-box');
  const btnLogoutUser = document.getElementById('btn-logout-user');

  if (btnLogoutUser) {
    btnLogoutUser.addEventListener('click', async () => {
      if (btnLogoutUser.disabled) return;
      btnLogoutUser.disabled = true;
      btnLogoutUser.setAttribute('aria-busy', 'true');
      // Invalidate account-A hydration immediately, before either native SDK
      // finishes its logout work.
      authUiVersion += 1;
      try {
        await settleWithTimeout(
          logoutRevenueCatUser(),
          2500,
          'RevenueCat logout',
          null,
        );
        const result = await logoutUser();
        if (!result.success) throw new Error(result.error || 'auth/logout-failed');
        accountStateCache = null;

        replaceAuthoritativeProfile({
          ...DEFAULT_PROFILE,
          preferredLanguage: currentLang,
        }, currentLang);
        await saveProfile(userProfile, null);
        authUiVersion += 1;
        renderProfileInputs(userProfile);
        updateProfileBadge();
        await updateAstrologyCalculations();

        showToast('🚪 Hesaptan çıkış yapıldı');
        if (authLoggedBox) authLoggedBox.classList.add('hidden');
        if (authUnloggedBox) authUnloggedBox.classList.remove('hidden');
        await Promise.all([
          updateProfileMembershipStatus(),
          updateAdStatusUI(),
        ]);
      } catch (error) {
        console.error('Logout handler failed:', error);
        showToast('Çıkış tamamlanamadı. Lütfen tekrar deneyin.');
      } finally {
        btnLogoutUser.disabled = false;
        btnLogoutUser.removeAttribute('aria-busy');
      }
    });
  }

  // Firebase Auth State Observer
  onAuthChange(async (user, syncedProfile, hydrationState = {}) => {
    const version = ++authUiVersion;
    const expectedAuthContext = authContextKey(user);
    const profileHydrationPending = hydrationState.profileHydrationPending === true;
    beginProfileHydration(expectedAuthContext);
    const isCurrentHydration = () =>
      version === authUiVersion && isCurrentAuthContext(expectedAuthContext);
    accountStateCache = null;
    try {

    if (user?.isAnonymous) {
      const localDeviceProfile = await getProfile(currentLang, null);
      if (!isCurrentHydration()) return;
      const explicitLanguage = explicitLanguageByAuthContext.get(expectedAuthContext)?.lang;
      replaceAuthoritativeProfile({
        ...localDeviceProfile,
        ...(explicitLanguage ? { preferredLanguage: explicitLanguage } : {}),
      }, currentLang);
      const previousLanguage = currentLang;
      applyHydratedLanguage(explicitLanguage || userProfile.preferredLanguage);
      if (previousLanguage !== currentLang) updateLanguageUI();
      renderProfileInputs(userProfile);
      accountStateCache = {
        exists: true,
        isPremium: false,
        membershipTier: 'free',
        premiumUsage: null,
        ownerUid: user.uid,
        source: 'anonymous-freemium',
      };
      if (authLoggedBox) authLoggedBox.classList.add('hidden');
      if (authUnloggedBox) authUnloggedBox.classList.remove('hidden');
      markInitialUserHydrationReady();
      updateProfileBadge();
      await updateAstrologyCalculations();
      if (!isCurrentHydration()) return;
      completeProfileHydration(expectedAuthContext);
      void updateAdStatusUI().catch((error) => {
        console.warn('Anonymous account status refresh deferred:', error?.message);
      });
      return;
    }

    if (user) {
      const localAccountProfile = await getProfile(currentLang, user.uid);
      if (!isCurrentHydration()) return;
      const explicitLanguage = explicitLanguageByAuthContext.get(expectedAuthContext)?.lang;
      replaceAuthoritativeProfile({
        ...mergeCloudProfile(localAccountProfile, syncedProfile),
        ...(explicitLanguage ? { preferredLanguage: explicitLanguage } : {}),
      }, currentLang);
      const profileLanguage = normalizeLanguage(
        userProfile.preferredLanguage,
        currentLang,
      );
      if (profileLanguage !== currentLang) {
        applyHydratedLanguage(profileLanguage);
        updateLanguageUI();
      }
      renderProfileInputs(userProfile);
      renderCategoryPills();
      updateProfileBadge();
      await updateAstrologyCalculations();
      if (!isCurrentHydration()) return;
      await saveProfile(userProfile, user.uid);
      if (!isCurrentHydration()) return;
      if (!profileHydrationPending) completeProfileHydration(expectedAuthContext);

      const profileSaysPremium =
        syncedProfile?.isPremium === true ||
        syncedProfile?.membershipTier === 'premium';
      if (profileSaysPremium) {
        // Premium/admin assignments may have been changed while this device
        // was signed in. Refresh the ID token before the authoritative state
        // call so new custom claims (including the 50-use admin limit) apply
        // immediately instead of waiting for the token's normal expiry.
        await user.getIdToken(true).catch((error) => {
          console.warn('Auth claim refresh deferred:', error?.code);
        });
        if (!isCurrentHydration()) return;
      }
      accountStateCache = profileSaysPremium
        ? {
            exists: true,
            isPremium: true,
            membershipTier: 'premium',
            premiumUsage: null,
            ownerUid: user.uid,
            source: 'synced-profile',
          }
        : null;

      // Firestore'dan gelen üyelik bilgisi belliyse sayaç geçmiş eşitlemesini beklemez.
      renderAuthenticatedAccount(user);
      markInitialUserHydrationReady();

      // A login can change provider, custom claims, RevenueCat identity and
      // manual admin entitlements at once. Never reuse a five-minute account
      // cache for this first authenticated hydration.
      const serverAccountState = await getAccountStateFromServer(true);
      if (!isCurrentHydration()) return;
      const serverSaysPremium =
        serverAccountState?.isPremium === true ||
        serverAccountState?.membershipTier === 'premium';
      const isPremium = serverSaysPremium || profileSaysPremium;
      accountStateCache = {
        ...(serverAccountState || {}),
        exists: serverAccountState?.exists !== false,
        isPremium,
        membershipTier: isPremium ? 'premium' : 'free',
        premiumUsage: serverAccountState?.premiumUsage || null,
        ownerUid: user.uid,
      };

      // Kullanım kartını uzun sürebilen geçmiş indirme/yükleme işlemlerinden önce göster.
      await refreshAppUIState();
      if (!isCurrentHydration()) return;
      // Store SDK identification is useful but must not hold the login screen.
      void identifyRevenueCatUser(user.uid).catch((error) => {
        console.warn('RevenueCat user identification deferred:', error?.message);
      });
      checkAndShowAnniversaryReminder();
    } else {
      const localDeviceProfile = await getProfile(currentLang, null);
      if (!isCurrentHydration()) return;
      const explicitLanguage = explicitLanguageByAuthContext.get(expectedAuthContext)?.lang;
      replaceAuthoritativeProfile({
        ...localDeviceProfile,
        ...(explicitLanguage ? { preferredLanguage: explicitLanguage } : {}),
      }, currentLang);
      const previousLanguage = currentLang;
      applyHydratedLanguage(explicitLanguage || userProfile.preferredLanguage);
      if (previousLanguage !== currentLang) updateLanguageUI();
      renderProfileInputs(userProfile);
      updateProfileBadge();
      await updateAstrologyCalculations();
      if (!isCurrentHydration()) return;
      if (authLoggedBox) authLoggedBox.classList.add('hidden');
      if (authUnloggedBox) authUnloggedBox.classList.remove('hidden');
      markInitialUserHydrationReady();
      completeProfileHydration(expectedAuthContext);
    }

    // Signed-in and anonymous paths already refreshed above. Only the signed-out
    // path needs a final refresh here.
    if (!user) await refreshAppUIState();
    } catch (error) {
      console.error('Profile hydration failed:', error);
      if (isCurrentHydration() && !profileHydrationPending) {
        markInitialUserHydrationReady();
        completeProfileHydration(expectedAuthContext);
      }
    }
  });

  if (inputProfileBirthdate) {
    inputProfileBirthdate.addEventListener('change', async () => {
      if (!profileDraft) beginProfileDraft();
      updateDraftBirthFields({ clearRising: true });
      const offset = refreshBirthTimezoneOffset(profileDraft);
      if (offset !== null && profileDraft.birthplace) {
        setLocationLookupStatus(
          `✓ ${profileDraft.birthplace} · ${profileDraft.timezoneId} · UTC${offset >= 0 ? '+' : ''}${offset}`,
          'success',
        );
      }
      await updateAstrologyCalculations(profileDraft);
    });
  }
  if (inputProfileBirthtime) {
    inputProfileBirthtime.addEventListener('change', async () => {
      if (!profileDraft) beginProfileDraft();
      updateDraftBirthFields({ clearRising: true });
      refreshBirthTimezoneOffset(profileDraft);
      await updateAstrologyCalculations(profileDraft);
    });
  }

  const selectProfileRising = document.getElementById('select-profile-rising');
  if (selectProfileRising) {
    selectProfileRising.addEventListener('change', async (e) => {
      if (!profileDraft) beginProfileDraft();
      profileDraft.risingSign = e.target.value;
      profileDraftManualRising = Boolean(e.target.value);
      await updateAstrologyCalculations(profileDraft);
    });
  }

  // History Modal
  btnOpenHistory.addEventListener('click', async () => {
    modalHistory.classList.remove('hidden');
    await renderHistoryList();
  });
  btnCloseHistory.addEventListener('click', () => modalHistory.classList.add('hidden'));

  // Story Modal
  const btnShareStory = document.getElementById('btn-share-story');
  if (btnShareStory) {
    btnShareStory.addEventListener('click', shareStoryCard);
  }
  btnCloseStory.addEventListener('click', () => modalStory.classList.add('hidden'));

  // Language Dropdown inside Profile Modal
  if (selectLanguage) {
    selectLanguage.addEventListener('change', (e) => void setLanguage(e.target.value));
  }

  // Rewarded Video Ad Handler
  // Premium Package Buttons
  const btnPremiumTop = document.getElementById('btn-premium-top');
  const btnLandingPremium = document.getElementById('btn-landing-premium');
  const openPremiumModal = () => {
    const modalPremium = document.getElementById('modal-premium-store');
    if (modalPremium) {
      modalPremium.classList.remove('hidden');
      const modalCanvas = modalPremium.querySelector('.card-fireworks-canvas');
      if (modalCanvas) {
        setTimeout(() => startCardFireworksAnimation(modalCanvas), 50);
      }
    }
  };
  if (btnPremiumTop) btnPremiumTop.addEventListener('click', openPremiumModal);
  if (btnLandingPremium) btnLandingPremium.addEventListener('click', openPremiumModal);

  // Close Premium Modal
  const btnClosePremium = document.getElementById('btn-close-premium');
  if (btnClosePremium) {
    btnClosePremium.addEventListener('click', () => {
      document.getElementById('modal-premium-store').classList.add('hidden');
    });
  }

  // RevenueCat Purchase Package Handler (99 TL / $2.99 VIP Plan)
  const btnBuyYearly = document.getElementById('btn-buy-yearly');
  if (btnBuyYearly) {
    btnBuyYearly.addEventListener('click', async () => {
      showToast('🛍️ Mağaza işlemi başlatılıyor...');
      const res = await purchasePackage(null);
      if (res.success) {
        showToast('🎉 VIP Premium Üyeliğiniz Aktif Edildi!');
        document.getElementById('modal-premium-store').classList.add('hidden');
      } else if (res.requiresLogin) {
        showToast('⚠️ Satın alma için önce Google ile giriş yapın.');
      } else if (res.unavailableOnWeb) {
        showToast('ℹ️ Satın alma yalnızca iOS ve Android uygulamasında kullanılabilir.');
      } else if (res.noOffering || res.configurationError) {
        showToast('⚠️ Mağaza paketi şu anda kullanılamıyor.');
      } else if (res.pendingVerification) {
        showToast('⏳ Satın alma doğrulanıyor. Birkaç saniye sonra tekrar kontrol edin.');
      } else if (!res.userCancelled) {
        showToast('⚠️ Satın alma tamamlanamadı.');
      }
      accountStateCache = null;
      await refreshAppUIState();
    });
  }

  // AI Rising Sign Unlock Listener (1-time free for Premium AI Members)
  const btnUnlockRisingFree = document.getElementById('btn-unlock-rising-free');
  if (btnUnlockRisingFree) {
    btnUnlockRisingFree.addEventListener('click', async () => {
      await unlockAIRisingSign();
    });
  }

  // RevenueCat Restore Purchases Handler
  const btnRestorePurchases = document.getElementById('btn-restore-purchases');
  if (btnRestorePurchases) {
    btnRestorePurchases.addEventListener('click', async () => {
      showToast('🔄 Satın alımlar kontrol ediliyor...');
      const res = await restorePurchases();
      if (res.isPremium) {
        showToast('✅ Premium üyeliğiniz başarıyla geri yüklendi!');
      } else if (res.requiresLogin) {
        showToast('⚠️ Satın alımları geri yüklemek için giriş yapın.');
      } else if (res.unavailableOnWeb) {
        showToast('ℹ️ Geri yükleme yalnızca mobil uygulamada kullanılabilir.');
      } else {
        showToast('ℹ️ Aktif bir abonelik bulunamadı.');
      }
      accountStateCache = null;
      await refreshAppUIState();
    });
  }

  // Anniversary Reminder Modal Listeners
  const btnCloseAnniversary = document.getElementById('btn-close-anniversary');
  if (btnCloseAnniversary) {
    btnCloseAnniversary.addEventListener('click', () => {
      document.getElementById('modal-anniversary-reminder').classList.add('hidden');
    });
  }
  const btnAnniversaryStory = document.getElementById('btn-anniversary-story');
  if (btnAnniversaryStory) {
    btnAnniversaryStory.addEventListener('click', () => {
      document.getElementById('modal-anniversary-reminder').classList.add('hidden');
      if (activeAnniversaryItem) {
        lastGeneratedFortune = {
          quote: activeAnniversaryItem.quote || activeAnniversaryItem.text || '',
          numbers: activeAnniversaryItem.numbers || [7, 14, 21, 33, 42, 88],
          zodiacIcon: activeAnniversaryItem.zodiacIcon || '✨',
          zodiacName: activeAnniversaryItem.zodiacName || '',
          userName: activeAnniversaryItem.userName || userProfile.name || '',
          contentId: activeAnniversaryItem.contentId || '',
          contentCategory: activeAnniversaryItem.contentCategory || '',
          contentSource: activeAnniversaryItem.contentSource || '',
          variantType: activeAnniversaryItem.variantType || '',
          requestId: activeAnniversaryItem.requestId || ''
        };
        openStoryModal();
      }
    });
  }

  // Global Preview Helper for Testing
  window.previewAnniversaryModal = function() {
    showAnniversaryModal({
      quote: "Sabırla dikilen tohum, hiç beklemediğin anda en tatlı meyvesini verir.",
      timestamp: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      numbers: [7, 12, 28, 34, 49, 77],
      zodiacIcon: "✨",
      zodiacName: "Astro",
      userName: userProfile.name || "Seeker"
    });
  };

  if (btnWatchAdReward) {
    btnWatchAdReward.addEventListener('click', async () => {
      btnWatchAdReward.disabled = true;
      try {
        showToast('🎬 Ödüllü reklam hazırlanıyor...');
        const rewardResult = await adManager.showRewardedAdModal();
        const progress = adManager.getAdProgress();
        if (rewardResult.creditGranted) {
          showToast(t('adCreditGranted'));
        } else if (rewardResult.verified) {
          showToast(t('adVerifiedProgress', progress));
        } else if (rewardResult.pending) {
          showToast(t('adVerificationPending'));
          for (const delay of [6000, 18000]) {
            window.setTimeout(() => {
              void updateAdStatusUI(true);
            }, delay);
          }
        } else {
          showToast(t('adUnavailable'));
        }
        await updateAdStatusUI();
      } catch (error) {
        console.warn('Rewarded ad interaction failed:', error);
        showToast('Reklam bağlantısı kurulamadı. Lütfen yeniden deneyin.');
      } finally {
        btnWatchAdReward.disabled = false;
        await updateAdStatusUI();
      }
    });
  }

  if (btnCloseAd) {
    btnCloseAd.addEventListener('click', () => {
      document.getElementById('modal-rewarded-ad').classList.add('hidden');
    });
  }

  btnSoundToggle.addEventListener('click', () => {
    const isEnabled = soundManager.toggleSound();
    soundIcon.classList.toggle('is-muted', !isEnabled);
  });
}

document.addEventListener('DOMContentLoaded', init);
