const test = require("node:test");
const assert = require("node:assert/strict");
const {
  advanceRewardState,
  normalizeRewardState,
} = require("./rewardPolicy");

const day = "2026-08-05";

test("one premium cookie credit is granted on exactly the third verified ad", () => {
  const first = advanceRewardState({}, day);
  const second = advanceRewardState(first.next, day);
  const third = advanceRewardState(second.next, day);

  assert.equal(first.grantedCredits, 0);
  assert.equal(second.grantedCredits, 0);
  assert.equal(third.grantedCredits, 1);
  assert.deepEqual(third.next, {
    credits: 1,
    rewardedToday: 3,
    dailyLimit: 9,
    adsPerCredit: 3,
    day,
  });
});

test("three premium cookie credits can be earned from nine verified ads", () => {
  let state = {};
  const grants = [];
  for (let index = 0; index < 9; index += 1) {
    const transition = advanceRewardState(state, day);
    grants.push(transition.grantedCredits);
    state = transition.next;
  }

  assert.deepEqual(grants, [0, 0, 1, 0, 0, 1, 0, 0, 1]);
  assert.equal(state.credits, 3);
  assert.equal(state.rewardedToday, 9);
  assert.equal(state.dailyLimit, 9);
});

test("a tenth callback cannot exceed the three-cookie daily limit", () => {
  const capped = advanceRewardState(
    { day, rewardedToday: 9, credits: 0 },
    day,
  );

  assert.equal(capped.accepted, false);
  assert.equal(capped.grantedCredits, 0);
  assert.equal(capped.next.credits, 0);
  assert.equal(capped.next.rewardedToday, 9);
});

test("daily ad progress resets without carrying stale credits", () => {
  const state = normalizeRewardState(
    { day: "2026-08-04", rewardedToday: 9, credits: 1 },
    day,
  );

  assert.equal(state.rewardedToday, 0);
  assert.equal(state.credits, 0);
});
