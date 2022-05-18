use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::vault::{LockedRewardTracker, Vault, LOCKED_REWARD_DEGRATION_DENUMERATOR};

pub mod vault;

declare_id!("FFkqjHsFZS3MaUELNrz4TMNo1pz5nE3sBShjuMiSy1Pz");

#[program]
mod staking {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>, vault_bump: u8) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.vault_bump = vault_bump;
        vault.token_mint = ctx.accounts.token_mint.key();
        vault.token_vault = ctx.accounts.token_vault.key();
        vault.lp_mint = ctx.accounts.lp_mint.key();
        vault.base = *ctx.accounts.base.key;
        vault.admin = *ctx.accounts.admin.key;
        vault.locked_reward_tracker = LockedRewardTracker::default();
        Ok(())
    }

    // transfer admin. Ex: to gorvernence
    pub fn transfer_admin(ctx: Context<TransferAdmin>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.admin = *ctx.accounts.new_admin.key;
        Ok(())
    }

    pub fn update_locked_reward_degradation(
        ctx: Context<UpdateLockedRewardDegradation>,
        locked_reward_degradation: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        if locked_reward_degradation > u64::try_from(LOCKED_REWARD_DEGRATION_DENUMERATOR).unwrap() {
            return Err(VaultError::InvalidLockedRewardDegradation.into());
        }
        vault.locked_reward_tracker.locked_reward_degradation = locked_reward_degradation;
        Ok(())
    }

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
        let seeds = &[
            b"vault".as_ref(),
            ctx.accounts.vault.token_mint.as_ref(),
            ctx.accounts.vault.base.as_ref(),
            &[ctx.accounts.vault.vault_bump],
        ];

        let signer = &[&seeds[..]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    to: ctx.accounts.user_lp.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
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

    pub fn unstake(ctx: Context<Stake>, unmint_amount: u64) -> Result<()> {
        // Cannot unstake 0 LP.
        if unmint_amount == 0 {
            return Err(VaultError::ZeroWithdrawAmount.into());
        }

        let current_time = u64::try_from(Clock::get()?.unix_timestamp)
            .ok()
            .ok_or(VaultError::MathOverflow)?;

        let withdraw_amount = ctx
            .accounts
            .vault
            .unstake(current_time, unmint_amount, ctx.accounts.lp_mint.supply)
            .ok_or(VaultError::MathOverflow)?;

        let seeds = &[
            b"vault".as_ref(),
            ctx.accounts.vault.token_mint.as_ref(),
            ctx.accounts.vault.base.as_ref(),
            &[ctx.accounts.vault.vault_bump],
        ];
        let signer = &[&seeds[..]];

        // Transfer Token from vault to user.
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
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

    pub fn change_funder(ctx: Context<FunderChange>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let funder = *ctx.accounts.funder.key;
        vault.funder = funder;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        seeds = [b"vault".as_ref(), token_mint.key().as_ref(), base.key().as_ref()],
        bump,
        payer = admin,
        space = 500, // exceed space for buffer
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub base: Signer<'info>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        init,
        seeds = [b"token_vault", vault.key().as_ref()],
        bump,
        payer = admin,
        token::mint = token_mint,
        token::authority = vault,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        seeds = [b"lp_mint", vault.key().as_ref()],
        bump,
        payer = admin,
        mint::decimals = token_mint.decimals,
        mint::authority = vault,
    )]
    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,

    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(
        mut,
        has_one = token_vault,
        has_one = lp_mint,
    )]
    pub vault: Box<Account<'info, Vault>>,

    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_lp: Account<'info, TokenAccount>,

    pub user_transfer_authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// This function exists for convenience and does not provide anything more than a token transfer
#[derive(Accounts)]
pub struct Reward<'info> {
    #[account(
        mut,
        has_one = token_vault,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,
    #[account(
    //require signed funder auth - otherwise constant micro fund could hold funds hostage
    constraint = user_transfer_authority.key() == vault.admin || user_transfer_authority.key() == vault.funder,
    )]
    pub user_transfer_authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateLockedRewardDegradation<'info> {
    #[account(mut, has_one = admin)]
    pub vault: Box<Account<'info, Vault>>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(mut, has_one = admin)]
    pub vault: Box<Account<'info, Vault>>,
    pub admin: Signer<'info>,
    /// CHECK: New vault admin
    #[account(constraint = new_admin.key() != admin.key())]
    pub new_admin: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct FunderChange<'info> {
    #[account(
        mut,
        has_one = admin,
    )]
    pub vault: Box<Account<'info, Vault>>,
    pub admin: Signer<'info>,
    #[account(constraint = funder.key() != vault.funder.key())]
    /// CHECK funder
    pub funder: AccountInfo<'info>
}

#[error_code]
pub enum VaultError {
    #[msg("Stake amount cannot be zero")]
    ZeroStakeAmount,
    #[msg("Reward amount cannot be zero")]
    ZeroRewardAmount,
    #[msg("Withdraw amount cannot be zero")]
    ZeroWithdrawAmount,
    #[msg("Math operation overflow")]
    MathOverflow,
    #[msg("LockedRewardDegradation is invalid")]
    InvalidLockedRewardDegradation,
    #[msg("Provided funder is already authorized to fund.")]
    FunderAlreadyAuthorized,
}

#[event]
pub struct EventStake {
    pub mint_amount: u64,
    pub token_amount: u64,
}

#[event]
pub struct EventUnStake {
    pub unmint_amount: u64,
    pub token_amount: u64,
}
