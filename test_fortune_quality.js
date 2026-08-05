import test from 'node:test';
import assert from 'node:assert/strict';
import quality from './functions/fortuneQuality.js';

const {
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
