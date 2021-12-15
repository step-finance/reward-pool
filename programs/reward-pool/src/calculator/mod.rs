use crate::*;
use pool_v1::*;
use pool_v2::*;

mod pool_v1;
mod pool_v2;

/// Retrieve a calculator for a specific pool
pub fn get_calculator(pool: &Account<Pool>) -> Box<dyn RewardCalculator> {
    match pool.version { 
        PoolVersion::V1 => Box::new(RewardCalculatorV1),
        PoolVersion::V2 => Box::new(RewardCalculatorV2),
    }
}

/// A reward calculator handles the calculations of reward rates and user reward amounts
pub trait RewardCalculator {

    /// Calculates the current reward per token that should have been paid out
    fn reward_per_token(&self, pool: &Account<Pool>, total_staked: u64, last_time_reward_applicable: u64)
        -> (u128, u128);

    /// Calculates the rate per token after funding
    fn rate_after_funding(&self, pool: &Account<Pool>, funding_amount_a: u64, funding_amount_b: u64) 
        -> Result<(u64, u64)>;

    /// Calculates the amount that a user earned
    fn user_earned_amount(&self, pool: &Account<Pool>, user: &Account<User>) 
        -> (u64, u64);

}