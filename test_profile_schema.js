import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROFILE,
  normalizeProfile,
} from './profileSchema.js';

test('complete profile survives normalization without losing cloud fields', () => {
  const profile = normalizeProfile({
    name: '  Atakan   Çelik  ',
    birthdate: '1990-11-12',
    birthtime: '08:35',
    birthplace: 'Kadıköy, İstanbul, Türkiye',
    birthCountry: 'Türkiye',
    birthCity: 'İstanbul',
    birthRegion: 'Kadıköy',
    timezoneId: 'Europe/Istanbul',
    latitude: 40.991,
    longitude: 29.027,
    timezoneOffset: 3,
    zodiac: 'scorpio',
    risingSign: 'sagittarius',
    astrologyOptIn: true,
    risingSource: 'manual',
    category: 'career',
    categories: ['career'],
    preferredLanguage: 'tr',
  });

  assert.deepEqual(profile, {
    name: 'Atakan Çelik',
    birthdate: '1990-11-12',
    birthtime: '08:35',
    birthplace: 'Kadıköy, İstanbul, Türkiye',
    birthCountry: 'Türkiye',
    birthCity: 'İstanbul',
    birthRegion: 'Kadıköy',
    timezoneId: 'Europe/Istanbul',
    latitude: 40.991,
    longitude: 29.027,
    timezoneOffset: 3,
    zodiac: 'scorpio',
    risingSign: 'sagittarius',
    astrologyOptIn: true,
    risingSource: 'manual',
    category: 'career',
    categories: ['career'],
    preferredLanguage: 'tr',
  });
});

test('profile supports clearing optional fields instead of reviving stale values', () => {
  const profile = normalizeProfile({
    ...DEFAULT_PROFILE,
    name: '',
    birthplace: '',
    risingSign: '',
    latitude: null,
  });

  assert.equal(profile.name, '');
  assert.equal(profile.birthplace, '');
  assert.equal(profile.risingSign, '');
  assert.equal(profile.latitude, null);
  assert.equal(DEFAULT_PROFILE.birthtime, '');
  assert.equal(DEFAULT_PROFILE.astrologyOptIn, false);
  assert.equal(DEFAULT_PROFILE.risingSource, '');
});

test('legacy astrology fields do not silently opt in', () => {
  const profile = normalizeProfile({
    birthdate: '1990-11-12',
    birthtime: '12:00',
    zodiac: 'scorpio',
    risingSign: 'sagittarius',
  });

  assert.equal(profile.birthtime, '12:00');
  assert.equal(profile.zodiac, 'scorpio');
  assert.equal(profile.risingSign, 'sagittarius');
  assert.equal(profile.astrologyOptIn, false);
  assert.equal(profile.risingSource, '');
});

test('astrology provenance accepts only explicit supported values', () => {
  const manual = normalizeProfile({
    astrologyOptIn: true,
    risingSource: 'MANUAL',
  });
  const invalid = normalizeProfile({
    astrologyOptIn: 'true',
    risingSource: 'guessed',
  });

  assert.equal(manual.astrologyOptIn, true);
  assert.equal(manual.risingSource, 'manual');
  assert.equal(invalid.astrologyOptIn, false);
  assert.equal(invalid.risingSource, '');
});

test('invalid profile choices are constrained to safe defaults', () => {
  const profile = normalizeProfile({
    birthdate: '2026-02-31',
    birthtime: '25:99',
    latitude: 90,
    category: 'unlimited',
    preferredLanguage: 'xx',
  });

  assert.equal(profile.birthdate, '');
  assert.equal(profile.birthtime, '');
  assert.equal(profile.latitude, null);
  assert.equal(profile.category, 'general');
  assert.deepEqual(profile.categories, ['general']);
  assert.equal(profile.preferredLanguage, 'tr');
});
