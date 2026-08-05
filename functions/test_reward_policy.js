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
    dailyLimit: 3,
    adsPerCredit: 3,
    day,
  });
});

test("a fourth callback cannot grant another credit on the same day", () => {
  const capped = advanceRewardState(
    { day, rewardedToday: 3, credits: 1 },
    day,
  );

  assert.equal(capped.accepted, false);
  assert.equal(capped.grantedCredits, 0);
  assert.equal(capped.next.credits, 1);
  assert.equal(capped.next.rewardedToday, 3);
});

test("daily ad progress resets without carrying stale credits", () => {
  const state = normalizeRewardState(
    { day: "2026-08-04", rewardedToday: 3, credits: 1 },
    day,
  );

  assert.equal(state.rewardedToday, 0);
  assert.equal(state.credits, 0);
});
