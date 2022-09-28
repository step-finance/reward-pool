//! Contains information, and state of vault account
use anchor_lang::prelude::*;

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
    /// Admin account
    pub admin: Pubkey,
    /// Token vault bump. Used to create signer seeds
    pub token_vault_bump: u8,
    /// The date when the token can be unlocked
    pub release_date: i64,
}

impl Vault {
    /// Return space for rental
    pub const fn space() -> usize {
        // Pubkey * 4 + u8 + i64
        32 * 4 + 1 + 8
    }
    /// Return whether locking period started
    pub fn started(&self) -> bool {
        self.release_date > 0
    }

    /// Return whether locking period ended
    pub fn ended(&self) -> Result<bool> {
        let current_time = Clock::get()?.unix_timestamp;
        Ok(current_time > self.release_date)
    }
}
