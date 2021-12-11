use crate::calculator::*;

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
            return (pool.reward_a_per_token_stored, pool.reward_b_per_token_stored);
        }

        let a = pool.reward_a_per_token_stored
                .checked_add(
                    (last_time_reward_applicable as u128)
                    .checked_sub(pool.last_update_time as u128)
                    .unwrap()
                    .checked_mul(pool.reward_a_rate as u128) //todo u192?
                    .unwrap()
                    .checked_mul(PRECISION) 
                    .unwrap()
                    .checked_div(SECONDS_IN_YEAR as u128)
                    .unwrap()
                    .checked_div(total_staked as u128)
                    .unwrap()
                )
                .unwrap();

        let b = pool.reward_b_per_token_stored
                .checked_add(
                    (last_time_reward_applicable as u128)
                    .checked_sub(pool.last_update_time as u128)
                    .unwrap()
                    .checked_mul(pool.reward_b_rate as u128) //todo u192?
                    .unwrap()
                    .checked_mul(PRECISION) 
                    .unwrap()
                    .checked_div(SECONDS_IN_YEAR as u128)
                    .unwrap()
                    .checked_div(total_staked as u128)
                    .unwrap()
                )
                .unwrap();

        (a, b)
    }

    fn rate_after_funding(
        &self, 
        pool: &Account<Pool>,
        funding_amount_a: u64, 
        funding_amount_b: u64
    ) -> (u64, u64) { 

        let current_time = clock::Clock::get().unwrap().unix_timestamp.try_into().unwrap();
        let reward_period_end = pool.reward_duration_end;

        let annual_multiplier = SECONDS_IN_YEAR.checked_div(pool.reward_duration).unwrap();
        let a: u64;
        let b: u64;

        if current_time >= reward_period_end {
            a = funding_amount_a.checked_mul(annual_multiplier).unwrap();
            b = funding_amount_b.checked_mul(annual_multiplier).unwrap();
        } else {
            let remaining_seconds = pool.reward_duration_end.checked_sub(current_time).unwrap();
            let leftover_a = remaining_seconds  
                .checked_mul(pool.reward_a_rate) //todo u128?
                .unwrap()
                .checked_div(SECONDS_IN_YEAR)
                .unwrap();
            let leftover_b = remaining_seconds
                .checked_mul(pool.reward_b_rate) //todo u128?
                .unwrap()
                .checked_div(SECONDS_IN_YEAR)
                .unwrap();

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

        (a, b)
    }

    fn user_earned_amount(
        &self,
        pool: &anchor_lang::Account<Pool>,
        user: &anchor_lang::Account<User>,
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
            .unwrap();

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
            .unwrap();

        (a, b)
    }
}