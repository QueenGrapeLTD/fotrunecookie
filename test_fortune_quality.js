import test from 'node:test';
import assert from 'node:assert/strict';
import quality from './functions/fortuneQuality.js';
import {
  hasExactlyOnePersonalName as clientHasExactlyOnePersonalName,
  hasFrighteningOutcome as clientHasFrighteningOutcome,
  hasInvalidFortuneToken as clientHasInvalidFortuneToken,
} from './languageGuard.js';

const {
  AFFIRMATIVE_STYLE_RULES,
  UPLIFTING_CUE_PROMPTS,
  UPLIFTING_CUE_TERMS,
  hasDiscouragingTone,
  hasExactlyOnePersonalName,
  hasFrighteningOutcome,
  hasHeavyNegativeFraming,
  hasInvalidFortuneToken,
  hasQuestionForm,
  hasStaleMysticCliche,
  hasFortuneNegation,
  hasUpliftingCue,
  hasUpliftingTone,
  isTooSimilar,
  motifSignature,
} = quality;

function assertClientServerResult(clientCheck, serverCheck, value, expected, label) {
  assert.equal(clientCheck, expected, `client: ${label || value}`);
  assert.equal(serverCheck, expected, `server: ${label || value}`);
}

test('repetitive Scorpio imagery is rejected even when wording changes', () => {
  const recent = [
    'Derin suların sessizliğinde sabırla büyüyen gücün, en sert kayaları aşarak ışığa ulaşacak.',
  ];
  const candidate =
    'Karanlık suların altında bekleyen iraden, vakti geldiğinde dağları sarsıp aydınlığa çıkacak.';

  assert.equal(isTooSimilar(candidate, recent), true);
});

test('premium fortunes require an unmistakably uplifting cue in every language', () => {
  const upliftingSamples = {
    tr: 'Güzel bir fırsat, gününe beklenmedik bir neşe katabilir.',
    en: 'A welcome opportunity may add a little joy to your day.',
    de: 'Eine schöne Chance bringt neue Freude in deinen Tag.',
    fr: 'Une belle surprise apporte une joie douce à votre journée.',
    es: 'Una hermosa oportunidad puede traer alegría a tu día.',
    it: 'Una bella opportunità può portare gioia alla tua giornata.',
    el: 'Μια όμορφη ευκαιρία φέρνει χαρά στη μέρα σου.',
    zh: '一个美好的机会，会给今天带来惊喜。',
    ja: '素敵な機会が、今日に小さな喜びを運びます。',
    ko: '좋은 기회가 오늘에 따뜻한 기쁨을 더합니다.',
  };

  for (const [lang, sample] of Object.entries(upliftingSamples)) {
    assert.equal(hasUpliftingTone(sample, lang), true, lang);
  }
  assert.equal(
    hasUpliftingTone('Biriyle paylaşılan sessizlik, uzun bir cümleden fazlasını anlatır.', 'tr'),
    false,
  );
});

test('every locale prompt cue is accepted by the authoritative validator', () => {
  assert.deepEqual(
    Object.keys(UPLIFTING_CUE_TERMS).sort(),
    ['tr', 'en', 'de', 'fr', 'es', 'it', 'el', 'zh', 'ja', 'ko'].sort(),
  );
  for (const [lang, terms] of Object.entries(UPLIFTING_CUE_TERMS)) {
    assert.equal(UPLIFTING_CUE_PROMPTS[lang], terms.join(', '), `${lang}: prompt source`);
    for (const term of terms) {
      assert.equal(hasUpliftingCue(term, lang), true, `${lang}: ${term}`);
    }
  }
  assert.equal(hasUpliftingCue('sıcaklık', 'tr'), true, 'Turkish warmth cue');
  assert.equal(hasUpliftingCue('Wärme', 'de'), true, 'German warmth cue');
});

test('positive tokens cannot hide a negated or reversed outcome in any locale', () => {
  const countermeaning = {
    tr: 'Ada, güzel fırsatın sonsuza dek kayboldu.',
    en: 'Ada, your good chance is gone forever.',
    de: 'Ada, deine schöne Chance ist für immer vorbei.',
    fr: 'Ada, votre belle chance est perdue pour toujours.',
    es: 'Ada, tu hermosa oportunidad se perdió para siempre.',
    it: 'Ada, la tua bella opportunità è persa per sempre.',
    el: 'Ada, η όμορφη ευκαιρία σου χάθηκε για πάντα.',
    zh: 'Ada，你的美好机会已经永远失去了。',
    ja: 'Ada、素敵な機会は永遠に失われました。',
    ko: 'Ada, 좋은 기회는 영원히 사라졌습니다.',
  };

  for (const [lang, sample] of Object.entries(countermeaning)) {
    assert.equal(hasUpliftingTone(sample, lang), false, lang);
  }

  const negated = {
    tr: 'Ada, artık güzel bir fırsat yok.',
    en: 'Ada, no good opportunity remains.',
    de: 'Ada, keine schöne Chance bleibt.',
    fr: 'Ada, il ne reste plus aucune belle chance.',
    es: 'Ada, ya no queda ninguna hermosa oportunidad.',
    it: 'Ada, non resta più alcuna bella opportunità.',
    el: 'Ada, δεν μένει καμία όμορφη ευκαιρία.',
    zh: 'Ada，不再有美好的机会。',
    ja: 'Ada、もう素敵な機会はありません。',
    ko: 'Ada, 더 이상 좋은 기회가 없습니다.',
  };
  for (const [lang, sample] of Object.entries(negated)) {
    assert.equal(hasUpliftingTone(sample, lang), false, `${lang}: explicit negation`);
  }
  assert.equal(
    hasUpliftingTone('A good memory may bring warmth that stays with you forever.', 'en'),
    true,
    'non-reversed positive use of forever',
  );
});

test('deterministic uplifting prefilter does not enumerate semantic action verbs', () => {
  const staticPraise = {
    tr: 'Ada, güzel bir fırsat hemen yanında.',
    en: 'Ada, a beautiful opportunity is yours.',
    de: 'Ada, eine schöne Chance ist dein.',
    fr: 'Ada, une belle chance est à vous.',
    es: 'Ada, una hermosa oportunidad es tuya.',
    it: 'Ada, una bella opportunità è tua.',
    el: 'Ada, μια όμορφη ευκαιρία είναι δική σου.',
    zh: 'Ada，这是一个美好的机会。',
    ja: 'Ada、これは素敵な機会です。',
    ko: 'Ada, 이것은 좋은 기회입니다.',
  };
  for (const [lang, sample] of Object.entries(staticPraise)) {
    assert.equal(hasUpliftingCue(sample, lang), true, `${lang}: cue`);
    assert.equal(hasUpliftingTone(sample, lang), true, `${lang}: local prefilter`);
  }
});

test('a classic welcome surprise awaiting nearby passes the deterministic prefilter', () => {
  const awaiting = {
    tr: 'Ada, güzel bir sürpriz köşede seni bekliyor.',
    en: 'Ada, a welcome surprise awaits around the corner.',
    de: 'Ada, eine schöne Überraschung wartet gleich um die Ecke.',
    fr: 'Ada, une belle surprise vous attend au coin de la rue.',
    es: 'Ada, una hermosa sorpresa te espera a la vuelta de la esquina.',
    it: 'Ada, una bella sorpresa ti attende dietro l’angolo.',
    el: 'Ada, μια όμορφη έκπληξη σε περιμένει στη γωνία.',
    zh: 'Ada，一个美好的惊喜正在前方等着你。',
    ja: 'Ada、素敵な驚きが曲がり角で待っています。',
    ko: 'Ada, 좋은 깜짝 선물이 모퉁이에서 기다립니다.',
  };
  for (const [lang, sample] of Object.entries(awaiting)) {
    assert.equal(hasUpliftingTone(sample, lang), true, `${lang}: local prefilter`);
  }
});

test('positive actions that deliver negative emotions are rejected in every locale', () => {
  const negativeResult = {
    tr: 'Ada, güzel bir fırsat pişmanlık getirir.',
    en: 'Ada, a beautiful opportunity brings regret.',
    de: 'Ada, eine schöne Chance bringt Enttäuschung.',
    fr: 'Ada, une belle chance apporte de la tristesse.',
    es: 'Ada, una hermosa oportunidad trae tristeza.',
    it: 'Ada, una bella opportunità porta tristezza.',
    el: 'Ada, μια όμορφη ευκαιρία φέρνει απογοήτευση.',
    zh: 'Ada，美好的机会带来失望。',
    ja: 'Ada、素敵な機会が後悔を運びます。',
    ko: 'Ada, 좋은 기회가 실망을 가져옵니다.',
  };
  for (const [lang, sample] of Object.entries(negativeResult)) {
    assert.equal(hasDiscouragingTone(sample), true, `${lang}: negative result`);
    assert.equal(hasUpliftingTone(sample, lang), false, `${lang}: delivery gate`);
  }
});

test('explicit grammatical negation is rejected in every locale', () => {
  const negationExamples = {
    tr: [
      'Ada, güzel fırsatın bir daha gelmeyecek.',
      'Ada, güzel bir fırsat yok.',
      'Ada, bu güzel ihtimal asla gerçekleşmez.',
      'Ada, güzel seçeneklerin hiçbiri seni bulmaz.',
    ],
    en: [
      'Ada, your beautiful opportunity will never come.',
      'Ada, this good chance is not close.',
      'Ada, no longer is this a welcome opportunity.',
      'Ada, a beautiful day without hope loses its joy.',
      'Ada, this path continues without a welcome opportunity.',
    ],
    de: [
      'Ada, deine schöne Chance wird niemals kommen.',
      'Ada, diese schöne Chance kommt nicht.',
      'Ada, keine gute Gelegenheit bleibt.',
      'Ada, ohne Hoffnung bleibt keine schöne Chance.',
    ],
    fr: [
      'Ada, votre belle chance ne viendra jamais.',
      'Ada, cette belle occasion n’arrive pas.',
      'Ada, cette joie ne revient plus.',
    ],
    es: [
      'Ada, tu hermosa oportunidad nunca llegará.',
      'Ada, esta buena oportunidad no llega.',
      'Ada, esta alegría jamás volverá.',
    ],
    it: [
      'Ada, la tua bella opportunità non arriverà mai.',
      'Ada, questa buona occasione non arriva.',
      'Ada, questa gioia non torna più.',
    ],
    el: [
      'Ada, η όμορφη ευκαιρία σου δεν θα έρθει ποτέ.',
      'Ada, αυτή η καλή ευκαιρία δεν έρχεται.',
      'Ada, μην περιμένεις αυτή τη χαρά.',
    ],
    zh: [
      'Ada，美好的机会永远不会到来。',
      'Ada，这份好运不再出现。',
      'Ada，没有新的喜悦。',
      'Ada，这个愿望无法实现。',
    ],
    ja: [
      'Ada、素敵な機会は二度と訪れません。',
      'Ada、この喜びは戻らない。',
      'Ada、希望を知らずに過ごします。',
    ],
    ko: [
      'Ada, 좋은 기회는 다시는 오지 않습니다.',
      'Ada, 이 기회는 더 이상 오지 않아요.',
      'Ada, 새로운 희망이 없습니다.',
      'Ada, 좋은 기회를 못 만납니다.',
    ],
  };

  for (const [lang, samples] of Object.entries(negationExamples)) {
    for (const sample of samples) {
      assert.equal(hasFortuneNegation(sample, lang), true, `${lang}: ${sample}`);
      assert.equal(hasUpliftingTone(sample, lang), false, `${lang}: delivery gate`);
    }
  }

  const positiveDoubleReversal =
    'Ada, a beautiful opportunity is no longer out of reach.';
  assert.equal(hasFortuneNegation(positiveDoubleReversal, 'en'), true);
  assert.equal(hasUpliftingTone(positiveDoubleReversal, 'en'), false);
});

test('negation gate accepts affirmative prose and respects token boundaries', () => {
  const affirmative = {
    tr: 'Ada, güzel bir fırsat gününe sıcaklık katabilir.',
    en: 'Ada, a beautiful opportunity may arrive with welcome joy.',
    de: 'Ada, eine schöne Chance bringt neue Freude.',
    fr: 'Ada, une belle chance apporte une joie nouvelle.',
    es: 'Ada, una hermosa oportunidad trae una alegría nueva.',
    it: 'Ada, una bella opportunità porta una gioia nuova.',
    el: 'Ada, μια όμορφη ευκαιρία φέρνει νέα χαρά.',
    zh: 'Ada，美好的机会带来新的喜悦。',
    ja: 'Ada、素敵な機会が新しい喜びを運びます。',
    ko: 'Ada, 좋은 기회가 새로운 기쁨을 전합니다.',
  };
  for (const [lang, sample] of Object.entries(affirmative)) {
    assert.equal(hasFortuneNegation(sample, lang), false, `${lang}: affirmative`);
    assert.equal(hasUpliftingTone(sample, lang), true, `${lang}: uplifting`);
    assert.ok(AFFIRMATIVE_STYLE_RULES[lang], `${lang}: prompt rule`);
  }

  const boundaryCases = {
    tr: 'Aslan mevsimi güzel bir fırsat getiriyor.',
    en: 'A notable opportunity brings good news.',
    de: 'Eine kleine Chance bringt Freude.',
    fr: 'Pascal accueille une belle surprise.',
    es: 'Una noticia notable trae alegría.',
    it: 'La nonna porta una bella sorpresa.',
    el: 'Μια όμορφη ευκαιρία φέρνει χαρά.',
    zh: '无限希望带来美好的机会。',
    ja: 'ずっと続く素敵な喜びが届きます。',
    ko: '연못 안내 카드가 좋은 기회를 전합니다.',
  };
  for (const [lang, sample] of Object.entries(boundaryCases)) {
    assert.equal(hasFortuneNegation(sample, lang), false, `${lang}: token boundary`);
  }
  assert.equal(
    hasFortuneNegation('Ada, più gioia accompagna una bella opportunità.', 'it'),
    false,
    'Italian positive più',
  );
  assert.equal(
    hasFortuneNegation('Ada, questa gioia non torna più.', 'it'),
    true,
    'Italian non ... più',
  );
});

test('Turkish negative-aorist surnames are excluded only with exact name context', () => {
  for (const name of ['Yılmaz', 'Solmaz', 'Korkmaz', 'Sönmez']) {
    const fortune = `${name}, güzel bir fırsat gününe sıcak neşe katabilir.`;
    assert.equal(hasFortuneNegation(fortune, 'tr', name), false, name);
    assert.equal(hasUpliftingTone(fortune, 'tr', name), true, name);
    assert.equal(hasFortuneNegation(fortune, 'tr'), true, `${name}: empty-name behavior`);
  }

  for (const body of [
    'Yılmaz, güzel fırsat seni bulmaz.',
    'Yılmaz, güzel haber bir daha gelmez.',
    'Yılmaz, güzel ihtimal gerçekleşmez.',
  ]) {
    assert.equal(hasFortuneNegation(body, 'tr', 'Yılmaz'), true, body);
    assert.equal(hasUpliftingTone(body, 'tr', 'Yılmaz'), false, body);
  }
});

test('impossible outcomes are discouraging in all ten locales', () => {
  const impossible = {
    tr: 'Ada, bu güzel fırsat artık imkânsız.',
    en: 'Ada, this beautiful opportunity is impossible.',
    de: 'Ada, diese schöne Chance ist unmöglich.',
    fr: 'Ada, cette belle chance est impossible.',
    es: 'Ada, esta hermosa oportunidad es imposible.',
    it: 'Ada, questa bella opportunità è impossibile.',
    el: 'Ada, αυτή η όμορφη ευκαιρία είναι αδύνατη.',
    zh: 'Ada，这个美好机会不可能实现。',
    ja: 'Ada、この素敵な機会は不可能です。',
    ko: 'Ada, 이 좋은 기회는 불가능합니다.',
  };
  for (const [lang, sample] of Object.entries(impossible)) {
    assert.equal(hasDiscouragingTone(sample), true, `${lang}: discouraging`);
    assert.equal(hasUpliftingTone(sample, lang), false, `${lang}: delivery gate`);
  }
});

test('doomed and pointless outcomes are discouraging across locales', () => {
  const doomed = {
    tr: 'Ada, bu güzel fırsat anlamsızlığa mahkûm.',
    en: 'Ada, this beautiful opportunity is doomed and pointless.',
    de: 'Ada, diese schöne Chance ist aussichtslos.',
    fr: 'Ada, cette belle chance est condamnée.',
    es: 'Ada, esta hermosa oportunidad está condenada.',
    it: 'Ada, questa bella opportunità è condannata.',
    el: 'Ada, αυτή η όμορφη ευκαιρία είναι καταδικασμένη.',
    zh: 'Ada，这个美好机会注定失败。',
    ja: 'Ada、この素敵な機会は無意味です。',
    ko: 'Ada, 이 좋은 기회는 실패할 운명입니다.',
  };
  for (const [lang, sample] of Object.entries(doomed)) {
    assert.equal(hasDiscouragingTone(sample), true, lang);
    assert.equal(hasUpliftingTone(sample, lang), false, `${lang}: delivery gate`);
  }
});

test('stale mystical imagery is rejected before delivery', () => {
  assert.equal(
    hasStaleMysticCliche('Sessizlikte bekleyen derin sular sana bir şey anlatıyor.'),
    true,
  );
  assert.equal(
    hasStaleMysticCliche('Güzel bir haber, sıradan bir öğleden sonrayı neşeye çevirebilir.'),
    false,
  );
  assert.equal(
    hasStaleMysticCliche('Beklenmedik güzel bir gelişme, gününe sevinç katabilir.'),
    false,
  );
  assert.equal(
    hasStaleMysticCliche('Güzel bir sürpriz, sarsılmaz güvenini yeniden hatırlatabilir.'),
    false,
  );
});

test('discouraging outcomes are rejected while gentle uncertainty remains valid', () => {
  assert.equal(hasDiscouragingTone('Sen değersizsin ve artık umut yok.'), true);
  assert.equal(hasDiscouragingTone('You will fail; everything is hopeless.'), true);
  assert.equal(
    hasDiscouragingTone('Aradığın güzel ihtimal, düşündüğünden daha yakın olabilir.'),
    false,
  );
});

test('premium fortunes reject gloomy premises and rhetorical questions', () => {
  assert.equal(
    hasHeavyNegativeFraming(
      'Zihninizi yoran o karmaşık düğüm, yerini usulca bir ferahlığa bırakıyor.',
    ),
    true,
  );
  assert.equal(
    hasHeavyNegativeFraming('Güzel bir haber, gününe sıcak bir sevinç katabilir.'),
    false,
  );
  assert.equal(
    hasQuestionForm('Bahçedeki ilk filiz nasıl böyle hızlı bir umutla yönelir?'),
    true,
  );
  assert.equal(hasQuestionForm('Bugün güzel bir sürprize yer açılıyor.'), false);
});

test('a genuinely different daily-life fortune is accepted', () => {
  const recent = [
    'Derin suların sessizliğinde sabırla büyüyen gücün, en sert kayaları aşarak ışığa ulaşacak.',
  ];
  const candidate =
    'Bugün beklenmedik bir mesaj, ertelediğin konuşmayı keyifli bir başlangıca çevirebilir.';

  assert.equal(isTooSimilar(candidate, recent), false);
});

test('motif detection groups semantic cliches', () => {
  const motifs = motifSignature(
    'Sessiz ve karanlık bir patikadan zirvedeki ışığa sabırla ilerliyorsun.',
  );

  assert.deepEqual(
    new Set(motifs),
    new Set(['darkness', 'silence', 'patience', 'mountain', 'light']),
  );
});

test('named fortunes require the exact sanitized name once while name-free fortunes stay valid', () => {
  const validNamed = 'IŞIK, güzel bir fırsat bugün sana sıcak bir güven getiriyor.';
  const missingName = 'Güzel bir fırsat bugün sana sıcak bir güven getiriyor.';
  const duplicateName = 'Işık, güzel bir fırsat IŞIK için sıcak bir güven getiriyor.';

  for (const [text, expected, label] of [
    [validNamed, true, 'single case-folded Unicode name'],
    [missingName, false, 'missing name'],
    [duplicateName, false, 'duplicate name'],
  ]) {
    assertClientServerResult(
      clientHasExactlyOnePersonalName(text, 'Işık', 'tr'),
      hasExactlyOnePersonalName(text, 'Işık', 'tr'),
      text,
      expected,
      label,
    );
  }

  const nameFree = 'Güzel bir fırsat bugün sıcak bir güven getiriyor.';
  assertClientServerResult(
    clientHasExactlyOnePersonalName(nameFree, '', 'tr'),
    hasExactlyOnePersonalName(nameFree, '', 'tr'),
    nameFree,
    true,
    'name-free fortune',
  );
  assert.equal(hasExactlyOnePersonalName('Adana güzel bir sürpriz taşıyor.', 'Ada', 'tr'), false);
});

test('literal invalid values and unresolved name placeholders are rejected in parity', () => {
  const invalid = [
    'Ada, bugün null bir sürpriz getiriyor.',
    'Ada, bugün undefined bir sürpriz getiriyor.',
    'Ada, bugün NaN kadar güzel bir fırsat getiriyor.',
    'Bugün {{name}} için güzel bir fırsat doğuyor.',
    'Bugün ${name} için güzel bir fırsat doğuyor.',
    'Bugün <name> için güzel bir fırsat doğuyor.',
    'Bugün [name] için güzel bir fırsat doğuyor.',
    'Bugün __USER_NAME__ için güzel bir fırsat doğuyor.',
  ];
  for (const text of invalid) {
    assertClientServerResult(
      clientHasInvalidFortuneToken(text),
      hasInvalidFortuneToken(text),
      text,
      true,
    );
  }

  const ordinary = 'Ada, bugün [küçük bir an] güzel bir fırsata dönüşebilir.';
  assertClientServerResult(
    clientHasInvalidFortuneToken(ordinary),
    hasInvalidFortuneToken(ordinary),
    ordinary,
    false,
    'ordinary bracketed prose',
  );
});

test('frightening accident and mortal-injury outcomes are rejected in all ten languages', () => {
  const unsafe = {
    tr: 'Ada, yaklaşan kaza ölümcül bir yaralanma getirecek.',
    en: 'Ada, a fatal crash and collision will cause death.',
    de: 'Ada, ein tödlicher Unfall endet mit schwerer Verletzung.',
    fr: 'Ada, un accident mortel causera une collision et une blessure.',
    es: 'Ada, un accidente fatal causará una colisión y una herida.',
    it: 'Ada, un incidente mortale porterà a uno schianto e una ferita.',
    el: 'Ada, ένα θανατηφόρο ατύχημα θα φέρει σύγκρουση και τραυματισμό.',
    ko: 'Ada, 치명적인 교통사고와 충돌로 중상을 입습니다.',
    ja: 'Ada、致命的な交通事故と衝突で重傷になります。',
    zh: 'Ada，致命车祸和碰撞会造成重伤。',
  };

  for (const [language, text] of Object.entries(unsafe)) {
    assertClientServerResult(
      clientHasFrighteningOutcome(text, language),
      hasFrighteningOutcome(text, language),
      text,
      true,
      language,
    );
  }

  const safe = 'Ada, güzel bir tesadüf bugün sıcak bir gülümsemeye dönüşebilir.';
  assertClientServerResult(
    clientHasFrighteningOutcome(safe, 'tr'),
    hasFrighteningOutcome(safe, 'tr'),
    safe,
    false,
    'positive non-fatalistic fortune',
  );
});
