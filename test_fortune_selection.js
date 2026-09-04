import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseNonRepeatingFortune } from './fortuneSelection.js';

test('offline fortunes cycle through the pool before repeating', () => {
  const pool = ['one', 'two', 'three', 'four'];
  let recent = [];
  const selected = [];
  for (let index = 0; index < pool.length; index += 1) {
    const result = chooseNonRepeatingFortune(pool, recent, () => 0);
    selected.push(result.selected);
    recent = result.recent;
  }
  assert.equal(new Set(selected).size, pool.length);
});

test('offline fortune rollover never repeats the immediately previous item', () => {
  const pool = ['one', 'two'];
  const first = chooseNonRepeatingFortune(pool, [], () => 0);
  const second = chooseNonRepeatingFortune(pool, first.recent, () => 0);
  const third = chooseNonRepeatingFortune(pool, second.recent, () => 0);
  assert.notEqual(first.selected, second.selected);
  assert.notEqual(second.selected, third.selected);
});
