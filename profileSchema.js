export const PROFILE_CATEGORIES = Object.freeze([
  'general',
  'love',
  'career',
  'health',
]);

export const PROFILE_LANGUAGES = Object.freeze([
  'tr',
  'en',
  'de',
  'fr',
  'es',
  'it',
  'el',
  'zh',
  'ja',
  'ko',
]);

const ZODIAC_SIGNS = new Set([
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
]);

const RISING_SOURCES = new Set([
  '',
  'manual',
  'calculated',
]);

export const DEFAULT_PROFILE = Object.freeze({
  name: '',
  birthdate: '',
  birthtime: '',
  birthplace: '',
  birthCountry: '',
  birthCity: '',
  birthRegion: '',
  timezoneId: '',
  latitude: null,
  longitude: null,
  timezoneOffset: null,
  zodiac: '',
  risingSign: '',
  astrologyOptIn: false,
  risingSource: '',
  category: 'general',
  categories: ['general'],
  preferredLanguage: 'tr',
});

function cleanString(value, maxLength) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function boundedNumber(value, min, max) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

function validDate(value) {
  const text = cleanString(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text
    ? ''
    : text;
}

function validTime(value) {
  const text = cleanString(value, 5);
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : '';
}

function validSign(value) {
  const sign = cleanString(value, 20).toLowerCase();
  return ZODIAC_SIGNS.has(sign) ? sign : '';
}

function validRisingSource(value) {
  const source = cleanString(value, 10).toLowerCase();
  return RISING_SOURCES.has(source) ? source : '';
}

export function normalizeProfile(profile = {}, fallbackLanguage = 'tr') {
  const requestedCategory = cleanString(
    profile.category || profile.categories?.[0] || 'general',
    20,
  ).toLowerCase();
  const category = PROFILE_CATEGORIES.includes(requestedCategory)
    ? requestedCategory
    : 'general';
  const requestedLanguage = cleanString(
    profile.preferredLanguage || fallbackLanguage,
    5,
  ).toLowerCase();

  return {
    name: cleanString(profile.name, 80),
    birthdate: validDate(profile.birthdate),
    birthtime: validTime(profile.birthtime),
    birthplace: cleanString(profile.birthplace, 120),
    birthCountry: cleanString(profile.birthCountry, 80),
    birthCity: cleanString(profile.birthCity, 80),
    birthRegion: cleanString(profile.birthRegion, 80),
    timezoneId: cleanString(profile.timezoneId, 80),
    latitude: boundedNumber(profile.latitude, -66, 66),
    longitude: boundedNumber(profile.longitude, -180, 180),
    timezoneOffset: boundedNumber(profile.timezoneOffset, -12, 14),
    zodiac: validSign(profile.zodiac),
    risingSign: validSign(profile.risingSign),
    astrologyOptIn: profile.astrologyOptIn === true,
    risingSource: validRisingSource(profile.risingSource),
    category,
    categories: [category],
    preferredLanguage: PROFILE_LANGUAGES.includes(requestedLanguage)
      ? requestedLanguage
      : 'tr',
  };
}
