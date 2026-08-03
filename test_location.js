import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateUtcOffsetForLocalDate } from './locationService.js';

test('timezone offset respects daylight saving at the birth date', () => {
  assert.equal(
    calculateUtcOffsetForLocalDate('America/New_York', '2024-01-15', '12:00'),
    -5,
  );
  assert.equal(
    calculateUtcOffsetForLocalDate('America/New_York', '2024-07-15', '12:00'),
    -4,
  );
});

test('timezone offset handles fixed modern Istanbul time', () => {
  assert.equal(
    calculateUtcOffsetForLocalDate('Europe/Istanbul', '2024-07-15', '08:30'),
    3,
  );
});

test('timezone offset rejects incomplete location data', () => {
  assert.equal(calculateUtcOffsetForLocalDate('', '2024-07-15', '08:30'), null);
  assert.equal(calculateUtcOffsetForLocalDate('Europe/Istanbul', '', '08:30'), null);
});
