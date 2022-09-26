//! Staking program
#![deny(rustdoc::all)]
#![allow(rustdoc::missing_doc_code_examples)]
#![warn(clippy::unwrap_used)]
#![warn(clippy::integer_arithmetic)]
#![warn(missing_docs)]
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::vault::{LockedRewardTracker, Vault, LOCKED_REWARD_DEGRADATION_DENOMINATOR};

pub mod vault;

declare_id!("DNTDdX18wZCfRWzB6auDDi8CqX3TQTLSZGd8LwTpusNL");

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
        vault.locked_reward_tracker = LockedRewardTracker::default();
        Ok(())
    }

    /// Transfer vault admin. Ex: to governance
    pub fn transfer_admin(ctx: Context<TransferAdmin>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.admin = *ctx.accounts.new_admin.key;
        Ok(())
    }

    /// Update locked reward degradation. This affect the time window for profit dripping.
    pub fn update_locked_reward_degradation(
        ctx: Context<UpdateLockedRewardDegradation>,
        locked_reward_degradation: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        if locked_reward_degradation > u64::try_from(LOCKED_REWARD_DEGRADATION_DENOMINATOR).unwrap()
        {
            return Err(VaultError::InvalidLockedRewardDegradation.into());
        }
        vault.locked_reward_tracker.locked_reward_degradation = locked_reward_degradation;
        Ok(())
    }

    /// User stake token to the vault
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        // Cannot stake 0 token.
        if amount == 0 {
            return Err(VaultError::ZeroStakeAmount.into());
        };
        let current_time = u64::try_from(Clock::get()?.unix_timestamp)
            .ok()
            .ok_or(VaultError::MathOverflow)?;

        // Update Token to be transferred and LP to be minted.
        let mint_amount = ctx
            .accounts
            .vault
            .stake(current_time, amount, ctx.accounts.lp_mint.supply)
            .ok_or(VaultError::MathOverflow)?;

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

        // Mint corresponding amount of LP to user.
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
            mint_amount,
        )?;

        emit!(EventStake {
            mint_amount,
            token_amount: amount,
        });

        Ok(())
    }

    /// Authorized funder, and admin deposit fund to the vault
    pub fn reward(ctx: Context<Reward>, amount: u64) -> Result<()> {
        // Cannot reward 0 Token.
        if amount == 0 {
            return Err(VaultError::ZeroRewardAmount.into());
        }
        let current_time = u64::try_from(Clock::get()?.unix_timestamp)
            .ok()
            .ok_or(VaultError::MathOverflow)?;
        let vault = &mut ctx.accounts.vault;
        vault
            .update_locked_reward(current_time, amount)
            .ok_or(VaultError::MathOverflow)?;

        // Transfer Token to vault.
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

        Ok(())
    }

    /// User unstake LP
    pub fn unstake(ctx: Context<Stake>, unmint_amount: u64) -> Result<()> {
        // Cannot unstake 0 LP.
        if unmint_amount == 0 {
            return Err(VaultError::ZeroWithdrawAmount.into());
        }

        // Return InsufficientLpAmount if user input unmint_amount > lp_mint.supply, which leads to MathOverflow (misleading)
        if unmint_amount > ctx.accounts.user_lp.amount {
            return Err(VaultError::InsufficientLpAmount.into());
        }

        let current_time = u64::try_from(Clock::get()?.unix_timestamp)
            .ok()
            .ok_or(VaultError::MathOverflow)?;

        let withdraw_amount = ctx
            .accounts
            .vault
            .unstake(current_time, unmint_amount, ctx.accounts.lp_mint.supply)
            .ok_or(VaultError::MathOverflow)?;

        let vault_pubkey = ctx.accounts.vault.key();
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
            withdraw_amount,
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
            unmint_amount,
        )?;

        emit!(EventUnStake {
            unmint_amount,
            token_amount: withdraw_amount,
        });

        Ok(())
    }

    /// Change vault funder. Funder can deposit fund to the vault.
    pub fn change_funder(ctx: Context<FunderChange>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let funder = *ctx.accounts.funder.key;
        vault.funder = funder;
        Ok(())
    }
}

/// Accounts for [InitializeVault](/staking/instruction/struct.InitializeVault.html) instruction
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    /// Vault account. A PDA.
    #[account(
        init,
        payer = admin,
        space = 500, // exceed space for buffer
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

/// Accounts for [Stake](/staking/instruction/struct.Stake.html) instruction
#[derive(Accounts)]
pub struct Stake<'info> {
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

/// Accounts for [Reward](/staking/instruction/struct.Reward.html) instruction
// This function exists for convenience and does not provide anything more than a token transfer
#[derive(Accounts)]
pub struct Reward<'info> {
    #[account(
        mut,
        has_one = token_vault,
    )]
    /// Vault account. A PDA.
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    /// Token account of the vault. A PDA.
    pub token_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    /// Funder/admin token account. Token will be transferred from this account to the token_vault upon funding.
    pub user_token: Account<'info, TokenAccount>,

    #[account(
    //require signed funder auth - otherwise constant micro fund could hold funds hostage
    constraint = user_transfer_authority.key() == vault.admin || user_transfer_authority.key() == vault.funder,
    )]
    /// Admin/funder account. Signer.
    pub user_transfer_authority: Signer<'info>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Accounts for [UpdateLockedRewardDegradation](/staking/instruction/struct.UpdateLockedRewardDegradation.html) instruction
#[derive(Accounts)]
pub struct UpdateLockedRewardDegradation<'info> {
    #[account(mut, has_one = admin)]
    /// Vault account. A PDA.
    pub vault: Box<Account<'info, Vault>>,
    /// Admin account. Signer.
    pub admin: Signer<'info>,
}

/// Accounts for [TransferAdmin](/staking/instruction/struct.TransferAdmin.html) instruction
#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(mut, has_one = admin)]
    /// Vault account. A PDA.
    pub vault: Box<Account<'info, Vault>>,
    /// Admin account. Signer.
    pub admin: Signer<'info>,
    /// New admin account. Signer.
    #[account(constraint = new_admin.key() != admin.key())]
    pub new_admin: Signer<'info>,
}

/// Accounts for [TransferAdmin](/staking/instruction/struct.TransferAdmin.html) instruction
#[derive(Accounts)]
pub struct FunderChange<'info> {
    #[account(
        mut,
        has_one = admin,
    )]
    /// Vault account. A PDA.
    pub vault: Box<Account<'info, Vault>>,
    /// Admin account. Signer.
    pub admin: Signer<'info>,
    #[account(constraint = funder.key() != vault.funder.key())]
    /// CHECK: Funder account.
    pub funder: UncheckedAccount<'info>,
}

/// Contains error code from the program
#[error_code]
pub enum VaultError {
    #[msg("Stake amount cannot be zero")]
    /// Stake amount cannot be zero
    ZeroStakeAmount,
    #[msg("Reward amount cannot be zero")]
    /// Reward amount cannot be zero
    ZeroRewardAmount,
    #[msg("Withdraw amount cannot be zero")]
    /// Withdraw amount cannot be zero
    ZeroWithdrawAmount,
    #[msg("Math operation overflow")]
    /// Math operation results in overflow
    MathOverflow,
    #[msg("LockedRewardDegradation is invalid")]
    /// Invalid locked reward degradation
    InvalidLockedRewardDegradation,
    #[msg("Provided funder is already authorized to fund")]
    /// Provided funder is already authorized to fund
    FunderAlreadyAuthorized,
    /// Insufficient lp amount
    #[msg("Insufficient lp amount")]
    InsufficientLpAmount,
}

/// Event stake
#[event]
pub struct EventStake {
    /// Amount of LP minted
    pub mint_amount: u64,
    /// Amount of token deposited
    pub token_amount: u64,
}

/// Event unstake
#[event]
pub struct EventUnStake {
    /// Amount of LP burned
    pub unmint_amount: u64,
    /// Amount of token received
    pub token_amount: u64,
}
