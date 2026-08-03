import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('result numbers stay locked to the six artwork medallions', () => {
  assert.match(css, /\.numbers-grid\s*\{[\s\S]*?top:\s*4\.2cqw/);
  assert.match(css, /\.number-badge\s*\{[\s\S]*?animation-name:\s*popNumberLocked/);
  assert.match(css, /transform:\s*translate\(-50%,\s*-50%\)\s*scale\(1\)/);

  for (const center of ['18%', '30.86%', '43.65%', '56.45%', '69.34%', '82.03%']) {
    assert.ok(css.includes(`left: ${center}`), `Missing fixed medallion center ${center}`);
  }
});
