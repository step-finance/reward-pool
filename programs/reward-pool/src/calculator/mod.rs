use crate::*;
use pool_v1::*;

mod pool_v1;

pub fn get_calculator(pool: &Account<Pool>) -> Box<dyn RewardCalculator> {
    let i = RewardCalculatorV1::new(pool);
    Box::new(i)
}

pub trait RewardCalculator {

    fn reward_per_token(&self, total_staked: u64, last_time_reward_applicable: u64) -> (u128, u128);
    fn rate_after_funding(&self, funding_amount_a: u64, funding_amount_b: u64) -> (u64, u64);

}