// Fortune History & User Profile Native Storage Manager (Capacitor)
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { DEFAULT_PROFILE, normalizeProfile } from './profileSchema.js';

const HISTORY_FILE = 'fortune_cookie_history_v1.json';
const PROFILE_KEY = 'fortune_cookie_profile_v1';

// Cache for history to prevent constant disk reads
let historyCache = null;

async function getStoredHistory() {
  if (historyCache) return historyCache;
  try {
    const result = await Filesystem.readFile({
      path: HISTORY_FILE,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    const parsed = JSON.parse(result.data);
    historyCache = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    historyCache = [];
  }
  return historyCache;
}

async function writeStoredHistory(history) {
  const safeHistory = Array.isArray(history) ? history : [];
  await Filesystem.writeFile({
    path: HISTORY_FILE,
    data: JSON.stringify(safeHistory),
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  });
  historyCache = safeHistory;
}

function historyFingerprint(item) {
  const day = String(item?.timestamp || '').slice(0, 10);
  const numbers = Array.isArray(item?.numbers) ? item.numbers.join(',') : '';
  return `${day}|${String(item?.quote || item?.text || '').trim()}|${numbers}`;
}

function newestFirst(a, b) {
  return new Date(b?.timestamp || 0).getTime() - new Date(a?.timestamp || 0).getTime();
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
    const newItem = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...fortuneItem,
      ownerUid: ownerUid || null,
    };
    
    history.unshift(newItem); // newest first
    const ownerItems = history.filter(item => item.ownerUid === newItem.ownerUid);
    if (ownerItems.length > 100) {
      const excessItems = new Set(ownerItems.slice(100));
      await writeStoredHistory(history.filter(item => !excessItems.has(item)));
    } else {
      await writeStoredHistory(history);
    }
    return newItem;
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
  const normalizedCloud = (Array.isArray(cloudItems) ? cloudItems : []).map(item => ({
    ...item,
    id: item.id || item.cloudId || `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    cloudId: item.cloudId || item.id || null,
    ownerUid,
  }));

  const otherAccounts = claimedLocal.filter(item => item.ownerUid !== ownerUid);
  const candidates = [
    ...normalizedCloud,
    ...claimedLocal.filter(item => item.ownerUid === ownerUid),
  ].sort(newestFirst);
  const seenIds = new Set();
  const seenFingerprints = new Set();
  const mergedOwnerHistory = candidates.filter(item => {
    const id = String(item.cloudId || item.id || '');
    const fingerprint = historyFingerprint(item);
    if ((id && seenIds.has(id)) || (fingerprint && seenFingerprints.has(fingerprint))) {
      return false;
    }
    if (id) seenIds.add(id);
    if (fingerprint) seenFingerprints.add(fingerprint);
    return true;
  }).slice(0, 100);

  await writeStoredHistory([...mergedOwnerHistory, ...otherAccounts]);
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
export async function getProfile(fallbackLanguage = 'tr') {
  try {
    const { value } = await Preferences.get({ key: PROFILE_KEY });
    return value
      ? normalizeProfile(JSON.parse(value))
      : normalizeProfile({ ...DEFAULT_PROFILE, preferredLanguage: fallbackLanguage }, fallbackLanguage);
  } catch (e) {
    return normalizeProfile({ ...DEFAULT_PROFILE, preferredLanguage: fallbackLanguage }, fallbackLanguage);
  }
}

export async function saveProfile(profileData) {
  try {
    const normalizedProfile = normalizeProfile(
      profileData,
      profileData?.preferredLanguage,
    );
    await Preferences.set({
      key: PROFILE_KEY,
      value: JSON.stringify(normalizedProfile)
    });
    return normalizedProfile;
  } catch (e) {
    console.error('Save profile error', e);
    return null;
  }
}
