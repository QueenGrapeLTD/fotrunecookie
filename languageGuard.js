const LATIN_MARKERS = {
  tr: new Set(['ve', 'bir', 'bu', 'bugün', 'için', 'ile', 'sana', 'senin', 'olan', 'gibi', 'ama', 'daha', 'kendi']),
  en: new Set(['the', 'and', 'your', 'you', 'a', 'an', 'to', 'of', 'in', 'with', 'that', 'while', 'today']),
  de: new Set(['der', 'die', 'das', 'und', 'dein', 'deine', 'du', 'ein', 'eine', 'mit', 'heute', 'wird', 'wenn']),
  fr: new Set(['le', 'la', 'les', 'et', 'votre', 'vous', 'un', 'une', 'de', 'des', 'avec', 'aujourd’hui', 'que']),
  es: new Set(['el', 'la', 'los', 'las', 'y', 'tu', 'tus', 'un', 'una', 'de', 'con', 'hoy', 'que']),
  it: new Set(['il', 'lo', 'la', 'gli', 'le', 'e', 'tuo', 'tua', 'un', 'una', 'di', 'con', 'oggi', 'che']),
};

function wordsOf(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}’']+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function markerScore(words, language) {
  const markers = LATIN_MARKERS[language];
  return words.reduce((score, word) => score + (markers.has(word) ? 1 : 0), 0);
}

export function isLikelyLanguage(value, requestedLanguage) {
  const text = String(value || '').trim();
  if (!text) return false;

  if (requestedLanguage === 'el') return /\p{Script=Greek}/u.test(text);
  if (requestedLanguage === 'ko') return /\p{Script=Hangul}/u.test(text);
  if (requestedLanguage === 'ja') return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
  if (requestedLanguage === 'zh') {
    return /\p{Script=Han}/u.test(text) && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
  }

  if (!LATIN_MARKERS[requestedLanguage]) return false;
  if (/[\p{Script=Greek}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)) {
    return false;
  }

  const words = wordsOf(text);
  const requestedScore = markerScore(words, requestedLanguage);
  const competitorScore = Math.max(
    ...Object.keys(LATIN_MARKERS)
      .filter(language => language !== requestedLanguage)
      .map(language => markerScore(words, language)),
  );
  return requestedScore > 0 ? requestedScore >= competitorScore : competitorScore === 0;
}

