/**
 * Astrology Calculation Engine
 * Astronomical Rising Sign (Ascendant) Calculator + Hourly Planetary Transit Seeds
 */

import { zodiacSigns } from './zodiacData.js';

const ZODIAC_ORDER = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];

const PLANETARY_HOURS = ['sun', 'venus', 'mercury', 'moon', 'saturn', 'jupiter', 'mars'];

/**
 * Calculate Sun Sign (Zodiac) based on Birth Date
 */
export function calculateSunSign(birthDateStr) {
  if (!birthDateStr) return null;
  try {
    const [year, month, day] = birthDateStr.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      !Number.isInteger(year) ||
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) return null;

    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return zodiacSigns.find(z => z.id === 'aries');
    if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return zodiacSigns.find(z => z.id === 'taurus');
    if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return zodiacSigns.find(z => z.id === 'gemini');
    if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return zodiacSigns.find(z => z.id === 'cancer');
    if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return zodiacSigns.find(z => z.id === 'leo');
    if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return zodiacSigns.find(z => z.id === 'virgo');
    if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return zodiacSigns.find(z => z.id === 'libra');
    if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return zodiacSigns.find(z => z.id === 'scorpio');
    if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return zodiacSigns.find(z => z.id === 'sagittarius');
    if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return zodiacSigns.find(z => z.id === 'capricorn');
    if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return zodiacSigns.find(z => z.id === 'aquarius');
    if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return zodiacSigns.find(z => z.id === 'pisces');
  } catch (err) {
    return null;
  }
  return null;
}

/**
 * Calculate the tropical Ascendant from UTC time, latitude and longitude.
 * timezoneOffset is the local UTC offset at birth (for example, Istanbul +3).
 */
export function calculateRisingSign(
  birthDateStr,
  birthTimeStr = '12:00',
  { latitude, longitude, timezoneOffset } = {}
) {
  if (!birthDateStr) return null;

  try {
    const [year, month, day] = birthDateStr.split('-').map(Number);
    const [hours, minutes] = (birthTimeStr || '').split(':').map(Number);
    const lat = Number(latitude);
    const lon = Number(longitude);
    const offset = Number(timezoneOffset);

    if (!calculateSunSign(birthDateStr)) return null;
    if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;
    if (!Number.isFinite(lat) || lat < -66 || lat > 66) return null;
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
    if (!Number.isFinite(offset) || offset < -12 || offset > 14) return null;

    const utcMillis = Date.UTC(year, month - 1, day, hours, minutes)
      - offset * 60 * 60 * 1000;
    const julianDate = utcMillis / 86400000 + 2440587.5;
    const centuries = (julianDate - 2451545.0) / 36525;
    const gmst = 280.46061837
      + 360.98564736629 * (julianDate - 2451545.0)
      + 0.000387933 * centuries * centuries
      - (centuries * centuries * centuries) / 38710000;
    const siderealDegrees = ((gmst + lon) % 360 + 360) % 360;
    const sidereal = siderealDegrees * Math.PI / 180;
    const latitudeRad = lat * Math.PI / 180;
    const obliquity = (23.439291 - 0.0130042 * centuries) * Math.PI / 180;

    let ascendant = Math.atan2(
      -Math.cos(sidereal),
      Math.sin(obliquity) * Math.tan(latitudeRad)
        + Math.cos(obliquity) * Math.sin(sidereal)
    ) * 180 / Math.PI;
    ascendant = ((ascendant + 180) % 360 + 360) % 360;

    const risingIndex = Math.floor(ascendant / 30) % 12;
    const risingSignId = ZODIAC_ORDER[risingIndex];

    return zodiacSigns.find(z => z.id === risingSignId) || zodiacSigns[0];
  } catch (err) {
    console.error('Rising Sign Calculation Error:', err);
    return null;
  }
}

/**
 * Calculate current Hourly Astrological Planetary Transit
 * Determines current ruling planet & energy state for AI prompt alignment
 */
export function getCurrentHourlyTransit(date = new Date()) {
  const currentHour = date.getHours();
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
  // Determine current Planetary Hour Ruler
  const planetIndex = (dayOfWeek * 24 + currentHour) % PLANETARY_HOURS.length;
  const rulingPlanet = PLANETARY_HOURS[planetIndex];

  // Synodic cycle anchored to a known new moon: 2000-01-06 18:14 UTC.
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const synodicMonth = 29.53058867;
  const elapsedDays = (date.getTime() - knownNewMoon) / 86400000;
  const moonPhaseCycle = ((elapsedDays % synodicMonth) + synodicMonth) % synodicMonth;
  let moonPhase = 'New Moon';
  if (moonPhaseCycle >= 3.7 && moonPhaseCycle < 11.1) moonPhase = 'Waxing Crescent';
  else if (moonPhaseCycle >= 11.1 && moonPhaseCycle < 18.5) moonPhase = 'Full Moon';
  else if (moonPhaseCycle >= 18.5 && moonPhaseCycle < 25.9) moonPhase = 'Waning Moon';

  return {
    hour: currentHour,
    rulingPlanet,
    moonPhase,
    transitSeed: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${currentHour}`
  };
}
