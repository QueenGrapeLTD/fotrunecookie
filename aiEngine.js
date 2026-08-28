/**
 * Personalized Fortune Cookie Engine
 *
 * Notes:
 * - Birth date determines the Sun sign.
 * - A Rising sign requires birth date, exact birth time and birth place.
 * - This module uses profile.zodiac/profile.risingSign after those values have
 *   been calculated by the profile/astrology layer.
 */

import { callGenerateFortuneCloudFunction } from './firebaseService.js';
import { fortunesDatabase } from './fortunesData.js';
import {
  hasExactlyOnePersonalName,
  hasFrighteningOutcome,
  hasInvalidFortuneToken,
  isLikelyLanguage,
} from './languageGuard.js';

const CUSTOM_FORTUNES_KEY = 'fc_custom_fortunes_db_v2';

export const zodiacElements = {
  aries: { element: 'fire', quality: 'cardinal', ruler: 'Mars', symbol: '♈', aspect: 'passion' },
  taurus: { element: 'earth', quality: 'fixed', ruler: 'Venus', symbol: '♉', aspect: 'abundance' },
  gemini: { element: 'air', quality: 'mutable', ruler: 'Mercury', symbol: '♊', aspect: 'intellect' },
  cancer: { element: 'water', quality: 'cardinal', ruler: 'Moon', symbol: '♋', aspect: 'intuition' },
  leo: { element: 'fire', quality: 'fixed', ruler: 'Sun', symbol: '♌', aspect: 'radiance' },
  virgo: { element: 'earth', quality: 'mutable', ruler: 'Mercury', symbol: '♍', aspect: 'wisdom' },
  libra: { element: 'air', quality: 'cardinal', ruler: 'Venus', symbol: '♎', aspect: 'harmony' },
  scorpio: { element: 'water', quality: 'fixed', ruler: 'Pluto', symbol: '♏', aspect: 'transformation' },
  sagittarius: { element: 'fire', quality: 'mutable', ruler: 'Jupiter', symbol: '♐', aspect: 'expansion' },
  capricorn: { element: 'earth', quality: 'cardinal', ruler: 'Saturn', symbol: '♑', aspect: 'mastery' },
  aquarius: { element: 'air', quality: 'fixed', ruler: 'Uranus', symbol: '♒', aspect: 'innovation' },
  pisces: { element: 'water', quality: 'mutable', ruler: 'Neptune', symbol: '♓', aspect: 'serenity' }
};

const SAFE_FALLBACKS = {
  tr: [
    'Bugün atacağın küçük ama cesur bir adım, beklediğinden güzel bir fırsatın kapısını aralayabilir.',
    'İçindeki merak seni doğru yere götürüyor; önündeki günlerde yüzünü gülümsetecek bir gelişmeye yer aç.',
    'Emeğinin karşılığı yavaşça şekilleniyor; bugün kendine güvenerek ilerlediğin bir konu yakında ferahlık getirebilir.'
  ],
  en: [
    'A small but courageous step today may open the door to a brighter opportunity than you expect.',
    'Your curiosity is guiding you well; leave room for a welcome development in the days ahead.',
    'Your effort is quietly taking shape, and steady progress may soon bring a refreshing result.'
  ]
};

const UNSAFE_PATTERNS = [
  /\b(intihar|öl(?:üm|eceksin|mek)|cinayet|öldür|kaza|felaket|kıyamet|kanser|mezar|cenaze)\b/iu,
  /\b(suicide|kill(?:ed|ing)?|murder|death|fatal|disaster|cancer|grave|funeral)\b/iu,
  /\b(her şey(?:ini)? kaybedeceksin|yalnız kalacaksın|asla mutlu olamayacaksın|umut yok)\b/iu,
  /\b(you will lose everything|you will be alone|you will never be happy|there is no hope)\b/iu
];

function cleanText(value) {
  return String(value || '')
    .trim()
    .replace(/^["'«»“”]+|["'«»“”]+$/g, '')
    .replace(/\s+/g, ' ');
}

function sanitizeFortuneName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}\s.'’-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32);
}

export function isFortuneSafe(value, lang = 'en', expectedName = '') {
  const text = cleanText(value);
  if (text.length < 15 || text.length > 360) return false;
  if (UNSAFE_PATTERNS.some(pattern => pattern.test(text))) return false;
  if (hasFrighteningOutcome(text, lang)) return false;
  if (hasInvalidFortuneToken(text)) return false;
  return hasExactlyOnePersonalName(text, expectedName, lang);
}

function getDatabase() {
  try {
    const custom = localStorage.getItem(CUSTOM_FORTUNES_KEY);
    if (custom) return JSON.parse(custom);
  } catch (error) {
    console.warn('Custom fortune database could not be read:', error);
  }
  return fortunesDatabase;
}

function getSafeFallback(lang = 'tr', name = '') {
  const list = SAFE_FALLBACKS[lang] || SAFE_FALLBACKS.en;
  const fortune = list[Math.floor(Math.random() * list.length)];
  return name ? `${name}, ${fortune.charAt(0).toLocaleLowerCase(lang)}${fortune.slice(1)}` : fortune;
}

export function generatePersonalizedAIFortune(profile = {}, lang = 'tr', baseFortune = '') {
  const name = cleanText(profile.name).slice(0, 50);

  if (isFortuneSafe(baseFortune, lang)) {
    return name ? `${name}, ${cleanText(baseFortune)}` : cleanText(baseFortune);
  }

  const db = getDatabase();
  const langData = db?.[lang] || db?.tr || db?.en || {};
  const category = profile.category || 'general';
  const candidates = langData[category] || langData.general || [];

  if (Array.isArray(candidates) && candidates.length) {
    for (let attempt = 0; attempt < Math.min(candidates.length, 25); attempt += 1) {
      const candidate = candidates[Math.floor(Math.random() * candidates.length)];
      if (isFortuneSafe(candidate, lang)) {
        const text = cleanText(candidate);
        return name ? `${name}, ${text}` : text;
      }
    }
  }

  return getSafeFallback(lang, name);
}

export async function fetchRemoteAIPrediction(profile = {}, lang = 'tr', options = {}) {
  const requestId =
    options.requestId ||
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}_${Math.random().toString(36).slice(2, 18)}`;
  let cloudError = null;
  const expectedName = sanitizeFortuneName(profile.name);
  try {
    const cloudResult = await callGenerateFortuneCloudFunction({
      ...profile
    }, lang, requestId);

    if (
      isFortuneSafe(cloudResult?.prediction, lang, expectedName) &&
      isLikelyLanguage(cloudResult.prediction, lang)
    ) {
      return cloudResult;
    }

    if (cloudResult?.prediction) {
      console.warn('Cloud fortune rejected by output validation.', { lang });
    }
  } catch (error) {
    cloudError = error;
    console.warn('Cloud fortune generation unavailable:', error);
    const terminalCodes = new Set([
      'functions/resource-exhausted',
      'resource-exhausted',
      'functions/permission-denied',
      'permission-denied',
      'functions/unauthenticated',
      'unauthenticated',
      'functions/aborted',
      'aborted',
      'functions/unavailable',
      'unavailable',
    ]);
    if (terminalCodes.has(error?.code)) throw error;
  }

  if (options.requireRemote) {
    if (cloudError) throw cloudError;
    const error = new Error('AI fortune service did not return a valid response.');
    error.code = 'functions/internal';
    throw error;
  }

  return {
    success: true,
    prediction: generatePersonalizedAIFortune(profile, lang),
    isFallback: true,
    provider: 'Curated-Fortune-Database'
  };
}
