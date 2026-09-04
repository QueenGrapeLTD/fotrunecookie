const LATIN_MARKERS = {
  tr: new Set(["ve", "bir", "bu", "bugün", "bugünün", "yarının", "için", "ile", "sana", "seni", "senin", "biri", "en", "insan", "arasındaki", "kendine", "kendi", "kişinin", "yüzündeki", "olan", "gibi", "ama", "daha"]),
  en: new Set(["the", "and", "your", "you", "a", "an", "to", "of", "in", "with", "that", "while", "today"]),
  de: new Set(["der", "die", "das", "den", "und", "dein", "deine", "du", "ein", "eine", "mit", "heute", "wird", "wenn", "ist", "als"]),
  fr: new Set(["le", "la", "les", "et", "votre", "vous", "tu", "ton", "ta", "tes", "un", "une", "de", "des", "avec", "aujourd’hui", "que"]),
  es: new Set(["el", "la", "los", "las", "y", "tu", "tus", "un", "una", "de", "con", "hoy", "que"]),
  it: new Set(["il", "lo", "la", "gli", "le", "e", "tuo", "tua", "un", "una", "di", "con", "oggi", "che"]),
};

function wordsOf(value) {
  return String(value || "").toLocaleLowerCase().normalize("NFKC")
    .replace(/[^\p{L}\p{M}’']+/gu, " ").trim().split(/\s+/).filter(Boolean);
}

function markerScore(words, language) {
  return words.reduce((score, word) => score + (LATIN_MARKERS[language].has(word) ? 1 : 0), 0);
}

function isLikelyLanguage(value, requestedLanguage) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (requestedLanguage === "el") return /\p{Script=Greek}/u.test(text);
  if (requestedLanguage === "ko") return /\p{Script=Hangul}/u.test(text);
  if (requestedLanguage === "ja") return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
  if (requestedLanguage === "zh") {
    return /\p{Script=Han}/u.test(text) && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
  }
  if (!LATIN_MARKERS[requestedLanguage]) return false;
  if (/[\p{Script=Greek}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)) return false;
  const words = wordsOf(text);
  const requestedScore = markerScore(words, requestedLanguage);
  const competitorScore = Math.max(...Object.keys(LATIN_MARKERS)
    .filter(language => language !== requestedLanguage)
    .map(language => markerScore(words, language)));
  if (requestedLanguage === "en") {
    return requestedScore > 0
      ? requestedScore >= competitorScore
      : competitorScore === 0;
  }
  return requestedScore > 0 && requestedScore >= competitorScore;
}

module.exports = { isLikelyLanguage };
