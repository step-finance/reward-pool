use anchor_lang::prelude::*;
use num_traits::ToPrimitive;

pub const LOCKED_REWARD_DEGRATION_DENUMERATOR: u128 = 1_000_000_000_000;

#[account]
#[derive(Default, Debug)]
pub struct Vault {
    pub token_mint: Pubkey,
    pub token_vault: Pubkey,
    pub lp_mint: Pubkey,
    pub base: Pubkey,
    pub admin: Pubkey,
    pub vault_bump: u8,
    pub total_amount: u64,
    pub locked_reward_tracker: LockedRewardTracker,
    pub funder: Pubkey
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct LockedRewardTracker {
    pub last_updated_locked_reward: u64,
    pub last_report: u64,
    pub locked_reward_degradation: u64,
}

impl Default for LockedRewardTracker {
    fn default() -> Self {
        return LockedRewardTracker {
            last_updated_locked_reward: 0,
            last_report: 0,
            locked_reward_degradation: u64::try_from(LOCKED_REWARD_DEGRATION_DENUMERATOR).unwrap()
                / (3600 * 24 * 7), // locked profit is fully dripped in 7 days
        };
    }
}
impl LockedRewardTracker {
    pub fn calculate_locked_reward(&self, current_time: u64) -> Option<u64> {
        let duration = u128::from(current_time.checked_sub(self.last_report)?);
        let locked_reward_degradation = u128::from(self.locked_reward_degradation);
        let locked_fund_ratio = duration * locked_reward_degradation;

        if locked_fund_ratio > LOCKED_REWARD_DEGRATION_DENUMERATOR {
            return Some(0);
        }
        let locked_reward = u128::from(self.last_updated_locked_reward);

        let locked_reward = (locked_reward
            .checked_mul(LOCKED_REWARD_DEGRATION_DENUMERATOR - locked_fund_ratio)?)
        .checked_div(LOCKED_REWARD_DEGRATION_DENUMERATOR)?;
        let locked_reward = u64::try_from(locked_reward).ok()?;
        return Some(locked_reward);
    }

    pub fn update_locked_reward(&mut self, current_time: u64, reward: u64) -> Option<()> {
        let last_updated_locked_reward = self.calculate_locked_reward(current_time)?;
        self.last_updated_locked_reward = last_updated_locked_reward.checked_add(reward)?;
        self.last_report = current_time;
        Some(())
    }
}

impl Vault {
    pub fn get_unlocked_amount(&self, current_time: u64) -> Option<u64> {
        self.total_amount.checked_sub(
            self.locked_reward_tracker
                .calculate_locked_reward(current_time)?,
        )
    }

    pub fn stake(&mut self, current_time: u64, token_amount: u64, lp_supply: u64) -> Option<u64> {
        let total_amount = self.get_unlocked_amount(current_time)?;
        if total_amount == 0 {
            self.total_amount = token_amount;
            return Some(token_amount);
        }

        let new_lp_token = (token_amount as u128)
            .checked_mul(lp_supply as u128)?
            .checked_div(total_amount as u128)?
            .to_u64()?;
        self.total_amount = self.total_amount.checked_add(token_amount)?;

        Some(new_lp_token)
    }

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
        return withdraw_amount;
    }

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
