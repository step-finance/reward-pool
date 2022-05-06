use crate::calculator::*;
use spl_math::uint::U192;

const SECONDS_IN_YEAR: u64 = 365 * 24 * 60 * 60;

pub struct RewardCalculatorV2;

impl RewardCalculator for RewardCalculatorV2 {
    fn reward_per_token(
        &self,
        pool: &Account<Pool>,
        total_staked: u64,
        last_time_reward_applicable: u64,
    ) -> (u128, u128) {
        if total_staked == 0 {
            return (
                pool.reward_a_per_token_stored,
                pool.reward_b_per_token_stored,
            );
        }

        let time_period = U192::from(last_time_reward_applicable)
            .checked_sub(pool.last_update_time.into())
            .unwrap();
        let a = pool
            .reward_a_per_token_stored
            .checked_add(
                time_period
                    .checked_mul(pool.reward_a_rate.into())
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

        let b = pool
            .reward_b_per_token_stored
            .checked_add(
                time_period
                    .checked_mul(pool.reward_b_rate.into())
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

        (a, b)
    }

    fn rate_after_funding(
        &self,
        pool: &mut Account<Pool>,
        _reward_a_vault: &Account<TokenAccount>,
        _reward_b_vault: &Account<TokenAccount>,
        funding_amount_a: u64,
        funding_amount_b: u64,
    ) -> Result<(u64, u64)> {
        let current_time = clock::Clock::get()
            .unwrap()
            .unix_timestamp
            .try_into()
            .unwrap();
        let reward_period_end = pool.reward_duration_end;

        let annual_multiplier = SECONDS_IN_YEAR.checked_div(pool.reward_duration).unwrap();
        let a: u64;
        let b: u64;

        if current_time >= reward_period_end {
            a = funding_amount_a.checked_mul(annual_multiplier).unwrap();
            b = funding_amount_b.checked_mul(annual_multiplier).unwrap();
        } else {
            let remaining_seconds = reward_period_end.checked_sub(current_time).unwrap();
            let leftover_a: u64 = (remaining_seconds as u128)
                .checked_mul(pool.reward_a_rate.into())
                .unwrap()
                .checked_div(SECONDS_IN_YEAR.into())
                .unwrap()
                .try_into()
                .unwrap(); //back to u64
            let leftover_b: u64 = (remaining_seconds as u128)
                .checked_mul(pool.reward_b_rate.into())
                .unwrap()
                .checked_div(SECONDS_IN_YEAR.into())
                .unwrap()
                .try_into()
                .unwrap(); //back to u64

            a = funding_amount_a
                .checked_add(leftover_a)
                .unwrap()
                .checked_mul(annual_multiplier)
                .unwrap();
            b = funding_amount_b
                .checked_add(leftover_b)
                .unwrap()
                .checked_mul(annual_multiplier)
                .unwrap();
        }

        Ok((a, b))
    }

    fn user_earned_amount(
        &self,
        pool: &Account<Pool>,
        user: &Account<User>,
    ) -> (u64, u64) {
        let a: u64 = (user.balance_staked as u128)
            .checked_mul(
                (pool.reward_a_per_token_stored as u128)
                    .checked_sub(user.reward_a_per_token_complete as u128)
                    .unwrap(),
            )
            .unwrap()
            .checked_div(PRECISION)
            .unwrap()
            .checked_add(user.reward_a_per_token_pending as u128)
            .unwrap()
            .try_into()
            .unwrap(); //back to u64

        let b: u64 = (user.balance_staked as u128)
            .checked_mul(
                (pool.reward_b_per_token_stored as u128)
                    .checked_sub(user.reward_b_per_token_complete as u128)
                    .unwrap(),
            )
            .unwrap()
            .checked_div(PRECISION)
            .unwrap()
            .checked_add(user.reward_b_per_token_pending as u128)
            .unwrap()
            .try_into()
            .unwrap(); //back to u64

        (a, b)
    }
}
