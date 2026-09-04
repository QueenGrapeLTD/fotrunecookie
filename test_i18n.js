import assert from 'node:assert/strict';
import fs from 'node:fs';
import { appMessages, SUPPORTED_LANGUAGES, normalizeLanguage, translate } from './i18n.js';

assert.deepEqual(SUPPORTED_LANGUAGES, ['tr', 'en', 'de', 'fr', 'es', 'it', 'el', 'zh', 'ja', 'ko']);

const referenceKeys = Object.keys(appMessages.en).sort();
assert.ok(referenceKeys.length >= 35, 'The runtime UI dictionary should cover the detailed interface');
for (const lang of SUPPORTED_LANGUAGES) {
  assert.deepEqual(Object.keys(appMessages[lang]).sort(), referenceKeys, `${lang} has missing UI keys`);
  for (const key of referenceKeys) {
    assert.ok(String(appMessages[lang][key]).trim(), `${lang}.${key} is empty`);
  }
}

assert.equal(normalizeLanguage('de-DE'), 'de');
assert.equal(normalizeLanguage('zh-CN'), 'zh');
assert.equal(normalizeLanguage('pt-BR'), 'en');
assert.equal(translate('ja', 'usage', { used: 2, limit: 10, remaining: 8 }).includes('{'), false);

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
for (const key of [
  'bootstrapTitle', 'deleteTitle', 'profilePersonalTitle', 'astroOptionalTitle', 'astroOptionalDesc',
  'birthplace', 'country', 'city', 'region', 'resolveLocation', 'focusTitle'
]) {
  assert.match(html, new RegExp(`data-i18n="${key}"`));
}
for (const id of [
  'modal-delete-account', 'delete-confirm-title', 'delete-confirm-body',
  'btn-cancel-delete-account', 'btn-confirm-delete-account'
]) {
  assert.match(html, new RegExp(`id="${id}"`));
}

const mainSource = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');
assert.doesNotMatch(mainSource, /window\.confirm\s*\(/, 'Account deletion must use the in-app confirmation modal');
assert.doesNotMatch(mainSource, /BaÄŸlÄ±/, 'Provider status must not contain mojibake');

const functionsSource = fs.readFileSync(new URL('./functions/index.js', import.meta.url), 'utf8');
for (const lang of SUPPORTED_LANGUAGES) {
  assert.match(functionsSource, new RegExp(`\\b${lang}:`), `Cloud prompt is missing ${lang}`);
}
assert.match(functionsSource, /yalnızca bu dilde/);

console.log('i18n coverage tests passed');
