import test from 'node:test';
import assert from 'node:assert/strict';
import quality from './functions/fortuneQuality.js';
import {
  hasExactlyOnePersonalName as clientHasExactlyOnePersonalName,
  hasFrighteningOutcome as clientHasFrighteningOutcome,
  hasInvalidFortuneToken as clientHasInvalidFortuneToken,
} from './languageGuard.js';

const {
  hasDiscouragingTone,
  hasExactlyOnePersonalName,
  hasFrighteningOutcome,
  hasHeavyNegativeFraming,
  hasInvalidFortuneToken,
  hasQuestionForm,
  hasStaleMysticCliche,
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
