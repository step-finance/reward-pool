use crate::calculator::*;

pub struct RewardCalculatorV1 {
    reward_a_per_token_stored: u128,
    reward_a_rate: u64,
    reward_b_per_token_stored: u128,
    reward_b_rate: u64,
    last_update_time: u64,
    reward_duration_end: u64,
    reward_duration: u64,
}

impl RewardCalculatorV1 {

    pub fn new(pool: &Account<Pool>) -> RewardCalculatorV1 {
        RewardCalculatorV1 {
            reward_a_per_token_stored: pool.reward_a_per_token_stored,
            reward_a_rate: pool.reward_a_rate,
            reward_b_per_token_stored: pool.reward_b_per_token_stored,
            reward_b_rate: pool.reward_b_rate,
            last_update_time: pool.last_update_time,
            reward_duration_end: pool.reward_duration_end,
            reward_duration: pool.reward_duration
        }
    }

}

impl RewardCalculator for RewardCalculatorV1 {

    fn reward_per_token(
        &self,
        total_staked: u64,
        last_time_reward_applicable: u64,
    ) -> (u128, u128) {

        if total_staked == 0 {
            return (self.reward_a_per_token_stored, self.reward_b_per_token_stored);
        }

        let a = self.reward_a_per_token_stored
                .checked_add(
                    (last_time_reward_applicable as u128)
                    .checked_sub(self.last_update_time as u128)
                    .unwrap()
                    .checked_mul(self.reward_a_rate as u128)
                    .unwrap()
                    .checked_mul(PRECISION)
                    .unwrap()
                    .checked_div(total_staked as u128)
                    .unwrap()
                )
                .unwrap();

        let b = self.reward_b_per_token_stored
                .checked_add(
                    (last_time_reward_applicable as u128)
                    .checked_sub(self.last_update_time as u128)
                    .unwrap()
                    .checked_mul(self.reward_b_rate as u128)
                    .unwrap()
                    .checked_mul(PRECISION)
                    .unwrap()
                    .checked_div(total_staked as u128)
                    .unwrap()
                )
                .unwrap();

        (a, b)
    }

    fn rate_after_funding(&self, funding_amount_a: u64, funding_amount_b: u64) -> (u64, u64) { 

        let current_time = clock::Clock::get().unwrap().unix_timestamp.try_into().unwrap();
        let reward_period_end = self.reward_duration_end;

        let a: u64;
        let b: u64;

        if current_time >= reward_period_end {
            a = funding_amount_a.checked_div(self.reward_duration).unwrap();
            b = funding_amount_b.checked_div(self.reward_duration).unwrap();
        } else {
            let remaining = self.reward_duration_end.checked_sub(current_time).unwrap();
            let leftover_a = remaining.checked_mul(self.reward_a_rate).unwrap();
            let leftover_b = remaining.checked_mul(self.reward_b_rate).unwrap();

            a = funding_amount_a
                .checked_add(leftover_a)
                .unwrap()
                .checked_div(self.reward_duration)
                .unwrap();
            b = funding_amount_b
                .checked_add(leftover_b)
                .unwrap()
                .checked_div(self.reward_duration)
                .unwrap();
        }

        (a, b)
    }
}