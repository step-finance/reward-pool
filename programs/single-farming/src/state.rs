// use crate::PRECISION;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock;
use std::convert::TryInto;
// const SECONDS_IN_YEAR: u64 = 365 * 24 * 60 * 60;

const RATE_PRECISION: u128 = 1_000_000_000_000;
const PRECISION: u128 = 1_000_000_000;

#[account]
#[derive(Default)]
/// Pool account wrapper
pub struct Pool {
    /// Nonce to derive the program-derived address owning the vaults.
    pub nonce: u8,
    /// Mint of the token that can be staked.
    pub staking_mint: Pubkey,
    /// Vault to store staked tokens.
    pub staking_vault: Pubkey,
    /// Mint of the reward token.
    pub reward_mint: Pubkey,
    /// Vault to store reward tokens.
    pub reward_vault: Pubkey,
    /// duration of farming
    pub reward_duration: u64,
    /// The timestamp at which the farming ends
    pub reward_end_timestamp: u64,
    /// The last time reward states were updated.
    pub last_update_time: u64,
    /// Rate of reward.
    pub reward_rate: u64,
    /// Last calculated reward A per pool token.
    pub reward_per_token_stored: u128,
    /// Admin can active farming
    pub admin: Pubkey,
}

impl Pool {
    /// Calculate reward base on staked token.
    pub fn reward_per_token(
        &self,
        total_staked: u64,
        last_time_reward_applicable: u64,
    ) -> Option<u128> {
        if total_staked == 0 {
            return Some(self.reward_per_token_stored);
        }

        let time_period =
            u128::from(last_time_reward_applicable).checked_sub(self.last_update_time.into())?;

        let time_diff_numerator = self
            .reward_end_timestamp
            .checked_sub(last_time_reward_applicable)?
            .checked_add(
                self.reward_end_timestamp
                    .checked_sub(self.last_update_time)?,
            )?;
        let time_diff_denominator = self.reward_duration;
        let emit_rewards: u128 = time_period
            .checked_mul(self.reward_rate.into())?
            .checked_mul(time_diff_numerator.into())?
            .checked_mul(PRECISION)?
            .checked_div(RATE_PRECISION)?
            .checked_div(time_diff_denominator.into())?
            .checked_div(total_staked.into())?;

        let rewards = self.reward_per_token_stored.checked_add(emit_rewards)?;
        Some(rewards)
    }

    /// The min of current time and reward duration end, such that after the pool reward
    /// period ends, this always returns the pool end time
    pub fn last_time_reward_applicable(&self) -> u64 {
        let c = clock::Clock::get().unwrap();
        std::cmp::min(
            c.unix_timestamp.try_into().unwrap(),
            self.reward_end_timestamp,
        )
    }

    /// Calculate reward for user
    pub fn user_earned_amount(&self, user: &Account<User>) -> Option<u64> {
        let amount: u64 = u128::from(user.balance_staked)
            .checked_mul(
                self.reward_per_token_stored
                    .checked_sub(user.reward_per_token_complete as u128)?,
            )?
            .checked_div(PRECISION)?
            .checked_add(u128::from(user.reward_per_token_pending))?
            .try_into()
            .ok()?; //back to u64

        Some(amount)
    }
}

/// User account in pool
#[account]
#[derive(Default)]
pub struct User {
    /// Pool the this user belongs to.
    pub pool: Pubkey,
    /// The owner of this account.
    pub owner: Pubkey,
    /// The amount of token A claimed.
    pub reward_per_token_complete: u128,
    /// The amount of token A pending claim.
    pub reward_per_token_pending: u64,
    /// The amount staked.
    pub balance_staked: u64,
    /// Signer nonce.
    pub nonce: u8,
}

/// Rate by funding
pub fn rate_by_funding(funding_amount: u64, reward_duration: u64) -> Option<u64> {
    let funding_amount: u128 = funding_amount.into();
    let reward_duration: u128 = reward_duration.into();
    let rate = funding_amount
        .checked_mul(RATE_PRECISION)?
        .checked_div(reward_duration)?;

    rate.try_into().ok()
}

#[cfg(test)]
mod calculator_test {
    use super::*;
    #[test]
    fn test_reward_per_token() {
        let mut pool = Pool::default();
        let duration = 3600 * 24 * 356 * 2; // 2 years duration
        pool.reward_duration = duration;
        pool.reward_end_timestamp = 1652758289 + duration; // 2 years duration
        let reward_start_timestamp = pool.reward_end_timestamp - duration;
        pool.last_update_time = reward_start_timestamp;
        let funding_amount = 100_000_000;
        pool.reward_rate = rate_by_funding(funding_amount, duration).unwrap();
        // assert_eq!(pool.reward_rate, 1_625_572); // rewards every second
        pool.reward_per_token_stored = 0;

        let total_staked = 100;

        let rewards_per_token = pool
            .reward_per_token(total_staked, reward_start_timestamp)
            .unwrap();
        assert_eq!(rewards_per_token, 0);
        let rewards_per_token = pool
            .reward_per_token(total_staked, reward_start_timestamp + duration / 10)
            .unwrap();
        assert_eq!(rewards_per_token / PRECISION, 189_999); // on the constant rate it is 100_000 (funding_amount / total_staked / 10)
        let rewards_per_token = pool
            .reward_per_token(total_staked, reward_start_timestamp + duration * 2 / 10)
            .unwrap();
        assert_eq!(rewards_per_token / PRECISION, 359_999); // on the constant rate it is 200_000 (funding_amount * 2 / total_staked / 10)
        let rewards_per_token = pool
            .reward_per_token(total_staked, reward_start_timestamp + duration * 3 / 10)
            .unwrap();
        assert_eq!(rewards_per_token / PRECISION, 509_999); // on the constant rate it is 300_000 (funding_amount * 3 / total_staked / 10)
        let rewards_per_token = pool
            .reward_per_token(total_staked, reward_start_timestamp + duration)
            .unwrap();
        assert_eq!(rewards_per_token / PRECISION, 999_999); // Is this is fine to leave some wei in the pool?
    }
}
