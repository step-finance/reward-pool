//! Staking program
#![deny(rustdoc::all)]
#![allow(rustdoc::missing_doc_code_examples)]
#![warn(clippy::unwrap_used)]
#![warn(clippy::integer_arithmetic)]
#![warn(missing_docs)]
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::vault::Vault;

pub mod vault;

declare_id!("DNTDdX18wZCfRWzB6auDDi8CqX3TQTLSZGd8LwTpusNL");

const ELEVEN_MONTHS: i64 = 86400 * 30 * 11;
const THIRTEEN_MONTHS: i64 = 86400 * 30 * 13;
const EXTRA_SPACE: usize = 100;

#[cfg(not(feature = "devnet"))]
fn within_boundary(release_date: i64) -> Option<bool> {
    let current_time = Clock::get().ok()?.unix_timestamp;
    let lower_bound = current_time.checked_add(ELEVEN_MONTHS)?;
    let upper_bound = current_time.checked_add(THIRTEEN_MONTHS)?;
    Some(release_date > lower_bound && release_date < upper_bound)
}

#[cfg(feature = "devnet")]
fn within_boundary(release_date: i64) -> Option<bool> {
    Some(true)
}

/// Staking program
#[program]
mod locking {
    use super::*;

    /// Initialize a new vault.
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.token_vault_bump = *ctx.bumps.get("token_vault").unwrap();
        vault.token_mint = ctx.accounts.token_mint.key();
        vault.token_vault = ctx.accounts.token_vault.key();
        vault.lp_mint = ctx.accounts.lp_mint.key();
        vault.admin = *ctx.accounts.admin.key;
        Ok(())
    }

    /// Admin set locking end date
    pub fn set_release_date(ctx: Context<SetReleaseDate>, release_date: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let release_date: i64 = release_date
            .try_into()
            .map_err(|_| VaultError::MathOverflow)?;
        // 1 month +/- from 1 year
        if within_boundary(release_date).ok_or(VaultError::MathOverflow)? {
            vault.release_date = release_date;
        } else {
            return Err(VaultError::InvalidReleaseDate.into());
        }
        Ok(())
    }

    /// User lock token to the vault
    pub fn lock(ctx: Context<Lock>, amount: u64) -> Result<()> {
        // Cannot lock 0 token.
        if amount == 0 {
            return Err(VaultError::ZeroLockAmount.into());
        };

        // Transfer Token from user to vault.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token.to_account_info(),
                    to: ctx.accounts.token_vault.to_account_info(),
                    authority: ctx.accounts.user_transfer_authority.to_account_info(),
                },
            ),
            amount,
        )?;

        // Mint corresponding amount of xToken to user.
        let vault_pubkey = ctx.accounts.vault.key();
        let seeds = &[
            b"token_vault".as_ref(),
            vault_pubkey.as_ref(),
            &[ctx.accounts.vault.token_vault_bump],
        ];

        let signer = &[&seeds[..]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    to: ctx.accounts.user_lp.to_account_info(),
                    authority: ctx.accounts.token_vault.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        emit!(EventLock { amount });

        Ok(())
    }

    /// User unlock xToken
    pub fn unlock(ctx: Context<Lock>, unlock_amount: u64) -> Result<()> {
        let vault = &ctx.accounts.vault;
        if vault.started() && !vault.ended()? {
            return Err(VaultError::LockingStarted.into());
        }
        // Cannot unlock 0 xToken.
        if unlock_amount == 0 {
            return Err(VaultError::ZeroWithdrawAmount.into());
        }

        if unlock_amount > ctx.accounts.user_lp.amount {
            return Err(VaultError::InsufficientLpAmount.into());
        }

        let vault_pubkey = vault.key();
        let seeds = &[
            b"token_vault".as_ref(),
            vault_pubkey.as_ref(),
            &[ctx.accounts.vault.token_vault_bump],
        ];
        let signer = &[&seeds[..]];

        // Transfer Token from vault to user.
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.token_vault.to_account_info(),
                },
                signer,
            ),
            unlock_amount,
        )?;

        // Burn corresponding amount of LP from user.
        token::burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    from: ctx.accounts.user_lp.to_account_info(),
                    authority: ctx.accounts.user_transfer_authority.to_account_info(),
                },
                signer,
            ),
            unlock_amount,
        )?;

        emit!(EventUnlock {
            amount: unlock_amount
        });

        Ok(())
    }
}

/// Accounts for [InitializeVault](/locking/instruction/struct.InitializeVault.html) instruction
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    /// Vault account. A PDA.
    #[account(
        init,
        payer = admin,
        space = Vault::space() + EXTRA_SPACE
    )]
    pub vault: Account<'info, Vault>,

    /// Mint account of the vault.
    pub token_mint: Account<'info, Mint>,

    #[account(
        init,
        seeds = [b"token_vault", vault.key().as_ref()],
        bump,
        payer = admin,
        token::mint = token_mint,
        token::authority = token_vault,
    )]
    /// Token account of the vault. A PDA.
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        seeds = [b"lp_mint", vault.key().as_ref()],
        bump,
        payer = admin,
        mint::decimals = token_mint.decimals,
        mint::authority = token_vault,
    )]
    /// LP mint account of the vault. A PDA.
    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    /// Admin account. Signer.
    pub admin: Signer<'info>,

    /// Token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,

    /// Rent account
    pub rent: Sysvar<'info, Rent>,
}

/// Accounts for [Lock](/locking/instruction/struct.Lock.html) instruction
#[derive(Accounts)]
pub struct Lock<'info> {
    #[account(
        mut,
        has_one = token_vault,
        has_one = lp_mint,
    )]
    /// Vault account. A PDA.
    pub vault: Box<Account<'info, Vault>>,

    #[account(mut)]
    /// Token account of the vault. A PDA.
    pub token_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    /// LP mint account of the vault. A PDA.
    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    /// User token account. Token will be transferred from this account to the token_vault upon stake.
    pub user_token: Account<'info, TokenAccount>,

    #[account(mut)]
    /// User LP token account. Represent user share in the vault.
    pub user_lp: Account<'info, TokenAccount>,

    /// User account. Signer.
    pub user_transfer_authority: Signer<'info>,

    /// Token program.
    pub token_program: Program<'info, Token>,
}

/// Accounts for [SetReleaseDate](/locking/instruction/struct.SetReleaseDate.html) instruction

#[derive(Accounts)]
pub struct SetReleaseDate<'info> {
    #[account(
        mut,
        has_one = admin,
        constraint = !vault.started() @ VaultError::LockingStarted,
    )]
    /// Vault account. A PDA.
    pub vault: Box<Account<'info, Vault>>,

    /// Admin account. Signer.
    pub admin: Signer<'info>,
}

/// Contains error code from the program
#[error_code]
pub enum VaultError {
    #[msg("Lock amount cannot be zero")]
    /// Lock amount cannot be zero
    ZeroLockAmount,
    #[msg("Withdraw amount cannot be zero")]
    /// Withdraw amount cannot be zero
    ZeroWithdrawAmount,
    #[msg("Math operation overflow")]
    /// Math operation results in overflow
    MathOverflow,
    /// Insufficient lp amount
    #[msg("Insufficient lp amount")]
    InsufficientLpAmount,
    /// Locking started
    #[msg("Locking has begin")]
    LockingStarted,
    /// Invalid release date
    #[msg("Invalid release date")]
    InvalidReleaseDate,
}

/// Event lock
#[event]
pub struct EventLock {
    pub amount: u64,
}

/// Event unlock
#[event]
pub struct EventUnlock {
    pub amount: u64,
}
