use crate::*;
use pool::*;

mod pool;

/// Retrieve a calculator for a specific pool
pub fn get_calculator() -> Box<dyn RewardCalculator> {
    Box::new(RewardCalculatorV2)
}

/// A reward calculator handles the calculations of reward rates and user reward amounts
pub trait RewardCalculator {
    /// Calculates the current reward per token that should have been paid out
    fn reward_per_token(
        &self,
        pool: &Account<Pool>,
        total_staked: u64,
        last_time_reward_applicable: u64,
    ) -> (u128, u128);

    /// Calculates the rate per token after a funding, assuming the reward end date will be updated
    /// **This call may mutate the pool to a new version**; it is the time that upgrades are applied
    /// as of V2.
    fn rate_after_funding(
        &self,
        pool: &mut Account<Pool>,
        reward_a_vault: &Account<TokenAccount>,
        reward_b_vault: &Account<TokenAccount>,
        funding_amount_a: u64,
        funding_amount_b: u64,
    ) -> Result<(u64, u64)>;

    /// Calculates the amount that a user earned
    fn user_earned_amount(&self, pool: &Account<Pool>, user: &Account<User>) -> (u64, u64);
}
