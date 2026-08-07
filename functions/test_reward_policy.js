const test = require("node:test");
const assert = require("node:assert/strict");
const {
  advanceRewardState,
  normalizeRewardState,
  REWARD_POLICY_VERSION,
} = require("./rewardPolicy");

const day = "2026-08-07";

test("one verified rewarded presentation grants one premium cookie", () => {
  const first = advanceRewardState({}, day);

  assert.equal(first.grantedCredits, 1);
  assert.deepEqual(first.next, {
    credits: 1,
    rewardedToday: 1,
    dailyLimit: 3,
    adsPerCredit: 1,
    policyVersion: REWARD_POLICY_VERSION,
    day,
  });
});

test("three premium cookie credits can be earned from three presentations", () => {
  let state = {};
  const grants = [];
  for (let index = 0; index < 3; index += 1) {
    const transition = advanceRewardState(state, day);
    grants.push(transition.grantedCredits);
    state = transition.next;
  }

  assert.deepEqual(grants, [1, 1, 1]);
  assert.equal(state.credits, 3);
  assert.equal(state.rewardedToday, 3);
  assert.equal(state.dailyLimit, 3);
});

test("a fourth callback cannot exceed the three-cookie daily limit", () => {
  const capped = advanceRewardState(
    {
      day,
      rewardedToday: 3,
      credits: 0,
      policyVersion: REWARD_POLICY_VERSION,
    },
    day,
  );

  assert.equal(capped.accepted, false);
  assert.equal(capped.grantedCredits, 0);
  assert.equal(capped.next.credits, 0);
  assert.equal(capped.next.rewardedToday, 3);
});

test("policy migration resets old progress but preserves an unused credit", () => {
  const state = normalizeRewardState(
    { day, rewardedToday: 2, credits: 1, adsPerCredit: 3 },
    day,
  );

  assert.equal(state.rewardedToday, 0);
  assert.equal(state.credits, 1);
  assert.equal(state.policyVersion, REWARD_POLICY_VERSION);
});

test("daily ad progress resets without carrying stale credits", () => {
  const state = normalizeRewardState(
    {
      day: "2026-08-06",
      rewardedToday: 3,
      credits: 1,
      policyVersion: REWARD_POLICY_VERSION,
    },
    day,
  );

  assert.equal(state.rewardedToday, 0);
  assert.equal(state.credits, 0);
});
