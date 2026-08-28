// Fortune History & User Profile Native Storage Manager (Capacitor)
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { DEFAULT_PROFILE, normalizeProfile } from './profileSchema.js';

const HISTORY_FILE = 'fortune_cookie_history_v1.json';
const HISTORY_LOCAL_KEY = 'fortune_cookie_history_v2';
const LEGACY_PROFILE_KEY = 'fortune_cookie_profile_v1';
const PROFILE_KEY_PREFIX = 'fortune_cookie_profile_v2';

// Cache for history to prevent constant disk reads
let historyCache = null;

async function getStoredHistory() {
  if (historyCache) return historyCache;
  try {
    const localValue = localStorage.getItem(HISTORY_LOCAL_KEY);
    if (localValue) {
      const localHistory = JSON.parse(localValue);
      if (Array.isArray(localHistory)) {
        historyCache = localHistory;
        return historyCache;
      }
    }
  } catch (error) {
    console.warn('Local history cache could not be read', error?.message);
  }
  try {
    const result = await Filesystem.readFile({
      path: HISTORY_FILE,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    const parsed = JSON.parse(result.data);
    historyCache = Array.isArray(parsed) ? parsed : [];
    localStorage.setItem(HISTORY_LOCAL_KEY, JSON.stringify(historyCache));
  } catch (e) {
    historyCache = [];
  }
  return historyCache;
}

async function writeStoredHistory(history) {
  const safeHistory = Array.isArray(history) ? history : [];
  const serializedHistory = JSON.stringify(safeHistory);
  localStorage.setItem(HISTORY_LOCAL_KEY, serializedHistory);
  try {
    await Filesystem.writeFile({
      path: HISTORY_FILE,
      data: serializedHistory,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
  } catch (error) {
    // WebViews and scoped Android storage can deny Documents access. The
    // localStorage copy remains authoritative for anonymous device history.
    console.warn('History file mirror could not be written', error?.message);
  }
  historyCache = safeHistory;
}

function historyFingerprint(item) {
  const day = String(item?.timestamp || '').slice(0, 10);
  const quote = String(item?.quote || item?.text || '').trim().replace(/\s+/g, ' ');
  return `${day}|${quote}`;
}

function newestFirst(a, b) {
  return new Date(b?.timestamp || 0).getTime() - new Date(a?.timestamp || 0).getTime();
}

function meaningful(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function historyRichness(item) {
  const weightedFields = [
    ['numbers', 3],
    ['zodiacId', 1],
    ['zodiacIcon', 1],
    ['zodiacName', 1],
    ['contentId', 1],
    ['contentCategory', 1],
    ['contentSource', 1],
    ['variantType', 1],
    ['reflection', 4],
    ['reaction', 2],
    ['reflectedAt', 1],
  ];
  return weightedFields.reduce(
    (score, [field, weight]) => score + (meaningful(item?.[field]) ? weight : 0),
    0,
  );
}

function canonicalRequestId(items) {
  for (const item of items) {
    const requestId = String(item?.requestId || '').trim();
    if (requestId) return requestId;
  }
  return '';
}

function mergeHistoryGroup(items, ownerUid) {
  const ranked = [...items].sort((a, b) => {
    const richnessDifference = historyRichness(b) - historyRichness(a);
    return richnessDifference || newestFirst(a, b);
  });
  const richest = ranked[0] || {};
  const merged = { ...richest };

  for (const item of ranked.slice(1)) {
    for (const [field, value] of Object.entries(item || {})) {
      if (!meaningful(merged[field]) && meaningful(value)) merged[field] = value;
    }
  }

  const reflected = ranked
    .filter(item => meaningful(item?.reflection) || meaningful(item?.reaction))
    .sort((a, b) => new Date(b?.reflectedAt || 0) - new Date(a?.reflectedAt || 0))[0];
  if (reflected) {
    merged.reflection = String(reflected.reflection || '').trim().slice(0, 500);
    merged.reaction = ['keep', 'act', 'release'].includes(reflected.reaction)
      ? reflected.reaction
      : '';
    merged.reflectedAt = reflected.reflectedAt || merged.reflectedAt || '';
  }

  const requestId = canonicalRequestId(ranked);
  const fallbackId = String(
    richest.id || richest.cloudId || ranked.find(item => item?.id)?.id || Date.now(),
  );
  merged.id = requestId || fallbackId;
  merged.cloudId = requestId || merged.cloudId || null;
  merged.requestId = requestId || String(merged.requestId || '');
  merged.ownerUid = ownerUid || null;
  merged.cloudPersisted = ranked.some(item => item?.cloudPersisted === true);
  return merged;
}

/**
 * Pure reconciliation helper used by the store and deterministic tests.
 * requestId is authoritative; the legacy day+quote key joins pre-requestId rows.
 */
export function mergeHistoryRecords(cloudItems = [], localItems = [], ownerUid = null) {
  const normalizedCloud = (Array.isArray(cloudItems) ? cloudItems : []).map(item => ({
    ...item,
    id: item?.requestId || item?.id || item?.cloudId || '',
    cloudId: item?.requestId || item?.cloudId || item?.id || null,
    ownerUid,
    cloudPersisted: true,
  }));
  const normalizedLocal = (Array.isArray(localItems) ? localItems : []).map(item => ({
    ...item,
    ownerUid,
  }));
  const byRequest = new Map();

  for (const item of [...normalizedCloud, ...normalizedLocal]) {
    const requestId = String(item?.requestId || '').trim();
    const key = requestId
      ? `request:${requestId}`
      : `legacy:${historyFingerprint(item)}`;
    if (!byRequest.has(key)) byRequest.set(key, []);
    byRequest.get(key).push(item);
  }

  const byFingerprint = new Map();
  for (const group of byRequest.values()) {
    const merged = mergeHistoryGroup(group, ownerUid);
    const fingerprint = historyFingerprint(merged);
    if (!byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, []);
    byFingerprint.get(fingerprint).push(merged);
  }

  return [...byFingerprint.values()]
    .map(group => mergeHistoryGroup(group, ownerUid))
    .sort(newestFirst)
    .slice(0, 100);
}

/**
 * HISTORY STORE (Uses Filesystem for robust JSON storage in Documents dir)
 */
export async function getHistory(ownerUid = undefined) {
  const history = await getStoredHistory();
  if (ownerUid === undefined) return history;
  if (ownerUid) return history.filter(item => item.ownerUid === ownerUid);
  return history.filter(item => !item.ownerUid);
}

export async function saveFortuneToHistory(fortuneItem, ownerUid = null) {
  try {
    const history = await getStoredHistory();
    const requestId = String(fortuneItem?.requestId || '').trim();
    const newItem = {
      id: requestId || Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...fortuneItem,
      ...(requestId ? { id: requestId, requestId } : {}),
      ownerUid: ownerUid || null,
    };

    const otherOwners = history.filter(item => item.ownerUid !== newItem.ownerUid);
    const ownerItems = mergeHistoryRecords(
      [],
      [newItem, ...history.filter(item => item.ownerUid === newItem.ownerUid)],
      newItem.ownerUid,
    );
    await writeStoredHistory([...ownerItems, ...otherOwners]);
    return ownerItems.find(item => item.id === newItem.id) || newItem;
  } catch (e) {
    console.error('History save error', e);
    return null;
  }
}

export async function mergeHistoryFromCloud(cloudItems, ownerUid) {
  if (!ownerUid) return getHistory(null);

  const stored = await getStoredHistory();
  const claimedLocal = stored.map(item =>
    item.ownerUid ? item : { ...item, ownerUid }
  );
  const otherAccounts = claimedLocal.filter(item => item.ownerUid !== ownerUid);
  const mergedOwnerHistory = mergeHistoryRecords(
    cloudItems,
    claimedLocal.filter(item => item.ownerUid === ownerUid),
    ownerUid,
  );

  try {
    await writeStoredHistory([...mergedOwnerHistory, ...otherAccounts]);
  } catch (error) {
    // Cloud history must still be visible when a browser or device denies
    // access to the Capacitor Documents store. Persistence can recover later.
    console.warn('Merged history could not be cached locally', error?.message);
    historyCache = [...mergedOwnerHistory, ...otherAccounts];
  }
  return mergedOwnerHistory;
}

export async function clearHistory(ownerUid = null) {
  try {
    const history = await getStoredHistory();
    const remaining = ownerUid
      ? history.filter(item => item.ownerUid !== ownerUid)
      : history.filter(item => item.ownerUid);
    await writeStoredHistory(remaining);
  } catch (e) {
    console.error('Clear history error', e);
  }
}

/**
 * Check if any saved fortune in history matches today's month and day (1-year / multi-year Anniversary)
 */
export async function checkAnniversaryFortunes(ownerUid = null) {
  const history = await getHistory(ownerUid);
  if (!history || history.length === 0) return null;

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDate = today.getDate();
  const currentYear = today.getFullYear();

  // Find a fortune generated on the same calendar day in a previous year
  const match = history.find(item => {
    if (!item.timestamp) return false;
    const itemDate = new Date(item.timestamp);
    return itemDate.getMonth() === currentMonth &&
           itemDate.getDate() === currentDate &&
           itemDate.getFullYear() < currentYear;
  });

  return match || null;
}

/**
 * PROFILE STORE (Uses Preferences for lightweight key-value storage)
 */
function profileStorageKey(ownerUid = null) {
  const owner = String(ownerUid || 'device')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 128) || 'device';
  return `${PROFILE_KEY_PREFIX}:${owner}`;
}

export async function getProfile(fallbackLanguage = 'tr', ownerUid = null) {
  try {
    const key = profileStorageKey(ownerUid);
    let { value } = await Preferences.get({ key });

    // The old key contained device-wide data. It is safe to migrate only into
    // the anonymous/device profile; copying it into a signed-in account could
    // leak another account's name or birth details after an account switch.
    if (!value && !ownerUid) {
      const legacy = await Preferences.get({ key: LEGACY_PROFILE_KEY });
      value = legacy.value;
      if (value) {
        await Preferences.set({ key, value });
        await Preferences.remove({ key: LEGACY_PROFILE_KEY }).catch(() => {});
      }
    }
    return value
      ? normalizeProfile(JSON.parse(value), fallbackLanguage)
      : normalizeProfile({ ...DEFAULT_PROFILE, preferredLanguage: fallbackLanguage }, fallbackLanguage);
  } catch (e) {
    return normalizeProfile({ ...DEFAULT_PROFILE, preferredLanguage: fallbackLanguage }, fallbackLanguage);
  }
}

export async function saveProfile(profileData, ownerUid = null) {
  try {
    const normalizedProfile = normalizeProfile(
      profileData,
      profileData?.preferredLanguage,
    );
    await Preferences.set({
      key: profileStorageKey(ownerUid),
      value: JSON.stringify(normalizedProfile)
    });
    return normalizedProfile;
  } catch (e) {
    console.error('Save profile error', e);
    return null;
  }
}
