use crate::error::ErrorCode;
use crate::utils::{
    get_current_time, rate_by_funding, reward_per_token, user_earned_amount, PRECISION,
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock;
use std::convert::TryFrom;
use std::convert::TryInto;

#[account]
#[derive(Default, Debug)]
/// Pool account wrapper
pub struct Pool {
    /// staking_vault_nonce.
    pub staking_vault_nonce: u8,
    /// Mint of the token that can be staked.
    pub staking_mint: Pubkey,
    /// Vault to store staked tokens.
    pub staking_vault: Pubkey,

    /// Mint of the xMER.
    pub xmer_reward_mint: Pubkey,
    /// Vault to store xMER token.
    pub xmer_reward_vault: Pubkey,
    /// xMER reward duration
    pub xmer_reward_duration: u64,
    /// Rate of xMER reward.
    pub xmer_reward_rate: u64,
    /// The timestamp at which the xMER farming ends
    pub xmer_reward_end_timestamp: u64,
    /// Last calculated xMER reward per pool token.
    pub xmer_reward_per_token_stored: u128,
    /// The last time xMER reward states were updated.
    pub xmer_last_update_time: u64,

    /// Mint of the xMER.
    pub jup_reward_mint: Pubkey,
    /// Vault to store xMER token.
    pub jup_reward_vault: Pubkey,
    /// duration of JUP farming
    pub jup_reward_duration: u64,
    /// The timestamp at which the JUP farming ends
    pub jup_reward_end_timestamp: u64,
    /// The last time jup reward states were updated.
    pub jup_last_update_time: u64,
    /// Rate of JUP reward.
    pub jup_reward_rate: u64,
    /// Last calculated JUP reward per pool token.
    pub jup_reward_per_token_stored: u128,
    /// Total funded jup
    pub total_funded_jup: u64,
    /// Whether admin set jup info
    pub is_jup_info_enable: u8,

    /// Only Admin can active jup farming
    pub admin: Pubkey,
    /// Total staked amount
    pub total_staked: u64,
    /// authorized funders
    /// [] because short size, fixed account size, and ease of use on
    /// client due to auto generated account size property
    pub funders: [Pubkey; 4], // 32 * 4 = 128
}

impl Pool {
    /// Calculate claimable jup for an user
    pub fn calculate_claimable_jup_for_an_user(
        &self,
        user_pending_jup: u64,
        user_harvested_jup: u64,
    ) -> Option<u64> {
        let user_pending_jup: u128 = user_pending_jup.into();
        let user_harvested_jup: u128 = user_harvested_jup.into();

        let total_jup = u128::from(self.jup_reward_rate)
            .checked_mul(u128::from(self.jup_reward_duration))?
            .checked_div(PRECISION)?;

        let total_funded_jup: u128 = self.total_funded_jup.into();

        let claimable_jup = user_pending_jup
            .checked_mul(total_funded_jup)?
            .checked_div(total_jup)?;

        let user_can_claim_jup = if claimable_jup > user_harvested_jup {
            claimable_jup.checked_sub(user_harvested_jup)?
        } else {
            0
        };
        u64::try_from(user_can_claim_jup).ok()
    }
    /// return actual amount should be funded
    pub fn fund_jup(&mut self, amount: u64) -> Option<u64> {
        let total_jup: u64 = u128::from(self.jup_reward_rate)
            .checked_mul(u128::from(self.jup_reward_duration))?
            .checked_div(PRECISION)?
            .try_into()
            .ok()?;

        let needed_jup = total_jup.checked_sub(self.total_funded_jup)?;

        let actual_amount = if needed_jup > amount {
            amount
        } else {
            needed_jup
        };
        self.total_funded_jup = self.total_funded_jup.checked_add(actual_amount)?;
        Some(actual_amount)
    }
    /// Update jup reward
    pub fn update_jup_rewards(&mut self, user: &mut Box<Account<User>>) -> Result<()> {
        let total_staked = self.total_staked;
        let last_time_jup_reward_applicable = self.last_time_jup_reward_applicable();

        let reward = self
            .jup_reward_per_token(total_staked, last_time_jup_reward_applicable)
            .ok_or(ErrorCode::MathOverFlow)?;

        self.jup_reward_per_token_stored = reward;
        self.jup_last_update_time = last_time_jup_reward_applicable;

        let amount = self
            .user_earned_jup_amount(user)
            .ok_or(ErrorCode::MathOverFlow)?;

        user.total_jup_reward = amount;
        user.jup_reward_per_token_complete = self.jup_reward_per_token_stored;

        Ok(())
    }

    /// Updates the pool with the total reward per token that is due stakers
    pub fn update_xmer_rewards(&mut self, user: Option<&mut Box<Account<User>>>) -> Result<()> {
        let total_staked = self.total_staked;
        let last_time_xmer_reward_applicable = self.last_time_xmer_reward_applicable();

        let reward = self
            .xmer_reward_per_token(total_staked, last_time_xmer_reward_applicable)
            .ok_or(ErrorCode::MathOverFlow)?;

        self.xmer_reward_per_token_stored = reward;
        self.xmer_last_update_time = last_time_xmer_reward_applicable;

        if let Some(u) = user {
            let amount = self
                .user_earned_xmer_amount(u)
                .ok_or(ErrorCode::MathOverFlow)?;

            u.xmer_reward_pending = amount;
            u.xmer_reward_per_token_complete = self.xmer_reward_per_token_stored;
        }

        Ok(())
    }

    /// Calculate JUP reward base on staked token.
    pub fn jup_reward_per_token(
        &self,
        total_staked: u64,
        last_time_reward_applicable: u64,
    ) -> Option<u128> {
        return reward_per_token(
            total_staked,
            last_time_reward_applicable,
            self.jup_reward_per_token_stored,
            self.jup_last_update_time,
            self.jup_reward_rate,
        );
    }

    /// Calculate xMER reward base on staked token.
    pub fn xmer_reward_per_token(
        &self,
        total_staked: u64,
        last_time_reward_applicable: u64,
    ) -> Option<u128> {
        return reward_per_token(
            total_staked,
            last_time_reward_applicable,
            self.xmer_reward_per_token_stored,
            self.xmer_last_update_time,
            self.xmer_reward_rate,
        );
    }

    /// The min of current time and reward duration end, such that after the pool reward
    /// period ends, this always returns the pool end time
    pub fn last_time_jup_reward_applicable(&self) -> u64 {
        let current_time = get_current_time().unwrap();
        std::cmp::min(current_time, self.jup_reward_end_timestamp)
    }

    /// The min of current time and jup reward duration end, such that after the pool reward
    /// period ends, this always returns the pool end time
    pub fn last_time_xmer_reward_applicable(&self) -> u64 {
        let current_time = get_current_time().unwrap();
        std::cmp::min(current_time, self.xmer_reward_end_timestamp)
    }

    /// Calculate jup reward for user
    pub fn user_earned_jup_amount(&self, user: &Account<User>) -> Option<u64> {
        return user_earned_amount(
            user.balance_staked,
            self.jup_reward_per_token_stored,
            user.jup_reward_per_token_complete,
            user.total_jup_reward,
        );
    }
    /// Calculate xmer reward for user
    pub fn user_earned_xmer_amount(&self, user: &Account<User>) -> Option<u64> {
        return user_earned_amount(
            user.balance_staked,
            self.xmer_reward_per_token_stored,
            user.xmer_reward_per_token_complete,
            user.xmer_reward_pending,
        );
    }

    /// xMER Farming rate after funding
    pub fn xmer_rate_after_funding(&self, funding_amount: u64) -> Result<u64> {
        let current_time = get_current_time().unwrap();
        let reward_period_end = self.xmer_reward_end_timestamp;

        let reward_rate = rate_by_funding(funding_amount, self.xmer_reward_duration)
            .ok_or(ErrorCode::MathOverFlow)?;

        let xmer_amount: u64;

        if current_time >= reward_period_end {
            xmer_amount = reward_rate;
        } else {
            let remaining_seconds = reward_period_end.checked_sub(current_time).unwrap();
            let leftover_xmer: u64 = (remaining_seconds as u128)
                .checked_mul(self.xmer_reward_rate.into())
                .unwrap()
                .checked_div(PRECISION)
                .unwrap()
                .try_into()
                .unwrap(); //back to u64

            let total_xmer_amount = leftover_xmer
                .checked_add(funding_amount)
                .ok_or(ErrorCode::MathOverFlow)?;

            xmer_amount = rate_by_funding(total_xmer_amount, self.xmer_reward_duration)
                .ok_or(ErrorCode::MathOverFlow)?;
        }

        Ok(xmer_amount)
    }
}

/// User account in pool
#[account]
#[derive(Default, Debug)]
pub struct User {
    /// Pool the this user belongs to.
    pub pool: Pubkey,
    /// The owner of this account.
    pub owner: Pubkey,
    /// xmer_reward_per_token_complete
    pub jup_reward_per_token_complete: u128,
    /// The amount of Jup pending claim.
    pub total_jup_reward: u64,
    /// The amount of Jup harvested.
    pub jup_reward_harvested: u64,

    /// xmer_reward_per_token_complete
    pub xmer_reward_per_token_complete: u128,
    /// The amount of xMER pending claim.
    pub xmer_reward_pending: u64,
    /// The amount staked.
    pub balance_staked: u64,
    /// Signer nonce.
    pub nonce: u8,
}

#[test]
fn test_remaining_jup_reward_after_pool_ended() {
    use sn_fake_clock::FakeClock;
    let reward_amount = 143_441_881_917_165_473u64;
    let reward_duration = 86400u64 * 90;

    let mut user_1 = User {
        balance_staked: 123_456_789,
        ..Default::default()
    };

    let mut user_2 = User {
        balance_staked: 133_266_377,
        ..Default::default()
    };

    let mut pool = Pool {
        jup_last_update_time: FakeClock::time(),
        jup_reward_duration: reward_duration,
        jup_reward_rate: rate_by_funding(reward_amount, reward_duration).unwrap(),
        jup_reward_end_timestamp: FakeClock::time() + reward_duration,
        total_staked: user_1.balance_staked + user_2.balance_staked,
        ..Default::default()
    };

    // Advance clock to reward end timestamp
    FakeClock::advance_time(reward_duration);

    // Compute how many jup per token staked
    let jup_reward_per_token = pool
        .jup_reward_per_token(pool.total_staked, pool.last_time_jup_reward_applicable())
        .unwrap();
    pool.jup_reward_per_token_stored = jup_reward_per_token;
    pool.jup_last_update_time = FakeClock::time();

    // Calculate user 1 earned jup reward
    let user_1_jup_reward = user_earned_amount(
        user_1.balance_staked,
        pool.jup_reward_per_token_stored,
        user_1.jup_reward_per_token_complete,
        user_1.total_jup_reward,
    )
    .unwrap();
    user_1.total_jup_reward = user_1_jup_reward;
    user_1.jup_reward_per_token_complete = jup_reward_per_token;

    // Calculate user 2 earned jup reward
    let user_2_jup_reward = user_earned_amount(
        user_2.balance_staked,
        pool.jup_reward_per_token_stored,
        user_2.jup_reward_per_token_complete,
        user_2.total_jup_reward,
    )
    .unwrap();
    user_2.total_jup_reward = user_2_jup_reward;
    user_2.jup_reward_per_token_complete = jup_reward_per_token;

    // Admin fund 50%
    pool.fund_jup(reward_amount / 2).unwrap();

    // User 1 harvest jup
    user_1.jup_reward_harvested += pool
        .calculate_claimable_jup_for_an_user(user_1.total_jup_reward, user_1.jup_reward_harvested)
        .unwrap();

    // User 2 harvest jup
    user_2.jup_reward_harvested += pool
        .calculate_claimable_jup_for_an_user(user_2.total_jup_reward, user_2.jup_reward_harvested)
        .unwrap();

    // Admin now fully fund the pool
    pool.fund_jup(reward_amount).unwrap();

    // User 1 harvest jup
    user_1.jup_reward_harvested += pool
        .calculate_claimable_jup_for_an_user(user_1.total_jup_reward, user_1.jup_reward_harvested)
        .unwrap();

    // User 2 harvest jup
    user_2.jup_reward_harvested += pool
        .calculate_claimable_jup_for_an_user(user_2.total_jup_reward, user_2.jup_reward_harvested)
        .unwrap();

    let total_harvested_jup = user_1.jup_reward_harvested + user_2.jup_reward_harvested;

    assert_eq!(total_harvested_jup, pool.total_funded_jup);

    // Loss 1 JUP from promised reward amount
    assert_eq!(reward_amount - total_harvested_jup, 1);
}

#[test]
fn test_xmer_reward_rate_after_funding() {
    use sn_fake_clock::FakeClock;
    let reward_amount = 100_000_000;
    let reward_duration = 10; // 10 seconds

    let mut pool = Pool {
        xmer_last_update_time: FakeClock::time(),
        xmer_reward_duration: reward_duration,
        xmer_reward_end_timestamp: FakeClock::time() + reward_duration,
        ..Default::default()
    };

    let xmer_reward_rate: u128 = pool.xmer_rate_after_funding(reward_amount).unwrap().into();
    pool.xmer_reward_rate = xmer_reward_rate as u64;

    assert_eq!(xmer_reward_rate / PRECISION, 10_000_000);

    FakeClock::advance_time(5);

    // Fund again to extend the reward duration
    let xmer_reward_rate: u128 = pool.xmer_rate_after_funding(reward_amount).unwrap().into();

    assert_eq!(xmer_reward_rate / PRECISION, 15_000_000);
}
