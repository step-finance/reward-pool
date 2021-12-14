use crate::*;
use pool_v1::*;
use pool_v2::*;

mod pool_v1;
mod pool_v2;

pub fn get_calculator(pool: &Account<Pool>) -> Box<dyn RewardCalculator> {
    match pool.version { 
        PoolVersion::V1 => Box::new(RewardCalculatorV1),
        PoolVersion::V2 => Box::new(RewardCalculatorV2),
    }
}

pub trait RewardCalculator {

    fn reward_per_token(&self, pool: &Account<Pool>, total_staked: u64, last_time_reward_applicable: u64)
        -> (u128, u128);
    fn rate_after_funding(&self, pool: &Account<Pool>, funding_amount_a: u64, funding_amount_b: u64) 
        -> Result<(u64, u64)>;
    fn user_earned_amount(&self, pool: &Account<Pool>, user: &Account<User>) 
        -> (u64, u64);

}