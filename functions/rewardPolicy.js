const ADMOB_DAILY_REWARD_LIMIT = 3;
const ADMOB_ADS_PER_CREDIT = 3;

function normalizeRewardState(data = {}, day) {
  const currentDay = data.day === day;
  return {
    credits: currentDay ? Math.max(Number(data.credits) || 0, 0) : 0,
    rewardedToday: currentDay
      ? Math.max(Number(data.rewardedToday) || 0, 0)
      : 0,
    dailyLimit: ADMOB_DAILY_REWARD_LIMIT,
    adsPerCredit: ADMOB_ADS_PER_CREDIT,
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
  advanceRewardState,
  normalizeRewardState,
};
