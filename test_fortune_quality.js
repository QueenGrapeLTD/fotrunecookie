import test from 'node:test';
import assert from 'node:assert/strict';
import quality from './functions/fortuneQuality.js';

const {
  hasDiscouragingTone,
  hasHeavyNegativeFraming,
  hasQuestionForm,
  hasStaleMysticCliche,
  hasUpliftingTone,
  isTooSimilar,
  motifSignature,
} = quality;

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
