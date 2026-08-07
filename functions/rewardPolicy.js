// One completed AdMob rewarded presentation may itself contain an ad pod.
// Count the SDK's single verified reward event as one Premium Cookie credit.
// Freemium users may earn at most three credits per day.
const ADMOB_DAILY_REWARD_LIMIT = 3;
const ADMOB_ADS_PER_CREDIT = 1;
const REWARD_POLICY_VERSION = 2;

function normalizeRewardState(data = {}, day) {
  const currentDay = data.day === day;
  const currentPolicy = Number(data.policyVersion) === REWARD_POLICY_VERSION;
  return {
    credits: currentDay ? Math.max(Number(data.credits) || 0, 0) : 0,
    rewardedToday: currentDay && currentPolicy
      ? Math.max(Number(data.rewardedToday) || 0, 0)
      : 0,
    dailyLimit: ADMOB_DAILY_REWARD_LIMIT,
    adsPerCredit: ADMOB_ADS_PER_CREDIT,
    policyVersion: REWARD_POLICY_VERSION,
    day,
  };
}

function advanceRewardState(data = {}, day) {
  const previous = normalizeRewardState(data, day);
  if (previous.rewardedToday >= previous.dailyLimit) {
    return {
      accepted: false,
      grantedCredits: 0,
      previous,
      next: previous,
    };
  }

  const nextRewardedToday = previous.rewardedToday + 1;
  const previousEarnedCredits = Math.floor(
    previous.rewardedToday / ADMOB_ADS_PER_CREDIT,
  );
  const nextEarnedCredits = Math.floor(
    nextRewardedToday / ADMOB_ADS_PER_CREDIT,
  );
  const grantedCredits = Math.max(
    nextEarnedCredits - previousEarnedCredits,
    0,
  );

  return {
    accepted: true,
    grantedCredits,
    previous,
    next: {
      ...previous,
      credits: previous.credits + grantedCredits,
      rewardedToday: nextRewardedToday,
    },
  };
}

module.exports = {
  ADMOB_ADS_PER_CREDIT,
  ADMOB_DAILY_REWARD_LIMIT,
  REWARD_POLICY_VERSION,
  advanceRewardState,
  normalizeRewardState,
};
