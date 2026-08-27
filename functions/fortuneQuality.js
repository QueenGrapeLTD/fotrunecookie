"use strict";

const STOP_WORDS = new Set([
  "ama", "ancak", "bir", "bile", "bu", "çok", "da", "de", "en", "gibi",
  "için", "ile", "kadar", "kendi", "o", "olan", "sana", "seni", "senin",
  "ve", "veya", "yakında", "zaman", "the", "a", "an", "and", "but", "for",
  "in", "into", "of", "on", "or", "that", "to", "will", "with", "your",
]);

const MOTIF_PATTERNS = {
  // Keep Turkish `su` inflections explicit. A broad `su*` stem also matches
  // the strongly positive word "sürpriz" after accent normalization.
  depths: /(?:^|\s)(derin\p{L}*|dip|dibe|dibi|dipte|dipten|su|suda|sudan|suya|suyu|suyla|sular\p{L}*|kuyu\p{L}*|depth\p{L}*|deep|water\p{L}*)(?=\s|$)/iu,
  darkness: /(?:^|\s)(karanl\p{L}*|golge\p{L}*|gizem\p{L}*|dark\p{L}*|shadow\p{L}*|myster\p{L}*)(?=\s|$)/iu,
  silence: /(?:^|\s)(sessiz\p{L}*|fısılt\p{L}*|suskun\p{L}*|silence|silent|whisper\p{L}*)(?=\s|$)/iu,
  // Do not use a broad `bekle*` stem here: the positive word "beklenmedik"
  // (unexpected) begins the same way but is not a waiting/patience cliché.
  patience: /(?:^|\s)(sabır\p{L}*|vakti\p{L}*|bekleyiş\p{L}*|beklemek|bekleyen|patien\p{L}*|waiting|waits)(?=\s|$)/iu,
  mountain: /(?:^|\s)(dag\p{L}*|kaya\p{L}*|zirve\p{L}*|patika\p{L}*|mountain\p{L}*|rock\p{L}*|peak\p{L}*|path\p{L}*)(?=\s|$)/iu,
  light: /(?:^|\s)(ısı(?:k|g)\p{L}*|aydın\p{L}*|safak\p{L}*|parla\p{L}*|light\p{L}*|dawn\p{L}*|bright\p{L}*|shine\p{L}*)(?=\s|$)/iu,
  // "Sarsılmaz güven" is an uplifting phrase, not storm imagery.
  storm: /(?:^|\s)(fırtına\p{L}*|storm\p{L}*|shake\p{L}*)(?=\s|$)/iu,
};

// These expressions intentionally target discouraging conclusions rather than
// every negative word. A fortune may acknowledge uncertainty, but it must not
// leave the reader feeling doomed, worthless, abandoned or hopeless.
const DISCOURAGING_PATTERNS = [
  /\b(?:umut\s+yok|değersiz(?:sin)?|başarısız(?:sın)?|çaresiz(?:sin)?|boşuna|asla\s+başaram|yalnız\s+kalacaksın|kaybedeceksin|geç\s+kaldın|pişman\s+olacaksın)\b/iu,
  /\b(?:no\s+hope|hopeless|worthless|you(?:'|’)ll\s+fail|you\s+will\s+fail|you(?:'|’)ll\s+be\s+alone|you\s+will\s+be\s+alone|too\s+late|all\s+is\s+lost|regret\s+it)\b/iu,
  /\b(?:hoffnungslos|wertlos|du\s+wirst\s+scheitern|du\s+wirst\s+allein\s+sein|alles\s+ist\s+verloren)\b/iu,
  /\b(?:sans\s+espoir|tu\s+échoueras|vous\s+échouerez|tu\s+seras\s+seul|vous\s+serez\s+seul|tout\s+est\s+perdu)\b/iu,
  /\b(?:sin\s+esperanza|fracasarás|estarás\s+solo|todo\s+está\s+perdido)\b/iu,
  /\b(?:senza\s+speranza|fallirai|resterai\s+solo|tutto\s+è\s+perduto)\b/iu,
  /(?:没有希望|毫无希望|你会失败|你将失败|你会孤独|一切都失去了)/u,
  /(?:希望がない|絶望的|あなたは失敗する|ひとりになる|すべてを失う)/u,
  /(?:희망이\s*없|절망적|실패할\s*것|혼자가\s*될|모든\s*것을\s*잃)/u,
  /(?:χωρίς\s+ελπίδα|θα\s+αποτύχεις|θα\s+μείνεις\s+μόνος|όλα\s+χάθηκαν)/iu,
];

// Fortune cookies should not make the reader walk through a gloomy premise
// before reaching the hopeful part. These terms are intentionally broader
// than DISCOURAGING_PATTERNS: they reject problem-first emotional framing even
// when the sentence eventually resolves it positively.
const HEAVY_NEGATIVE_FRAMING_PATTERNS = [
  /\b(?:yoran|karmaşık|düğüm|kaygı|endişe|korku|yalnızlık|acı|yük|baskı|sıkıntı|üzüntü|karamsar|tüken\p{L}*|başarısız\p{L}*|kayıp|çaresiz\p{L}*)\b/iu,
  /\b(?:burden\p{L}*|worr\p{L}*|anxious|anxiety|fear\p{L}*|lonely|loneliness|pain\p{L}*|pressure|struggl\p{L}*|exhaust\p{L}*|failure|hopeless\p{L}*|confus\p{L}*)\b/iu,
  /\b(?:sorge\p{L}*|angst\p{L}*|einsam\p{L}*|schmerz\p{L}*|druck|last\p{L}*|erschöpf\p{L}*|scheitern|hoffnungslos\p{L}*)\b/iu,
  /\b(?:inquiét\p{L}*|peur\p{L}*|solitude|douleur\p{L}*|pression|fardeau\p{L}*|épuis\p{L}*|échec\p{L}*|désespoir\p{L}*)\b/iu,
  /\b(?:preocup\p{L}*|miedo\p{L}*|soledad|dolor\p{L}*|presión|carga\p{L}*|agot\p{L}*|fracaso\p{L}*|desesper\p{L}*)\b/iu,
  /\b(?:preoccup\p{L}*|paura|solitudine|dolore\p{L}*|pressione|peso|esaur\p{L}*|fallimento|disper\p{L}*)\b/iu,
  /(?:忧虑|担心|恐惧|孤独|痛苦|压力|负担|疲惫|失败|绝望)/u,
  /(?:不安|心配|恐れ|孤独|痛み|苦しみ|重圧|負担|疲れ|失敗|絶望)/u,
  /(?:불안|걱정|두려움|외로움|고통|압박|부담|지침|실패|절망)/u,
  /\b(?:άγχος|ανησυχ\p{L}*|φόβο\p{L}*|μοναξιά|πόνο\p{L}*|πίεση|βάρος|εξάντληση|αποτυχία|απελπισία)\b/iu,
];

const UPLIFTING_PATTERNS = {
  tr: /(?:^|[^\p{L}])(?:şans|uğur|umut|fırsat|sevinç|neşe|güzel|gülümse\p{L}*|ferah\p{L}*|keyif\p{L}*|sıcak|yakınlık|cesaret|güven|sürpriz)(?=$|[^\p{L}])/iu,
  en: /(?:^|[^\p{L}])(?:luck\p{L}*|hope\p{L}*|opportunit\p{L}*|joy\p{L}*|welcome|beautiful|smile\p{L}*|relief|delight\p{L}*|warmth|confidence|pleasant|good)(?=$|[^\p{L}])/iu,
  de: /(?:^|[^\p{L}])(?:glück\p{L}*|hoffnung\p{L}*|chance\p{L}*|freude\p{L}*|schön\p{L}*|lächeln\p{L}*|warm\p{L}*|zuversicht\p{L}*|erleichter\p{L}*|willkommen)(?=$|[^\p{L}])/iu,
  fr: /(?:^|[^\p{L}])(?:chance\p{L}*|espoir\p{L}*|joie\p{L}*|heureu\p{L}*|beau\p{L}*|belle\p{L}*|sourire\p{L}*|chaleureu\p{L}*|confiance|soulagement|agréable|surprise)(?=$|[^\p{L}])/iu,
  es: /(?:^|[^\p{L}])(?:suerte|esperanza|oportunidad\p{L}*|alegr\p{L}*|feliz|bonit\p{L}*|hermos\p{L}*|sonrisa\p{L}*|cálid\p{L}*|confianza|alivio|agradable|sorpresa)(?=$|[^\p{L}])/iu,
  it: /(?:^|[^\p{L}])(?:fortuna|speranza|opportunità|gioia|felic\p{L}*|bell\p{L}*|sorriso\p{L}*|cald\p{L}*|fiducia|sollievo|piacevole|sorpresa)(?=$|[^\p{L}])/iu,
  el: /(?:τύχη|ελπίδα|ευκαιρία|χαρά|όμορφ|χαμόγελο|ζεστ|εμπιστοσύνη|ανακούφιση|έκπληξη)/iu,
  zh: /(?:幸运|好运|希望|机会|喜悦|开心|美好|温暖|惊喜|安心|幸福)/u,
  ja: /(?:幸運|幸せ|希望|機会|嬉|喜び|素敵|温か|チャンス|安心|笑顔|楽し)/u,
  ko: /(?:행운|행복|희망|기회|기쁨|좋은|따뜻|안심|미소|즐거|반가)/u,
};

const STALE_MYSTIC_MOTIFS = new Set([
  "depths",
  "darkness",
  "silence",
  "patience",
  "mountain",
  "storm",
]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentWords(value) {
  return normalizeText(value)
    .split(" ")
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function jaccardSimilarity(left, right) {
  const leftSet = new Set(contentWords(left));
  const rightSet = new Set(contentWords(right));
  if (!leftSet.size || !rightSet.size) return 0;
  const intersection = [...leftSet].filter((word) => rightSet.has(word)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return intersection / union;
}

function smallerSetCoverage(left, right) {
  const leftSet = new Set(contentWords(left));
  const rightSet = new Set(contentWords(right));
  if (!leftSet.size || !rightSet.size) return 0;
  const intersection = [...leftSet].filter((word) => rightSet.has(word)).length;
  return intersection / Math.min(leftSet.size, rightSet.size);
}

function motifSignature(value) {
  const text = normalizeText(value);
  return Object.entries(MOTIF_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
}

function sharedMotifCount(left, right) {
  const rightMotifs = new Set(motifSignature(right));
  return motifSignature(left).filter((motif) => rightMotifs.has(motif)).length;
}

function isTooSimilar(candidate, recentFortunes = []) {
  const normalizedCandidate = normalizeText(candidate);
  if (!normalizedCandidate) return true;

  return recentFortunes.some((entry) => {
    const previous = typeof entry === "string" ? entry : entry?.text;
    if (!previous) return false;
    const normalizedPrevious = normalizeText(previous);
    if (normalizedCandidate === normalizedPrevious) return true;
    if (jaccardSimilarity(candidate, previous) >= 0.34) return true;
    if (smallerSetCoverage(candidate, previous) >= 0.46) return true;
    return sharedMotifCount(candidate, previous) >= 3;
  });
}

function hasDiscouragingTone(value) {
  const text = String(value || "").normalize("NFKC");
  return DISCOURAGING_PATTERNS.some((pattern) => pattern.test(text));
}

function hasHeavyNegativeFraming(value) {
  const text = String(value || "").normalize("NFKC");
  return HEAVY_NEGATIVE_FRAMING_PATTERNS.some((pattern) => pattern.test(text));
}

function hasQuestionForm(value) {
  return /[?？]/u.test(String(value || "").normalize("NFKC"));
}

function hasUpliftingTone(value, lang = "en") {
  const pattern = UPLIFTING_PATTERNS[lang] || UPLIFTING_PATTERNS.en;
  return pattern.test(String(value || "").normalize("NFKC"));
}

function hasStaleMysticCliche(value) {
  return motifSignature(value).some((motif) => STALE_MYSTIC_MOTIFS.has(motif));
}

module.exports = {
  contentWords,
  hasDiscouragingTone,
  hasHeavyNegativeFraming,
  hasQuestionForm,
  hasStaleMysticCliche,
  hasUpliftingTone,
  isTooSimilar,
  jaccardSimilarity,
  motifSignature,
  normalizeText,
  sharedMotifCount,
  smallerSetCoverage,
};
