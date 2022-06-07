//! Contains information, and state of vault account
use anchor_lang::prelude::*;
use num_traits::ToPrimitive;

/// Locked reward degradation denominator. Used for calculating locked profit of the vault.
pub const LOCKED_REWARD_DEGRADATION_DENOMINATOR: u128 = 1_000_000_000_000;

#[account]
#[derive(Default, Debug)]
/// State of the vault account
pub struct Vault {
    /// Mint account
    pub token_mint: Pubkey,
    /// Token account
    pub token_vault: Pubkey,
    /// LP mint account
    pub lp_mint: Pubkey,
    /// Base account. Used as seed for Vault PDA. Disposable
    pub base: Pubkey,
    /// Admin account
    pub admin: Pubkey,
    /// Vault bump. Used to create signer seeds
    pub vault_bump: u8,
    /// Total amount in the vault
    pub total_amount: u64,
    /// Used to keep track, and calculate locked profit
    pub locked_reward_tracker: LockedRewardTracker,
    /// Funder account
    pub funder: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
/// Used to keep track, and calculate for locked reward.
pub struct LockedRewardTracker {
    /// Last updated locked reward
    pub last_updated_locked_reward: u64,
    /// Last unix timestamp since update
    pub last_report: u64,
    /// Used for reward dripping calculation
    pub locked_reward_degradation: u64,
}

impl Default for LockedRewardTracker {
    fn default() -> Self {
        LockedRewardTracker {
            last_updated_locked_reward: 0,
            last_report: 0,
            locked_reward_degradation: u64::try_from(LOCKED_REWARD_DEGRADATION_DENOMINATOR)
                .unwrap()
                / (3600 * 24 * 7), // locked profit is fully dripped in 7 days
        }
    }
}
impl LockedRewardTracker {
    /// Return reward which is still being locked
    pub fn calculate_locked_reward(&self, current_time: u64) -> Option<u64> {
        let duration = u128::from(current_time.checked_sub(self.last_report)?);
        let locked_reward_degradation = u128::from(self.locked_reward_degradation);
        let locked_fund_ratio = duration * locked_reward_degradation;

        if locked_fund_ratio > LOCKED_REWARD_DEGRADATION_DENOMINATOR {
            return Some(0);
        }
        let locked_reward = u128::from(self.last_updated_locked_reward);

        let locked_reward = (locked_reward
            .checked_mul(LOCKED_REWARD_DEGRADATION_DENOMINATOR - locked_fund_ratio)?)
        .checked_div(LOCKED_REWARD_DEGRADATION_DENOMINATOR)?;
        let locked_reward = u64::try_from(locked_reward).ok()?;
        Some(locked_reward)
    }

    /// Update amount of locked reward
    pub fn update_locked_reward(&mut self, current_time: u64, reward: u64) -> Option<()> {
        let last_updated_locked_reward = self.calculate_locked_reward(current_time)?;
        self.last_updated_locked_reward = last_updated_locked_reward.checked_add(reward)?;
        self.last_report = current_time;
        Some(())
    }
}

impl Vault {
    /// Return unlocked amount
    pub fn get_unlocked_amount(&self, current_time: u64) -> Option<u64> {
        self.total_amount.checked_sub(
            self.locked_reward_tracker
                .calculate_locked_reward(current_time)?,
        )
    }

    /// Stake token into the vault, and return share amount (LP)
    pub fn stake(&mut self, current_time: u64, token_amount: u64, lp_supply: u64) -> Option<u64> {
        if self.total_amount == 0 {
            self.total_amount = token_amount;
            return Some(token_amount);
        }
        let total_amount = self.get_unlocked_amount(current_time)?;
        let new_lp_token = (token_amount as u128)
            .checked_mul(lp_supply as u128)?
            .checked_div(total_amount as u128)?
            .to_u64()?;
        self.total_amount = self.total_amount.checked_add(token_amount)?;

        Some(new_lp_token)
    }

    /// Unstake from the vault, and return token amount user to receive
    pub fn unstake(
        &mut self,
        current_time: u64,
        unmint_amount: u64,
        lp_supply: u64,
    ) -> Option<u64> {
        let total_amount = self.get_unlocked_amount(current_time)?;
        let withdraw_amount = u64::try_from(
            u128::from(unmint_amount)
                .checked_mul(u128::from(total_amount))?
                .checked_div(u128::from(lp_supply))?,
        )
        .ok();
        self.total_amount = self.total_amount.checked_sub(withdraw_amount?)?;
        withdraw_amount
    }

    /// Update amount of locked reward
    pub fn update_locked_reward(&mut self, current_time: u64, reward: u64) -> Option<()> {
        self.total_amount = self.total_amount.checked_add(reward)?;
        self.locked_reward_tracker
            .update_locked_reward(current_time, reward);
        Some(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stake_and_withdraw() {
        let mut vault = Vault {
            token_mint: Pubkey::new_unique(),
            token_vault: Pubkey::new_unique(),
            lp_mint: Pubkey::new_unique(),
            base: Pubkey::new_unique(),
            admin: Pubkey::new_unique(),
            funder: Pubkey::new_unique(),
            vault_bump: 0,
            total_amount: 0,
            locked_reward_tracker: LockedRewardTracker::default(),
        };

        let mut lp_supply = 0;
        let mut total_mer = 0;
        let lp_token = vault.stake(0, 0, 1_000_000_000_000).unwrap();
        lp_supply += lp_token;
        total_mer += 1_000_000_000_000;

        // Reward some 1 MER
        total_mer += 1_000_000;

        // Withdraw 10 ui amount lp tokens
        let amount = vault.unstake(lp_supply, total_mer, 10_000_000);
        println!("{}", amount.unwrap());
    }
}
