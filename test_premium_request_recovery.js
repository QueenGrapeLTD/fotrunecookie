import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const aiEngineSource = fs.readFileSync(
  new URL('./aiEngine.js', import.meta.url),
  'utf8',
);
const firebaseSource = fs.readFileSync(
  new URL('./firebaseService.js', import.meta.url),
  'utf8',
);
const mainSource = fs.readFileSync(
  new URL('./main.js', import.meta.url),
  'utf8',
);

function sourceFragment(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end).replace(/export\s+(?=(?:async\s+)?function)/g, '');
}

test('premium retries reuse one request id while auth, language and profile stay unchanged', () => {
  const fragment = sourceFragment(
    mainSource,
    'function premiumRequestMatchesContext',
    'function assertFortuneRequestContextCurrent',
  );
  const createHarness = new Function(`
    let pendingPremiumFortuneRequest = null;
    ${fragment}
    return { requestIdForPremiumContext, clearPendingPremiumRequest };
  `);
  const harness = createHarness();
  const context = {
    authContext: 'account:user-1',
    language: 'tr',
    profileRevision: 4,
  };

  const first = harness.requestIdForPremiumContext(context);
  const retry = harness.requestIdForPremiumContext({ ...context });
  const changedProfile = harness.requestIdForPremiumContext({
    ...context,
    profileRevision: 5,
  });

  assert.equal(retry, first);
  assert.notEqual(changedProfile, first);
  harness.clearPendingPremiumRequest();
  assert.notEqual(harness.requestIdForPremiumContext(context), first);
});

test('fortune request errors distinguish recoverable transport failures from terminal access failures', () => {
  const fragment = sourceFragment(
    aiEngineSource,
    'const RETRYABLE_FORTUNE_ERROR_CODES',
    'function cleanText',
  );
  const classify = new Function(`
    ${fragment}
    return classifyFortuneRequestError;
  `)();

  for (const code of [
    'functions/aborted',
    'functions/deadline-exceeded',
    'functions/unavailable',
    'auth/network-request-failed',
  ]) {
    const result = classify({ code });
    assert.equal(result.retryable, true, code);
    assert.match(result.message, /tekrar dokun/);
    assert.match(result.message, /ek premium hakkı/);
  }
  assert.deepEqual(
    classify({ code: 'functions/resource-exhausted' }),
    { retryable: false, message: '' },
  );
  assert.deepEqual(
    classify({ code: 'functions/unauthenticated' }),
    { retryable: false, message: '' },
  );
});

test('quality exhaustion is not presented as a connection or timeout failure', () => {
  const fragment = sourceFragment(
    aiEngineSource,
    'const RETRYABLE_FORTUNE_ERROR_CODES',
    'function cleanText',
  );
  const classify = new Function(`
    ${fragment}
    return classifyFortuneRequestError;
  `)();

  for (const details of [
    { reason: 'QUALITY_EXHAUSTED' },
    { reason: 'quality-exhausted' },
    'quality_exhausted',
  ]) {
    const result = classify({ code: 'functions/unavailable', details });
    assert.equal(result.retryable, true);
    assert.match(result.message, /kalite kontrolünü/);
    assert.match(result.message, /tekrar dokun/);
    assert.match(result.message, /ek premium hakkı/);
    assert.doesNotMatch(result.message, /bağlantı|zaman aşımı/);
  }

  const transportFailure = classify({ code: 'functions/unavailable' });
  assert.match(transportFailure.message, /bağlantı veya zaman aşımı/);
});

test('client validation allows an optional profile name but rejects repeated names', () => {
  const fragment = sourceFragment(
    aiEngineSource,
    'function sanitizeFortuneName',
    'export function isFortuneSafe',
  );
  const hasAtMostOne = new Function(`
    ${fragment}
    return hasAtMostOnePersonalName;
  `)();

  assert.equal(
    hasAtMostOne('Yakında güzel bir tesadüf kapını çalabilir.', 'Atakan', 'tr'),
    true,
  );
  assert.equal(
    hasAtMostOne('Atakan, güzel bir haber yakında sana ulaşabilir.', 'Atakan', 'tr'),
    true,
  );
  assert.equal(
    hasAtMostOne('Atakan, güzel haber seninle; Atakan.', 'Atakan', 'tr'),
    false,
  );
});

test('client fortune validation and callable parsing enforce the 200-character contract', () => {
  const fragment = sourceFragment(
    aiEngineSource,
    'function cleanText',
    'function getDatabase',
  );
  const isSafe = new Function(
    'UNSAFE_PATTERNS',
    'hasFrighteningOutcome',
    'hasInvalidFortuneToken',
    `${fragment}\nreturn isFortuneSafe;`,
  )([], () => false, () => false);

  assert.equal(isSafe('a'.repeat(200), 'en'), true);
  assert.equal(isSafe('a'.repeat(201), 'en'), false);
  assert.match(firebaseSource, /prediction\.length > 200/);
  assert.doesNotMatch(firebaseSource, /cleanString\(result\?\.data\?\.prediction, 200\)/);
  assert.doesNotMatch(firebaseSource, /cleanString\(result\?\.data\?\.prediction, 360\)/);
});

test('fortune callable timeout is bounded and reports deadline-exceeded deterministically', async () => {
  const fragment = sourceFragment(
    firebaseSource,
    'export async function settleFortuneCallWithTimeout',
    'function readLocalCache',
  ).replace('timeoutMs = FORTUNE_CALL_TIMEOUT_MS', 'timeoutMs = 42000');
  const settle = new Function(`
    ${fragment}
    return settleFortuneCallWithTimeout;
  `)();

  assert.equal(await settle(Promise.resolve('ok'), 25), 'ok');
  await assert.rejects(
    settle(new Promise(() => {}), 5),
    (error) => error?.code === 'functions/deadline-exceeded',
  );
  assert.match(firebaseSource, /FORTUNE_CALL_TIMEOUT_MS = 42 \* 1000/);
  assert.match(mainSource, /requestId: premiumRequestId,[\s\S]*timeoutMs: 42 \* 1000/);
  assert.match(firebaseSource, /timeoutMs > 0[\s\S]*settleFortuneCallWithTimeout/);
  const nonPremiumBranch = mainSource.slice(
    mainSource.indexOf('const consumed = await adManager.consumePremiumQuery()'),
    mainSource.indexOf('const elapsed = Date.now() - animationStartedAt'),
  );
  assert.doesNotMatch(nonPremiumBranch, /timeoutMs|premiumRequestId/);
});
