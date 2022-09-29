use std::convert::TryInto;

///  precision
pub const PRECISION: u128 = 1_000_000_000;
///  seconds in year
pub const SECONDS_IN_YEAR: u64 = 365 * 24 * 60 * 60;

/// Calculate reward base on staked token.
pub fn reward_per_token(
    total_staked: u64,
    last_time_reward_applicable: u64,
    reward_per_token_stored: u128,
    last_update_time: u64,
    reward_rate: u64,
) -> Option<u128> {
    if total_staked == 0 {
        return Some(reward_per_token_stored);
    }

    let time_period = u128::from(last_time_reward_applicable)
        .checked_sub(last_update_time.into())
        .unwrap();
    let rewards = reward_per_token_stored
        .checked_add(
            time_period
                .checked_mul(reward_rate.into())
                .unwrap()
                .checked_mul(PRECISION.into())
                .unwrap()
                .checked_div(SECONDS_IN_YEAR.into())
                .unwrap()
                .checked_div(total_staked.into())
                .unwrap()
                .try_into()
                .unwrap(), //back to u128
        )
        .unwrap();

    Some(rewards)
}

/// Calculate user earned amount
pub fn user_earned_amount(
    balance_staked: u64,
    pool_reward_per_token_stored: u128,
    user_reward_per_token_complete: u128,
    user_reward_per_token_pending: u64,
) -> Option<u64> {
    let amount: u64 = u128::from(balance_staked)
        .checked_mul(pool_reward_per_token_stored.checked_sub(user_reward_per_token_complete)?)?
        .checked_div(PRECISION)?
        .checked_add(u128::from(user_reward_per_token_pending))?
        .try_into()
        .ok()?; //back to u64

    Some(amount)
}

/// Rate by funding
pub fn rate_by_funding(funding_amount: u64, reward_duration: u64) -> Option<u64> {
    let annual_multiplier = SECONDS_IN_YEAR.checked_div(reward_duration)?;
    funding_amount.checked_mul(annual_multiplier)
}
