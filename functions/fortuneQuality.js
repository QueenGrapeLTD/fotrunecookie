"use strict";

const STOP_WORDS = new Set([
  "ama", "ancak", "bir", "bile", "bu", "çok", "da", "de", "en", "gibi",
  "için", "ile", "kadar", "kendi", "o", "olan", "sana", "seni", "senin",
  "ve", "veya", "yakında", "zaman", "the", "a", "an", "and", "but", "for",
  "in", "into", "of", "on", "or", "that", "to", "will", "with", "your",
]);

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

function comparablePersonalText(value, language = "en") {
  const locale = /^[a-z]{2}$/i.test(language) ? language : "en";
  return String(value || "")
    .normalize("NFKC")
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/[‐‑‒–—]/gu, "-")
    .toLocaleLowerCase(locale);
}

function isNameBoundary(character) {
  return !character || !/[\p{L}\p{M}\p{N}]/u.test(character);
}

function hasExactlyOnePersonalName(value, expectedName = "", language = "en") {
  const name = comparablePersonalText(expectedName, language).trim();
  if (!name) return true;
  const text = comparablePersonalText(value, language);
  let occurrences = 0;
  let cursor = 0;
  while (cursor <= text.length - name.length) {
    const index = text.indexOf(name, cursor);
    if (index < 0) break;
    const before = text.slice(0, index).match(/.$/u)?.[0] || "";
    const after = text.slice(index + name.length).match(/^./u)?.[0] || "";
    if (isNameBoundary(before) && isNameBoundary(after)) occurrences += 1;
    cursor = index + Math.max(name.length, 1);
  }
  return occurrences === 1;
}

function hasInvalidFortuneToken(value) {
  const text = String(value || "").normalize("NFKC");
  return INVALID_LITERAL_TOKEN.test(text) || UNRESOLVED_TEMPLATE_TOKEN.test(text);
}

function hasFrighteningOutcome(value, language = "en") {
  const pattern = FRIGHTENING_OUTCOME_PATTERNS[language] || FRIGHTENING_OUTCOME_PATTERNS.en;
  return pattern.test(String(value || "").normalize("NFKC"));
}

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
  /\b(?:umut\s+yok|değersiz(?:sin)?|başarısız(?:sın)?|çaresiz(?:sin)?|boşuna|anlamsız\p{L}*|pişmanlık|üzüntü|keder|hayal\s+kırıklığı|yalnızlık|asla\s+başaram|yalnız\s+kalacaksın|kaybedeceksin|geç\s+kaldın|pişman\s+olacaksın|sonsuza\s+dek\s+kaybol\p{L}*|imk[aâ]nsız\p{L}*|olanaksız\p{L}*|mahk[uû]m)\b/iu,
  /\b(?:no\s+hope|hopeless|worthless|doomed|pointless|futile|regret|sadness|sorrow|disappointment|loneliness|you(?:'|’)ll\s+fail|you\s+will\s+fail|you(?:'|’)ll\s+be\s+alone|you\s+will\s+be\s+alone|too\s+late|all\s+is\s+lost|(?:gone|lost)\s+forever|impossible|impossibility)\b/iu,
  /\b(?:hoffnungslos|aussichtslos\p{L}*|sinnlos\p{L}*|wertlos|reue|traurigkeit|kummer|enttäuschung|einsamkeit|du\s+wirst\s+scheitern|du\s+wirst\s+allein\s+sein|alles\s+ist\s+verloren|für\s+immer\s+(?:vorbei|verloren)|unmöglich\p{L}*)\b/iu,
  /\b(?:sans\s+espoir|condamn\p{L}*|inutile\p{L}*|regret\p{L}*|tristesse|chagrin|déception|solitude|tu\s+échoueras|vous\s+échouerez|tu\s+seras\s+seul|vous\s+serez\s+seul|tout\s+est\s+perdu|perdu\p{L}*\s+pour\s+toujours|impossible\p{L}*)\b/iu,
  /\b(?:sin\s+esperanza|sin\s+salida|condenad\p{L}*|inútil\p{L}*|arrepentimiento|tristeza|pena|decepción|soledad|fracasarás|estarás\s+solo|todo\s+está\s+perdido|perd\p{L}*\s+para\s+siempre|imposible\p{L}*)\b/iu,
  /\b(?:senza\s+speranza|senza\s+via\s+d['’]uscita|condannat\p{L}*|inutile\p{L}*|rimpianto|tristezza|delusione|solitudine|fallirai|resterai\s+solo|tutto\s+è\s+perduto|pers\p{L}*\s+per\s+sempre|impossibile\p{L}*)\b/iu,
  /(?:没有希望|毫无希望|你会失败|你将失败|你会孤独|一切都失去了|永远失去|永遠失去|不可能|注定失败|注定失敗|毫无意义|毫無意義|后悔|後悔|悲伤|悲傷|失望|孤独|孤獨)/u,
  /(?:希望がない|絶望的|無意味|運命づけられ|後悔|悲しみ|失望|孤独|あなたは失敗する|ひとりになる|すべてを失う|永遠に失われ|不可能)/u,
  /(?:희망이\s*없|절망적|무의미|후회|슬픔|실망|외로움|실패할\s*운명|실패할\s*것|혼자가\s*될|모든\s*것을\s*잃|영원히\s*사라|불가능)/u,
  /(?:χωρίς\s+ελπίδα|καταδικασ\p{L}*|μάται\p{L}*|αδιέξοδ\p{L}*|μετάνοια|λύπη|θλίψη|απογοήτευση|μοναξιά|θα\s+αποτύχεις|θα\s+μείνεις\s+μόνος|όλα\s+χάθηκαν|χάθη\p{L}*\s+για\s+πάντα|αδύνατ\p{L}*)/iu,
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

const UPLIFTING_CUE_TERMS = Object.freeze({
  tr: ["şans", "uğur", "umut", "fırsat", "sevinç", "neşe", "güzel", "gülümseme", "ferahlık", "keyif", "sıcaklık", "yakınlık", "cesaret", "güven", "sürpriz"],
  en: ["luck", "hope", "opportunity", "joy", "welcome", "beautiful", "smile", "relief", "delight", "warmth", "confidence", "pleasant", "good"],
  de: ["Glück", "Hoffnung", "Chance", "Freude", "schön", "Lächeln", "Wärme", "Zuversicht", "Erleichterung", "willkommen"],
  fr: ["chance", "espoir", "joie", "heureux", "beau", "belle", "sourire", "chaleureux", "confiance", "soulagement", "agréable", "surprise"],
  es: ["suerte", "esperanza", "oportunidad", "alegría", "feliz", "bonito", "hermoso", "sonrisa", "cálido", "confianza", "alivio", "agradable", "sorpresa"],
  it: ["fortuna", "speranza", "opportunità", "gioia", "felice", "bello", "sorriso", "caldo", "fiducia", "sollievo", "piacevole", "sorpresa"],
  el: ["τύχη", "ελπίδα", "ευκαιρία", "χαρά", "όμορφο", "χαμόγελο", "ζεστό", "εμπιστοσύνη", "ανακούφιση", "έκπληξη"],
  zh: ["幸运", "好运", "希望", "机会", "喜悦", "开心", "美好", "温暖", "惊喜", "安心", "幸福"],
  ja: ["幸運", "幸せ", "希望", "機会", "嬉しい", "喜び", "素敵", "温かい", "チャンス", "安心", "笑顔", "楽しい"],
  ko: ["행운", "행복", "희망", "기회", "기쁨", "좋은", "따뜻한", "안심", "미소", "즐거운", "반가운"],
});

const UPLIFTING_CUE_PROMPTS = Object.freeze(
  Object.fromEntries(
    Object.entries(UPLIFTING_CUE_TERMS).map(([lang, terms]) => [lang, terms.join(", ")]),
  ),
);

const UPLIFTING_PATTERNS = {
  tr: /(?:^|[^\p{L}])(?:şans|uğur|umut|fırsat|sevinç|neşe|güzel|gülümse\p{L}*|ferah\p{L}*|keyif\p{L}*|sıcak\p{L}*|yakınlık|cesaret|güven|sürpriz)(?=$|[^\p{L}])/iu,
  en: /(?:^|[^\p{L}])(?:luck\p{L}*|hope\p{L}*|opportunit\p{L}*|joy\p{L}*|welcome|beautiful|smile\p{L}*|relief|delight\p{L}*|warmth|confidence|pleasant|good)(?=$|[^\p{L}])/iu,
  de: /(?:^|[^\p{L}])(?:glück\p{L}*|hoffnung\p{L}*|chance\p{L}*|freude\p{L}*|schön\p{L}*|lächeln\p{L}*|warm\p{L}*|wärm\p{L}*|zuversicht\p{L}*|erleichter\p{L}*|willkommen)(?=$|[^\p{L}])/iu,
  fr: /(?:^|[^\p{L}])(?:chance\p{L}*|espoir\p{L}*|joie\p{L}*|heureu\p{L}*|beau\p{L}*|belle\p{L}*|sourire\p{L}*|chaleureu\p{L}*|confiance|soulagement|agréable|surprise)(?=$|[^\p{L}])/iu,
  es: /(?:^|[^\p{L}])(?:suerte|esperanza|oportunidad\p{L}*|alegr\p{L}*|feliz|bonit\p{L}*|hermos\p{L}*|sonrisa\p{L}*|cálid\p{L}*|confianza|alivio|agradable|sorpresa)(?=$|[^\p{L}])/iu,
  it: /(?:^|[^\p{L}])(?:fortuna|speranza|opportunità|gioia|felic\p{L}*|bell\p{L}*|sorriso\p{L}*|cald\p{L}*|fiducia|sollievo|piacevole|sorpresa)(?=$|[^\p{L}])/iu,
  el: /(?:τύχη|ελπίδα|ευκαιρία|χαρά|όμορφ|χαμόγελο|ζεστ|εμπιστοσύνη|ανακούφιση|έκπληξη)/iu,
  zh: /(?:幸运|好运|希望|机会|喜悦|开心|美好|温暖|惊喜|安心|幸福)/u,
  ja: /(?:幸運|幸せ|希望|機会|嬉|喜び|素敵|温か|チャンス|安心|笑顔|楽し)/u,
  ko: /(?:행운|행복|희망|기회|기쁨|좋은|따뜻|안심|미소|즐거|반가)/u,
};

// Fortune-cookie copy is deliberately affirmative. Rejecting explicit
// grammatical negation is more predictable than trying to enumerate every
// possible semantic reversal; even positive double negatives are retried.
const FORTUNE_NEGATION_PATTERNS = {
  tr: /(?<![\p{L}\p{M}])(?:değil|yok|asla|hiçbir\p{L}*|hiç)(?![\p{L}\p{M}])|(?<![\p{L}\p{M}])bir\s+daha(?:\s+\p{L}+){0,4}\s+\p{L}+m[ae](?:y?[ae]c[ae]k|z)\p{L}*(?![\p{L}\p{M}])|(?<![\p{L}\p{M}])\p{L}{2,}m[ae](?:y?[ae]c[ae]k|z)\p{L}*(?![\p{L}\p{M}])/iu,
  en: /(?<![\p{L}\p{M}])(?:no|not|never|cannot|neither|nor)(?![\p{L}\p{M}])|(?<![\p{L}\p{M}])(?:won|can|isn|aren|wasn|weren|don|doesn|didn|shouldn|wouldn|couldn|mustn)['’]t(?![\p{L}\p{M}])|(?<![\p{L}\p{M}])without(?:\s+\p{L}+){0,3}\s+(?:hope|opportunit\p{L}*|luck|chance|joy)(?![\p{L}\p{M}])/iu,
  de: /(?<![\p{L}\p{M}])(?:nicht|nie|niemals|kein\p{L}*|ohne)(?![\p{L}\p{M}])/iu,
  fr: /(?<![\p{L}\p{M}])jamais(?![\p{L}\p{M}])|(?<![\p{L}\p{M}])(?:ne\s+(?:\p{L}+\s+){0,7}|n['’]\p{L}+\s+(?:\p{L}+\s+){0,6})(?:pas|plus|jamais)(?![\p{L}\p{M}])/iu,
  es: /(?<![\p{L}\p{M}])(?:no|nunca|jamás)(?![\p{L}\p{M}])/iu,
  it: /(?<![\p{L}\p{M}])(?:non|mai)(?![\p{L}\p{M}])/iu,
  el: /(?<![\p{L}\p{M}])(?:δεν|μην|ποτέ)(?![\p{L}\p{M}])/iu,
  zh: /(?:不再|不会|不會|没有|沒有|无法|無法|毫无|毫無|无望|無望|不|没|沒)/u,
  ja: /(?:ない|ません|(?<![\p{L}\p{M}])ぬ(?![\p{L}\p{M}])|ず(?:に|、|。|！|？|\s|$)|もう.{0,12}ない)/u,
  ko: /(?<![\p{L}\p{M}])(?:안|못)(?![\p{L}\p{M}])|(?:않|없|아니\p{L}*)/u,
};

const AFFIRMATIVE_STYLE_RULES = Object.freeze({
  tr: "Olumsuzluk veya çifte olumsuzluk kullanma; umudu doğrudan olumlu bir cümleyle anlat.",
  en: "Do not use negation or double negatives; express hope with a direct affirmative sentence.",
  de: "Verwende keine Verneinung oder doppelte Verneinung; drücke Hoffnung direkt und bejahend aus.",
  fr: "N'emploie ni négation ni double négation ; exprime l'espoir par une phrase directement affirmative.",
  es: "No uses negaciones ni dobles negaciones; expresa la esperanza con una frase afirmativa y directa.",
  it: "Non usare negazioni o doppie negazioni; esprimi la speranza con una frase affermativa e diretta.",
  el: "Μη χρησιμοποιείς άρνηση ή διπλή άρνηση· εξέφρασε την ελπίδα με άμεση καταφατική πρόταση.",
  zh: "不要使用否定或双重否定；用直接、肯定的句子表达希望。",
  ja: "否定表現や二重否定を使わず、希望を直接的な肯定文で表現すること。",
  ko: "부정 표현이나 이중 부정을 쓰지 말고, 희망을 직접적인 긍정문으로 표현하세요.",
});

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

function negationScanText(value, lang, expectedName) {
  const text = String(value || "").normalize("NFKC");
  if (lang !== "tr" || !String(expectedName || "").trim()) return text;

  const comparableText = comparablePersonalText(text, lang);
  const comparableName = comparablePersonalText(expectedName, lang).trim();
  if (!comparableName) return comparableText;

  let masked = comparableText;
  let cursor = 0;
  while (cursor <= comparableText.length - comparableName.length) {
    const index = comparableText.indexOf(comparableName, cursor);
    if (index < 0) break;
    const before = comparableText.slice(0, index).match(/.$/u)?.[0] || "";
    const after = comparableText.slice(index + comparableName.length).match(/^./u)?.[0] || "";
    if (isNameBoundary(before) && isNameBoundary(after)) {
      masked = `${masked.slice(0, index)}${" ".repeat(comparableName.length)}${masked.slice(index + comparableName.length)}`;
    }
    cursor = index + Math.max(comparableName.length, 1);
  }
  return masked;
}

function hasFortuneNegation(value, lang = "en", expectedName = "") {
  const negationPattern =
    FORTUNE_NEGATION_PATTERNS[lang] || FORTUNE_NEGATION_PATTERNS.en;
  const text = negationScanText(value, lang, expectedName);
  return negationPattern.test(text);
}

function hasUpliftingCue(value, lang = "en") {
  const pattern = UPLIFTING_PATTERNS[lang] || UPLIFTING_PATTERNS.en;
  return pattern.test(String(value || "").normalize("NFKC"));
}

function hasUpliftingTone(value, lang = "en", expectedName = "") {
  const text = String(value || "").normalize("NFKC");
  return (
    hasUpliftingCue(text, lang) &&
    !hasFortuneNegation(text, lang, expectedName) &&
    !hasDiscouragingTone(text)
  );
}

function hasStaleMysticCliche(value) {
  return motifSignature(value).some((motif) => STALE_MYSTIC_MOTIFS.has(motif));
}

module.exports = {
  AFFIRMATIVE_STYLE_RULES,
  UPLIFTING_CUE_PROMPTS,
  UPLIFTING_CUE_TERMS,
  contentWords,
  hasExactlyOnePersonalName,
  hasFrighteningOutcome,
  hasInvalidFortuneToken,
  hasDiscouragingTone,
  hasHeavyNegativeFraming,
  hasQuestionForm,
  hasStaleMysticCliche,
  hasFortuneNegation,
  hasUpliftingCue,
  hasUpliftingTone,
  isTooSimilar,
  jaccardSimilarity,
  motifSignature,
  normalizeText,
  sharedMotifCount,
  smallerSetCoverage,
};
