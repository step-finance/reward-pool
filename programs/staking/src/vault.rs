use anchor_lang::prelude::*;
use num_traits::ToPrimitive;

#[account]
#[derive(Default)]
pub struct Vault {
    pub vault_mer: Pubkey,
    pub lp_mint: Pubkey,
    pub admin: Pubkey,
    pub bumps: VaultBumps,
}

impl Vault {
    pub fn stake(&mut self, lp_supply: u64, total_mer: u64, mer_amount: u64) -> u64 {
        // When total MER in the vault is 0, 1 MER will be converted to 1 LP.
        if total_mer == 0 {
            return mer_amount;
        }

        let new_lp_token = (mer_amount as u128)
            .checked_mul(lp_supply as u128)
            .unwrap()
            .checked_div(total_mer as u128)
            .unwrap()
            .to_u64()
            .unwrap();

        new_lp_token
    }

    pub fn withdraw(&mut self, lp_supply: u64, total_mer: u64, lp_amount: u64) -> u64 {
        let mer_amount: u64 = (lp_amount as u128)
            .checked_mul(total_mer as u128)
            .unwrap()
            .checked_div(lp_supply as u128)
            .unwrap()
            .to_u64()
            .unwrap();

        mer_amount
    }
}

// The bumps used to derive the vault account, vault's MER token account and LP mint account.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct VaultBumps {
    pub vault: u8,
    pub vault_mer: u8,
    pub lp_mint: u8,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stake_and_withdraw() {
        let mut vault = Vault {
            vault_mer: Pubkey::new_unique(),
            lp_mint: Pubkey::new_unique(),
            admin: Pubkey::new_unique(),
            bumps: VaultBumps { vault: 0, vault_mer: 0, lp_mint: 0 }
        };

        let mut lp_supply = 0;
        let mut total_mer = 0;
        let lp_token = vault.stake(0, 0, 1_000_000_000_000);
        lp_supply += lp_token;
        total_mer += 1_000_000_000_000;

        // Reward some 1 MER
        total_mer += 1_000_000;

        // Withdraw 10 ui amount lp tokens
        let amount = vault.withdraw(lp_supply, total_mer, 10_000_000);
        println!("{}", amount);
    }
}
