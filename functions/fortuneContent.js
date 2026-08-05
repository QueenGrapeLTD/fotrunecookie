"use strict";

const SUPPORTED_LANGUAGES = [
  "tr", "en", "de", "fr", "es", "it", "el", "zh", "ja", "ko",
];
const CATEGORIES = ["general", "love", "career", "health"];

const RAW_CONTENT = {
  tr: {
    general: [
      "Sıradan görünen bir an, yakında güzel bir anlam kazanacak.",
      "Aradığın cevap, hiç beklemediğin kadar tanıdık bir yerde.",
      "Bugünün küçük tesadüfü, yarının sevilen hikâyesi olabilir.",
      "İçini ısıtan bir haber, sessizce sana doğru yol alıyor.",
    ],
    love: [
      "Kalbinde yarım kalan bir cümle, sıcak bir karşılık bulabilir.",
      "Seni gerçekten anlayan biri, en çok sustuğun yeri fark edecek.",
      "Tanıdık bir gülümseme, yakında bambaşka bir anlam taşıyabilir.",
      "İki insan arasındaki en güzel yakınlık, rahatça susabilmektir.",
    ],
    career: [
      "Emeğinin sessiz kısmı, doğru kişi tarafından fark edilmek üzere.",
      "Gözden kaçan bir fikir, masadaki en değerli şeye dönüşebilir.",
      "Küçük bir ayrıntı, üzerinde çalıştığın işin yönünü değiştirecek.",
      "Yeteneğin, beklemediğin bir konuşmada kendine yer açabilir.",
    ],
    health: [
      "Bugün içini hafifleten şey, sandığından daha yakınında.",
      "Sakin geçen bir saat, günün geri kalanına yumuşakça yayılacak.",
      "Bedeninin sevdiği ritim, zihnine de iyi gelen bir alan açıyor.",
      "Kendine gösterdiğin özen, yüzündeki ifadeye kadar ulaşacak.",
    ],
  },
  en: {
    general: [
      "An ordinary moment will soon reveal a lovely meaning.",
      "The answer you seek may be hiding somewhere pleasantly familiar.",
      "Today's small coincidence could become tomorrow's favorite story.",
      "A welcome piece of news is quietly making its way toward you.",
    ],
    love: [
      "An unfinished feeling may soon find a warm response.",
      "Someone who understands you will notice what you leave unsaid.",
      "A familiar smile may soon carry an entirely new meaning.",
      "The sweetest closeness is feeling comfortable in the quiet.",
    ],
    career: [
      "The quiet part of your effort is about to be noticed.",
      "An overlooked idea may become the most valuable one in the room.",
      "One small detail can change the direction of your work.",
      "Your talent may find its place in an unexpected conversation.",
    ],
    health: [
      "What makes today feel lighter is closer than you think.",
      "A calm hour can soften the rhythm of the whole day.",
      "A rhythm your body enjoys can also make room for a clearer mind.",
      "The care you give yourself will reach all the way to your smile.",
    ],
  },
  de: {
    general: [
      "Ein gewöhnlicher Augenblick bekommt bald eine schöne Bedeutung.",
      "Die gesuchte Antwort liegt vielleicht an einem vertrauten Ort.",
      "Der kleine Zufall von heute kann morgen zur Lieblingsgeschichte werden.",
      "Eine gute Nachricht ist leise auf dem Weg zu dir.",
    ],
    love: [
      "Ein halbes Gefühl kann bald eine warme Antwort finden.",
      "Wer dich versteht, bemerkt auch das, was du nicht aussprichst.",
      "Ein vertrautes Lächeln kann bald etwas ganz Neues bedeuten.",
      "Die schönste Nähe fühlt sich auch in der Stille leicht an.",
    ],
    career: [
      "Der stille Teil deiner Arbeit wird bald gesehen.",
      "Eine übersehene Idee kann im Raum die wertvollste werden.",
      "Ein kleines Detail kann deiner Arbeit eine neue Richtung geben.",
      "Dein Talent findet in einem unerwarteten Gespräch seinen Platz.",
    ],
    health: [
      "Was den Tag leichter macht, ist näher als gedacht.",
      "Eine ruhige Stunde kann den ganzen Tag sanfter werden lassen.",
      "Ein angenehmer Rhythmus schafft auch im Kopf neuen Raum.",
      "Die Fürsorge für dich selbst wird bis zu deinem Lächeln reichen.",
    ],
  },
  fr: {
    general: [
      "Un instant ordinaire prendra bientôt une jolie signification.",
      "La réponse cherchée se cache peut-être dans un endroit familier.",
      "Le petit hasard d'aujourd'hui peut devenir un beau souvenir.",
      "Une bonne nouvelle avance doucement dans ta direction.",
    ],
    love: [
      "Un sentiment inachevé pourrait bientôt trouver une réponse chaleureuse.",
      "La personne qui te comprend remarque aussi tes silences.",
      "Un sourire familier pourrait bientôt prendre un nouveau sens.",
      "La plus belle proximité se sent aussi dans le silence.",
    ],
    career: [
      "La partie discrète de ton travail sera bientôt remarquée.",
      "Une idée oubliée pourrait devenir la plus précieuse.",
      "Un petit détail peut donner une nouvelle direction à ton travail.",
      "Ton talent trouvera sa place dans une conversation inattendue.",
    ],
    health: [
      "Ce qui rend la journée plus légère est tout près.",
      "Une heure calme peut adoucir le rythme de toute la journée.",
      "Un rythme agréable au corps libère aussi l'esprit.",
      "L'attention que tu t'offres ira jusqu'à ton sourire.",
    ],
  },
  es: {
    general: [
      "Un momento común pronto revelará un significado hermoso.",
      "La respuesta que buscas quizá esté en un lugar conocido.",
      "La pequeña casualidad de hoy puede ser la historia favorita de mañana.",
      "Una buena noticia avanza en silencio hacia ti.",
    ],
    love: [
      "Un sentimiento incompleto puede hallar pronto una respuesta cálida.",
      "Quien te comprende también nota lo que dejas sin decir.",
      "Una sonrisa conocida pronto podría tener un sentido nuevo.",
      "La cercanía más bonita también se siente cómoda en silencio.",
    ],
    career: [
      "La parte silenciosa de tu esfuerzo está a punto de ser vista.",
      "Una idea ignorada puede convertirse en la más valiosa.",
      "Un pequeño detalle puede cambiar el rumbo de tu trabajo.",
      "Tu talento encontrará sitio en una conversación inesperada.",
    ],
    health: [
      "Lo que hace más ligero el día está más cerca de lo que crees.",
      "Una hora tranquila puede suavizar el ritmo de todo el día.",
      "Un ritmo agradable para el cuerpo también despeja la mente.",
      "El cuidado que te das llegará hasta tu sonrisa.",
    ],
  },
  it: {
    general: [
      "Un momento qualunque avrà presto un significato speciale.",
      "La risposta che cerchi potrebbe trovarsi in un luogo familiare.",
      "La piccola coincidenza di oggi può diventare il ricordo di domani.",
      "Una buona notizia sta arrivando silenziosamente verso di te.",
    ],
    love: [
      "Un sentimento sospeso potrebbe presto trovare una risposta calorosa.",
      "Chi ti comprende nota anche ciò che non dici.",
      "Un sorriso familiare potrebbe presto avere un significato nuovo.",
      "La vicinanza più bella si sente a proprio agio anche nel silenzio.",
    ],
    career: [
      "La parte silenziosa del tuo impegno sta per essere notata.",
      "Un'idea trascurata può diventare la più preziosa.",
      "Un piccolo dettaglio può cambiare la direzione del tuo lavoro.",
      "Il tuo talento troverà spazio in una conversazione inattesa.",
    ],
    health: [
      "Ciò che rende la giornata più leggera è più vicino di quanto pensi.",
      "Un'ora tranquilla può addolcire il ritmo dell'intera giornata.",
      "Un ritmo piacevole al corpo libera spazio anche nella mente.",
      "La cura che dedichi a te arriverà fino al tuo sorriso.",
    ],
  },
  el: {
    general: [
      "Μια συνηθισμένη στιγμή σύντομα θα αποκτήσει όμορφο νόημα.",
      "Η απάντηση που ζητάς ίσως βρίσκεται σε ένα γνώριμο μέρος.",
      "Η μικρή σύμπτωση του σήμερα μπορεί να γίνει αγαπημένη ιστορία.",
      "Ένα ευχάριστο νέο έρχεται αθόρυβα προς το μέρος σου.",
    ],
    love: [
      "Ένα μισό συναίσθημα μπορεί σύντομα να βρει ζεστή ανταπόκριση.",
      "Όποιος σε καταλαβαίνει προσέχει και όσα δεν λες.",
      "Ένα γνώριμο χαμόγελο ίσως αποκτήσει σύντομα νέο νόημα.",
      "Η πιο όμορφη οικειότητα νιώθει άνετα και στη σιωπή.",
    ],
    career: [
      "Το αθόρυβο μέρος της προσπάθειάς σου σύντομα θα φανεί.",
      "Μια παραμελημένη ιδέα μπορεί να γίνει η πιο πολύτιμη.",
      "Μια μικρή λεπτομέρεια μπορεί να αλλάξει την πορεία της δουλειάς.",
      "Το ταλέντο σου θα βρει χώρο σε μια απρόσμενη συζήτηση.",
    ],
    health: [
      "Αυτό που κάνει τη μέρα πιο ανάλαφρη είναι πιο κοντά απ' όσο νομίζεις.",
      "Μια ήρεμη ώρα μπορεί να γλυκάνει τον ρυθμό όλης της ημέρας.",
      "Ένας ευχάριστος ρυθμός για το σώμα καθαρίζει και τον νου.",
      "Η φροντίδα που δίνεις στον εαυτό σου θα φτάσει ως το χαμόγελο.",
    ],
  },
  zh: {
    general: [
      "一个平凡的瞬间，很快会显出温柔的意义。",
      "你寻找的答案，也许就在熟悉的地方。",
      "今天的小巧合，可能成为明天最喜欢的故事。",
      "一个好消息，正在安静地向你走来。",
    ],
    love: [
      "一份未说完的心意，或许很快会得到温暖回应。",
      "真正懂你的人，也会留意你没有说出口的话。",
      "一个熟悉的微笑，可能很快会有新的意义。",
      "最好的亲近，是安静相处也觉得自在。",
    ],
    career: [
      "你默默付出的部分，很快会被看见。",
      "一个被忽略的想法，可能成为最有价值的那个。",
      "一个小细节，可能改变工作的方向。",
      "你的才能，会在一次意外的交谈中找到位置。",
    ],
    health: [
      "让今天轻松起来的事物，比想象中更近。",
      "一段安静的时光，会让整天的节奏柔和下来。",
      "身体喜欢的节奏，也会为思绪腾出空间。",
      "给自己的关照，最终会来到你的笑容里。",
    ],
  },
  ja: {
    general: [
      "何気ないひとときが、もうすぐ優しい意味を持ちます。",
      "探している答えは、懐かしい場所にあるかもしれません。",
      "今日の小さな偶然が、明日の大切な物語になります。",
      "うれしい知らせが、静かにあなたへ近づいています。",
    ],
    love: [
      "言いかけた想いに、やさしい返事が届くかもしれません。",
      "本当に分かり合える人は、言葉のない時間も見ています。",
      "見慣れた笑顔が、もうすぐ新しい意味を持ちます。",
      "心地よい沈黙は、ふたりの距離が近いしるしです。",
    ],
    career: [
      "見えないところで重ねた努力が、もうすぐ伝わります。",
      "見過ごされた考えが、いちばん大切なものになります。",
      "小さな気づきが、仕事の流れを変えるでしょう。",
      "思いがけない会話の中で、あなたの力が輝きます。",
    ],
    health: [
      "今日を軽くするものは、思うより近くにあります。",
      "穏やかなひとときが、一日の流れをやさしくします。",
      "体が喜ぶリズムは、心にも余白を作ります。",
      "自分をいたわる気持ちは、やがて笑顔に届きます。",
    ],
  },
  ko: {
    general: [
      "평범한 순간이 곧 다정한 의미를 보여 줄 거예요.",
      "찾던 답은 어쩌면 익숙한 곳에 숨어 있어요.",
      "오늘의 작은 우연이 내일의 좋은 이야기가 될 수 있어요.",
      "반가운 소식이 조용히 당신에게 다가오고 있어요.",
    ],
    love: [
      "끝내지 못한 마음이 곧 따뜻한 답을 만날 수 있어요.",
      "당신을 이해하는 사람은 말하지 않은 마음도 알아봐요.",
      "익숙한 미소가 곧 새로운 의미를 품을 수 있어요.",
      "가장 편안한 가까움은 침묵 속에서도 자연스러워요.",
    ],
    career: [
      "보이지 않던 노력이 곧 누군가의 눈에 들어올 거예요.",
      "지나친 아이디어가 가장 소중한 것이 될 수 있어요.",
      "작은 발견 하나가 일의 방향을 바꿀 수 있어요.",
      "뜻밖의 대화에서 당신의 재능이 자리를 찾을 거예요.",
    ],
    health: [
      "오늘을 가볍게 만드는 것은 생각보다 가까이 있어요.",
      "고요한 한 시간이 하루의 리듬을 부드럽게 해 줘요.",
      "몸이 좋아하는 리듬은 마음에도 여유를 만들어요.",
      "스스로에게 건넨 다정함이 미소까지 이어질 거예요.",
    ],
  },
};

const BUNDLED_FORTUNE_CONTENT = Object.freeze(
  Object.entries(RAW_CONTENT).flatMap(([lang, categories]) =>
    Object.entries(categories).flatMap(([category, messages]) =>
      messages.map((text, index) =>
        Object.freeze({
          id: `curated_${lang}_${category}_${String(index + 1).padStart(2, "0")}`,
          text,
          lang,
          category,
          themes: [category],
          status: "approved",
          qualityScore: 5,
          source: "curated",
        }),
      ),
    ),
  ),
);

function normalizeContentDocument(id, data = {}) {
  const text = typeof data.text === "string" ? data.text.trim() : "";
  const lang = SUPPORTED_LANGUAGES.includes(data.lang) ? data.lang : "";
  const category = CATEGORIES.includes(data.category) ? data.category : "general";
  const qualityScore = Math.min(Math.max(Number(data.qualityScore) || 3, 1), 5);
  if (!id || !text || !lang || text.length > 80) return null;
  return {
    id: String(id).slice(0, 128),
    text,
    lang,
    category,
    themes: Array.isArray(data.themes)
      ? data.themes.filter((item) => typeof item === "string").slice(0, 8)
      : [category],
    status: ["approved", "draft", "rejected"].includes(data.status)
      ? data.status
      : "draft",
    qualityScore,
    source: ["curated", "manual", "ai-draft"].includes(data.source)
      ? data.source
      : "manual",
  };
}

function contentPoolForLanguage(lang, cloudContent = []) {
  const normalizedCloud = cloudContent
    .map((item) => normalizeContentDocument(item.id, item))
    .filter((item) => item?.lang === lang);
  const overriddenIds = new Set(normalizedCloud.map((item) => item.id));
  const approvedCloud = normalizedCloud.filter((item) => item.status === "approved");
  const bundled = BUNDLED_FORTUNE_CONTENT.filter(
    (item) => item.lang === lang && !overriddenIds.has(item.id),
  );
  return [...approvedCloud, ...bundled];
}

function selectApprovedContent({
  lang,
  category = "general",
  recentContentIds = [],
  recentTexts = [],
  cloudContent = [],
  random = Math.random,
}) {
  const pool = contentPoolForLanguage(lang, cloudContent);
  const scored = pool.map((item) => {
    let score = item.qualityScore * 2;
    if (item.category === category) score += 5;
    if (item.category === "general") score += 1;
    const recentIndex = recentContentIds.slice(0, 24).indexOf(item.id);
    if (recentIndex >= 0) {
      // Immediate anchor reuse is much more noticeable than an older repeat.
      score -= Math.max(34 - recentIndex * 2, 10);
    }
    const textWasRecent = recentTexts.some(
      (text) => String(text).trim().toLocaleLowerCase() === item.text.toLocaleLowerCase(),
    );
    if (textWasRecent) score -= 25;
    // A small exploration term prevents a fixed rank from becoming repetitive.
    score += random() * 3;
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, Math.min(6, scored.length));
  return candidates[Math.floor(random() * candidates.length)]?.item || pool[0];
}

function buildAdaptationPrompt({
  seed,
  languageName,
  locale,
  recentTexts = [],
  category = "general",
  zodiac = "",
  rising = "",
}) {
  const recent = recentTexts.slice(0, 12).map((text) => `- ${text}`).join("\n");
  return `You are a careful Fortune Cookie editor, not a fortune teller.

LANGUAGE
Write only in ${languageName} (${locale}). Think directly in that language.

APPROVED MEANING ANCHOR
${seed.text}

CONTEXT SIGNALS
Focus: ${category}
Sun sign: ${zodiac || "unknown"}
Rising sign: ${rising || "unknown"}
Use these only as subtle tone signals. Never mention astrology.

TASK
Create one natural local-language variation of the approved meaning anchor.
Keep its emotional meaning, but change the wording and rhythm enough to feel fresh.

STRICT RULES
- 25 to 80 Unicode characters; shorter is welcome.
- One sentence, or two very short connected sentences.
- No command, advice task, homework, fixed prediction, marketing or sharing request.
- No name, title, quotation marks, emoji, hashtag, explanation or translation.
- No invented event, profession, relationship, health, money or family assumption.
- No death, illness, accident, pregnancy, betrayal, disaster, legal or investment claim.
- At most one simple everyday image, and only if the anchor already supports it.
- If a natural variation would weaken the anchor, return the anchor unchanged.

RECENT MESSAGES TO AVOID
${recent || "- none"}

Return only the final message.`;
}

module.exports = {
  BUNDLED_FORTUNE_CONTENT,
  CATEGORIES,
  SUPPORTED_LANGUAGES,
  buildAdaptationPrompt,
  contentPoolForLanguage,
  normalizeContentDocument,
  selectApprovedContent,
};
