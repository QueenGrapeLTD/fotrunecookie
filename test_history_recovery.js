import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeHistoryRecords } from './historyStore.js';

const mainSource = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('./firebaseService.js', import.meta.url), 'utf8');
const functionsSource = fs.readFileSync(
  new URL('./functions/index.js', import.meta.url),
  'utf8',
);
const rulesSource = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');

test('history merge uses requestId and preserves richer local metadata', () => {
  const requestId = 'request_1234567890abcdef';
  const cloud = [{
    id: requestId,
    requestId,
    quote: 'A welcome surprise is finding its way to you.',
    numbers: [],
    zodiacId: '',
    timestamp: '2026-08-28T12:00:00.000Z',
  }];
  const local = [{
    id: '1756382400000',
    requestId,
    quote: 'A welcome surprise is finding its way to you.',
    numbers: [7, 12, 28, 34, 49, 77],
    zodiacId: 'scorpio',
    zodiacIcon: '♏',
    zodiacName: 'Scorpio',
    reflection: 'I want to remember this.',
    reaction: 'keep',
    reflectedAt: '2026-08-28T12:05:00.000Z',
    timestamp: '2026-08-28T12:00:02.000Z',
  }];

  const merged = mergeHistoryRecords(cloud, local, 'owner-1');
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, requestId);
  assert.equal(merged[0].cloudId, requestId);
  assert.deepEqual(merged[0].numbers, local[0].numbers);
  assert.equal(merged[0].zodiacId, 'scorpio');
  assert.equal(merged[0].reflection, local[0].reflection);
  assert.equal(merged[0].cloudPersisted, true);
});

test('legacy timestamp IDs collapse with the canonical request document by day and quote', () => {
  const quote = 'Good luck grows around a quietly confident choice.';
  const merged = mergeHistoryRecords(
    [{
      id: 'request_abcdef1234567890',
      requestId: 'request_abcdef1234567890',
      quote,
      numbers: [],
      timestamp: '2026-08-28T09:00:00.000Z',
    }],
    [{
      id: '1756371600123',
      quote,
      numbers: [1, 2, 3, 4, 5, 6],
      timestamp: '2026-08-28T09:00:01.000Z',
    }],
    'owner-1',
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'request_abcdef1234567890');
  assert.deepEqual(merged[0].numbers, [1, 2, 3, 4, 5, 6]);
});

test('clear-history callable owns both visible and private history deletion', () => {
  const clearCallable = functionsSource.slice(
    functionsSource.indexOf('exports.clearMyFortuneHistory = onCall'),
    functionsSource.indexOf('// Keep a human-readable directory'),
  );
  assert.match(clearCallable, /const uid = requireAuth\(request\)/);
  assert.match(clearCallable, /users\/\$\{uid\}\/fortunes/);
  assert.match(clearCallable, /_ai_history\/\$\{uid\}/);
  assert.match(clearCallable, /deleteCollectionInBatches/);
  assert.match(clientSource, /httpsCallable\(functions, "clearMyFortuneHistory"\)/);

  const clearHandler = mainSource.slice(
    mainSource.indexOf('async function handleClearHistory'),
    mainSource.indexOf('function setLanguage'),
  );
  assert.match(clearHandler, /if \(ownerUid && !\(await clearCloudFortuneHistory\(\)\)\) return false/);
  assert.doesNotMatch(clearHandler, /accountStateCache/);
});

test('premium enrichment intent is explicit and free or rewarded results stay local', () => {
  assert.match(mainSource, /persistCloudHistory: isPremium && Boolean\(historyOwnerUid\)/);
  assert.match(mainSource, /renderFortuneResult\(fortuneText, generation, historyPersistence\)/);
  assert.match(mainSource, /syncFortuneToCloud\(savedFortune, historyOwnerUid\)/);
  assert.match(clientSource, /filter\(\(item\) => item\?\.cloudPersisted === true\)/);
  assert.doesNotMatch(
    mainSource.slice(
      mainSource.indexOf('async function renderFortuneResult'),
      mainSource.indexOf('function resetCookieTapProgress'),
    ),
    /accountStateCache\?\.isPremium/,
  );
});

test('legacy reflection fields remain compatible with existing cloud records', () => {
  assert.match(clientSource, /payload\.reflection = cleanString\(fortuneItem\?\.reflection, 500\)/);
  assert.match(clientSource, /payload\.reaction = \["keep", "act", "release"\]/);
  assert.match(clientSource, /payload\.reflectedAt = validTimestamp/);
  assert.match(rulesSource, /'reflection', 'reaction', 'reflectedAt'/);
  assert.match(rulesSource, /request\.resource\.data\.reflection\.size\(\) <= 500/);
  assert.match(rulesSource, /request\.resource\.data\.reaction == 'release'/);
});

test('request completion and visible history commit atomically before novelty history', () => {
  const completionSource = functionsSource.slice(
    functionsSource.indexOf('async function completeAiUsage'),
    functionsSource.indexOf('async function releaseAiUsage'),
  );
  assert.match(completionSource, /const batch = db\.batch\(\)/);
  assert.match(completionSource, /_usage_requests\/\$\{uid\}_\$\{requestId\}/);
  assert.match(completionSource, /users\/\$\{uid\}\/fortunes\/\$\{requestId\}/);
  assert.match(completionSource, /await batch\.commit\(\)/);

  const activeGenerator = functionsSource.slice(
    functionsSource.indexOf('exports.generateFortune = onCall'),
    functionsSource.indexOf('const FORTUNE_EVENT_TYPES'),
  );
  assert.ok(
    activeGenerator.indexOf('completeAiUsage(') <
      activeGenerator.indexOf('rememberAiFortune('),
  );
});
