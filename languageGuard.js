const LATIN_MARKERS = {
  tr: new Set(['ve', 'bir', 'bu', 'bugün', 'bugünün', 'yarının', 'için', 'ile', 'sana', 'seni', 'senin', 'biri', 'en', 'insan', 'arasındaki', 'kendine', 'kendi', 'kişinin', 'yüzündeki', 'olan', 'gibi', 'ama', 'daha']),
  en: new Set(['the', 'and', 'your', 'you', 'a', 'an', 'to', 'of', 'in', 'with', 'that', 'while', 'today']),
  de: new Set(['der', 'die', 'das', 'den', 'und', 'dein', 'deine', 'du', 'ein', 'eine', 'mit', 'heute', 'wird', 'wenn', 'ist', 'als']),
  fr: new Set(['le', 'la', 'les', 'et', 'votre', 'vous', 'tu', 'ton', 'ta', 'tes', 'un', 'une', 'de', 'des', 'avec', 'aujourd’hui', 'que']),
  es: new Set(['el', 'la', 'los', 'las', 'y', 'tu', 'tus', 'un', 'una', 'de', 'con', 'hoy', 'que']),
  it: new Set(['il', 'lo', 'la', 'gli', 'le', 'e', 'tuo', 'tua', 'un', 'una', 'di', 'con', 'oggi', 'che']),
};

const INVALID_LITERAL_TOKEN =
  /(?:^|[^\p{L}\p{M}\p{N}_])(?:null|undefined|NaN)(?=$|[^\p{L}\p{M}\p{N}_])/u;
const UNRESOLVED_TEMPLATE_TOKEN =
  /(?:\{\{\s*[A-Za-z_$][\w.$-]*\s*\}\}|\$\{\s*[A-Za-z_$][\w.$-]*\s*\}|<<?\s*(?:name|user[._-]?name|first[._-]?name|display[._-]?name|profile[._-]?name)\s*>>?|\[\s*(?:name|user[._-]?name|first[._-]?name|display[._-]?name|profile[._-]?name)\s*\]|\{\s*(?:name|user[._-]?name|first[._-]?name|display[._-]?name|profile[._-]?name)\s*\}|__(?:NAME|USER_NAME|FIRST_NAME|DISPLAY_NAME)__|%(?:NAME|USER_NAME|FIRST_NAME|DISPLAY_NAME)%|@@(?:NAME|USER_NAME|FIRST_NAME|DISPLAY_NAME)@@)/iu;

const FRIGHTENING_OUTCOME_PATTERNS = {
  tr: /(?:^|[^\p{L}\p{M}])(?:intihar|öl(?:üm\p{L}*|mek|me|dü\p{L}*|ecek\p{L}*)|kaza\p{L}*|çarpış\p{L}*|yaralan\p{L}*)(?=$|[^\p{L}\p{M}])/iu,
  en: /(?:^|[^\p{L}\p{M}])(?:suicide|death|dead|dying|die|dies|fatal\p{L}*|mortal\p{L}*|accidents?|crash(?:es|ed|ing)?|collisions?|kill(?:ed|ing)?|murder\p{L}*|injur(?:y|ies|ed))(?=$|[^\p{L}\p{M}])/iu,
  de: /(?:^|[^\p{L}\p{M}])(?:tod|todes\p{L}*|tödlich\p{L}*|sterben|stirbt|starb|(?:auto|verkehrs)?unfall\p{L}*|crash\p{L}*|kollision\p{L}*|zusammenstoß\p{L}*|zusammenprall\p{L}*|absturz\p{L}*|verletz\p{L}*)(?=$|[^\p{L}\p{M}])/iu,
  fr: /(?:^|[^\p{L}\p{M}])(?:suicide|mort(?:e|s|es)?|mourir|meurt|décès|mortel\p{L}*|accident\p{L}*|crash\p{L}*|collision\p{L}*|carambolage\p{L}*|choc\p{L}*|blessure\p{L}*)(?=$|[^\p{L}\p{M}])/iu,
  es: /(?:^|[^\p{L}\p{M}])(?:suicidio|muerte|muert\p{L}*|morir|muere|fallec\p{L}*|mortal\p{L}*|fatal\p{L}*|accidente\p{L}*|choque\p{L}*|colisión\p{L}*|lesión\p{L}*|herida\p{L}*)(?=$|[^\p{L}\p{M}])/iu,
  it: /(?:^|[^\p{L}\p{M}])(?:suicidio|morte|mort\p{L}*|morire|muore|decess\p{L}*|fatale\p{L}*|incidente\p{L}*|schianto\p{L}*|collisione\p{L}*|scontr\p{L}*|lesione\p{L}*|ferita\p{L}*)(?=$|[^\p{L}\p{M}])/iu,
  el: /(?:αυτοκτον|θάνατ|πεθάν|νεκρ|θανατηφόρ|θανάσιμ|ατύχημα|δυστύχημα|τροχαί|σύγκρουσ|τραυματισ)/iu,
  ko: /(?:자살|죽음|사망|목숨|죽(?:다|는|을|었)|치명적|사고|충돌|추락|교통사고|중상)/u,
  ja: /(?:自殺|死亡|死ぬ|死(?:に|ん|亡)|命を落と|致命的|事故|衝突|墜落|交通事故|重傷)/u,
  zh: /(?:自杀|自殺|死亡|死去|丧生|喪生|致命|事故|车祸|車禍|碰撞|相撞|坠毁|墜毀|重伤|重傷)/u,
};

function comparablePersonalText(value, language = 'en') {
  const locale = /^[a-z]{2}$/i.test(language) ? language : 'en';
  return String(value || '')
    .normalize('NFKC')
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/[‐‑‒–—]/gu, '-')
    .toLocaleLowerCase(locale);
}

function isNameBoundary(character) {
  return !character || !/[\p{L}\p{M}\p{N}]/u.test(character);
}

export function hasExactlyOnePersonalName(value, expectedName = '', language = 'en') {
  const name = comparablePersonalText(expectedName, language).trim();
  if (!name) return true;
  const text = comparablePersonalText(value, language);
  let occurrences = 0;
  let cursor = 0;
  while (cursor <= text.length - name.length) {
    const index = text.indexOf(name, cursor);
    if (index < 0) break;
    const before = text.slice(0, index).match(/.$/u)?.[0] || '';
    const after = text.slice(index + name.length).match(/^./u)?.[0] || '';
    if (isNameBoundary(before) && isNameBoundary(after)) occurrences += 1;
    cursor = index + Math.max(name.length, 1);
  }
  return occurrences === 1;
}

export function hasInvalidFortuneToken(value) {
  const text = String(value || '').normalize('NFKC');
  return INVALID_LITERAL_TOKEN.test(text) || UNRESOLVED_TEMPLATE_TOKEN.test(text);
}

export function hasFrighteningOutcome(value, language = 'en') {
  const pattern = FRIGHTENING_OUTCOME_PATTERNS[language] || FRIGHTENING_OUTCOME_PATTERNS.en;
  return pattern.test(String(value || '').normalize('NFKC'));
}

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
  if (requestedLanguage === 'en') {
    return requestedScore > 0
      ? requestedScore >= competitorScore
      : competitorScore === 0;
  }
  return requestedScore > 0 && requestedScore >= competitorScore;
}
