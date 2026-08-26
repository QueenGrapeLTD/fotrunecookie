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
import { isLikelyLanguage } from './languageGuard.js';

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

export function isFortuneSafe(value) {
  const text = cleanText(value);
  if (text.length < 15 || text.length > 360) return false;
  return !UNSAFE_PATTERNS.some(pattern => pattern.test(text));
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

  if (isFortuneSafe(baseFortune)) {
    return name ? `${name}, ${cleanText(baseFortune)}` : cleanText(baseFortune);
  }

  const db = getDatabase();
  const langData = db?.[lang] || db?.tr || db?.en || {};
  const category = profile.category || 'general';
  const candidates = langData[category] || langData.general || [];

  if (Array.isArray(candidates) && candidates.length) {
    for (let attempt = 0; attempt < Math.min(candidates.length, 25); attempt += 1) {
      const candidate = candidates[Math.floor(Math.random() * candidates.length)];
      if (isFortuneSafe(candidate)) {
        const text = cleanText(candidate);
        return name ? `${name}, ${text}` : text;
      }
    }
  }

  return getSafeFallback(lang, name);
}

const DIRECT_STYLE_CUES = {
  tr: [
    'gün içinde gelen kısa bir mesaj veya sıcak bir konuşma',
    'işte ya da üretimde fark edilen küçük bir fırsat',
    'yeni bir tanışma, davet veya tatlı bir tesadüf',
    'ertelenen bir konuda verilen sade ama cesur bir karar',
    'ev, aile veya yakın bir dostla yaşanan içten bir an',
    'merak uyandıran yeni bir fikir, rota veya öğrenme isteği',
    'beklenmedik küçük bir jest ya da sevindirici haber',
    'günlük ritmi hafifleten keyifli bir değişiklik',
  ],
  en: [
    'a short message or warm conversation during the day',
    'a small opportunity noticed in work or creativity',
    'a new introduction, invitation, or pleasant coincidence',
    'a simple but courageous decision about something delayed',
    'a sincere moment involving home, family, or a close friend',
    'a fresh idea, route, or desire to learn',
    'an unexpected kind gesture or welcome news',
    'a pleasant change that brings a lighter daily rhythm',
  ],
};

const LANGUAGE_NAMES = {
  tr: 'Türkçe', en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español',
  it: 'Italiano', el: 'Ελληνικά', zh: '简体中文', ja: '日本語', ko: '한국어'
};

function buildPrompt(profile = {}, lang = 'tr') {
  const name = cleanText(profile.name).slice(0, 50) || (lang === 'tr' ? 'Gezgin' : 'Seeker');
  const sun = cleanText(profile.zodiac) || 'Belirtilmedi';
  const rising = cleanText(profile.risingSign) || 'Belirtilmedi';
  const categoryKey = (profile.category || 'general').toLowerCase();
  const styleCues = DIRECT_STYLE_CUES[lang] || DIRECT_STYLE_CUES.en;
  const styleCue = styleCues[Math.floor(Math.random() * styleCues.length)];

  return `ROL VE MİSYON:
Sen göksel haritadan ilham alan, neşeli, sıcak ve zeki bir Şans Kurabiyesi yazarısın.

KULLANICI HARİTA VE ODAK BİLGİLERİ:
- İsim: ${name}
- Güneş Burcu: ${sun}
- Yükselen Burç: ${rising}
- Odak Alanı: ${categoryKey} (Aşk, Kariyer, Huzur veya Genel Şans)
- Çıktı Dili: ${LANGUAGE_NAMES[lang] || LANGUAGE_NAMES.en} (${lang})
- Yanıtın tamamını yalnızca bu dilde ve o dilin doğal yazım sistemiyle yaz; başka dil karıştırma.
- Bu çıktının yaratıcı yönü: ${styleCue}

ÖNEMLİ YAZIM VE ÇEŞİTLİLİK KURALLARI:
1. Burç yalnızca ince bir ton sinyalidir; element, yönetici gezegen veya burç klişelerinden sahne üretme.
2. "Derin sular, sessizlik, karanlık, gölgeler, sabır, vakti gelince, kaya, dağ, zirve, fırtına, şafak ve ışık" kalıp havuzunu kullanma.
3. Verilen yaratıcı yönden günlük hayata dokunan, somut ve taze tek bir işaret çıkar.
4. Seçilen odak alanına (${categoryKey}) doğrudan temas et.
5. İsmi kullanmak zorunlu değildir; kullanırsan en fazla bir kez ve doğal biçimde kullan.
6. Kesin gelecek iddiası yerine "olabilir, fark edebilirsin, kapı aralayabilir" gibi yumuşak bir dil seç.
7. Ölüm, cinayet, intihar, kaza, hastalık ve felaket gibi korkutucu kavramlar kesinlikle yasaktır.
8. Japon tsujiura senbei öncüllerini ve omikuji'nin yaşam rehberi yaklaşımını bilen, sakin ve şefkatli Japon bir büyükanne anlatıcısının sesiyle yaz. Aksan, karikatür, kutsal otorite veya Japonya kartpostalı klişeleri kullanma.
9. Önce gündelik ya da mevsimsel tek duyusal görüntü, ardından ölçülü ve uygulanabilir bir yön ver.
10. Tam 1 veya 2 kısa cümle, 12–22 kelime ve en fazla 135 karakter. Yalnızca Şans Kurabiyesi mesajını döndür; tırnak, emoji ve açıklama yazma.`;
}

async function callGeminiDirect(profile, lang, options) {
  if (!options.apiKey || options.apiKey.length <= 20) return null;

  const model = options.model || 'gemini-3.5-flash-lite';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${options.apiKey}`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(profile, lang) }] }],
    generationConfig: {
      maxOutputTokens: 90
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  return cleanText(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

export async function fetchRemoteAIPrediction(profile = {}, lang = 'tr', options = {}) {
  const requestId =
    options.requestId ||
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}_${Math.random().toString(36).slice(2, 18)}`;
  let cloudError = null;
  try {
    const cloudResult = await callGenerateFortuneCloudFunction({
      ...profile
    }, lang, requestId);

    if (
      isFortuneSafe(cloudResult?.prediction) &&
      isLikelyLanguage(cloudResult.prediction, lang)
    ) {
      return cloudResult;
    }

    if (cloudResult?.prediction) {
      console.warn('Cloud fortune rejected by safety or language guard.', { lang });
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
    ]);
    if (terminalCodes.has(error?.code)) throw error;
  }

  try {
    const directText = await callGeminiDirect(profile, lang, options);
    if (isFortuneSafe(directText) && isLikelyLanguage(directText, lang)) {
      return {
        success: true,
        prediction: directText,
        provider: 'Gemini-3.5-Flash-Lite (Direct API)'
      };
    }
  } catch (error) {
    console.warn('Direct Gemini generation unavailable:', error);
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
