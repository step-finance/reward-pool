// use crate::PRECISION;
use crate::{Pool, User};
use anchor_lang::prelude::*;
use spl_math::uint::U192;
use std::convert::TryInto;

// const SECONDS_IN_YEAR: u64 = 365 * 24 * 60 * 60;

const RATE_PRECISION: u128 = 100000000;
const PRECISION: u128 = u64::MAX as u128;

pub fn reward_per_token(
    pool: &Account<Pool>,
    total_staked: u64,
    last_time_reward_applicable: u64,
) -> Option<u128> {
    if total_staked == 0 {
        return Some(pool.reward_per_token_stored);
    }

    let time_period =
        U192::from(last_time_reward_applicable).checked_sub(pool.last_update_time.into())?;

    let rewards = pool.reward_per_token_stored.checked_add(
        time_period
            .checked_mul(pool.reward_rate.into())?
            .checked_mul(PRECISION.into())?
            .checked_div(RATE_PRECISION.into())?
            .checked_div(total_staked.into())?
            .try_into()
            .ok()?, //back to u128
    )?;
    Some(rewards)
}

pub fn user_earned_amount(pool: &Account<Pool>, user: &Account<User>) -> Option<u64> {
    let amount: u64 = u128::from(user.balance_staked)
        .checked_mul(
            (u128::from(pool.reward_per_token_stored))
                .checked_sub(user.reward_per_token_complete as u128)?,
        )?
        .checked_div(PRECISION)?
        // .checked_div(PRECISION)?
        .checked_add(u128::from(user.reward_per_token_pending))?
        .try_into()
        .ok()?; //back to u64

    Some(amount)
}

pub fn rate_by_funding(funding_amount: u64, reward_duration: u64) -> Option<u64> {
    let funding_amount: u128 = funding_amount.into();
    let reward_duration: u128 = reward_duration.into();
    let rate = funding_amount
        .checked_mul(RATE_PRECISION)?
        .checked_div(reward_duration)?;

    rate.try_into().ok()
}
