use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Burn, Mint, MintTo, TokenAccount, Transfer};

use crate::vault::{Vault, VaultBumps};

pub mod vault;

#[cfg(feature = "devnet")]
declare_id!("CBbYHhjfhFoPwz8ZgQJjHkpq2gSu1xn26qeVsfYhWWB5");

#[cfg(not(feature = "devnet"))]
declare_id!("8SCN9inXVM8RwkS1zao5gcTfZhJuyRLW3hynsQ3bgaWT");

#[program]
mod mer_staking {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        bumps: VaultBumps,
    ) ->  Result<()> {
        let vault = &mut ctx.accounts.vault;

        vault.bumps = bumps;
        vault.vault_mer = ctx.accounts.vault_mer.key();
        vault.lp_mint = ctx.accounts.lp_mint.key();
        vault.admin = *ctx.accounts.admin.key;

        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        // Cannot stake 0 MER.
        if amount == 0 {
            return Err(VaultError::ZeroStakeAmount.into());
        };

        let vault_mer_amount = ctx.accounts.vault_mer.amount;

        // Update MER to be transferred and LP to be minted.
        let lp_mint_amount = ctx.accounts.vault.stake(
            ctx.accounts.lp_mint.supply,
            vault_mer_amount,
            amount,
        );

        // Transfer MER from user to vault.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_mer.to_account_info(),
                    to: ctx.accounts.vault_mer.to_account_info(),
                    authority: ctx.accounts.user_transfer_authority.to_account_info(),
                },
            ),
            amount,
        )?;

        // Mint corresponding amount of LP to user.
        let seeds = &[b"vault".as_ref(), &[ctx.accounts.vault.bumps.vault]];
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
            lp_mint_amount,
        )?;

        Ok(())
    }

    pub fn reward(ctx: Context<Reward>, amount: u64) -> Result<()> {
        // Cannot reward 0 MER.
        if amount == 0 {
            return Err(VaultError::ZeroRewardAmount.into());
        }

        // Transfer MER to vault.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_mer.to_account_info(),
                    to: ctx.accounts.vault_mer.to_account_info(),
                    authority: ctx.accounts.user_transfer_authority.to_account_info(),
                },
            ),
            amount,
        )?;

        Ok(())
    }

    pub fn unstake(ctx: Context<Unstake>, lp_burn_amount: u64) -> Result<()> {
        // Cannot unstake 0 LP.
        if lp_burn_amount == 0 {
            return Err(VaultError::ZeroWithdrawAmount.into());
        }

        let vault_mer_amount = ctx.accounts.vault_mer.amount;

        let mer_withdraw_amount = ctx.accounts.vault.withdraw(
            ctx.accounts.lp_mint.supply,
            vault_mer_amount,
            lp_burn_amount,
        );

        let seeds = &[b"vault".as_ref(), &[ctx.accounts.vault.bumps.vault]];
        let signer = &[&seeds[..]];

        // Transfer MER from vault to user.
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_mer.to_account_info(),
                    to: ctx.accounts.user_mer.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            mer_withdraw_amount,
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
            lp_burn_amount,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(bumps: VaultBumps)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        seeds = [b"vault".as_ref()],
        bump,
        payer = admin,
        space = 200, //8 + 32 + 32 + 32 + 3 + buffer
    )]
    pub vault: Account<'info, Vault>,

    pub mer_mint: Account<'info, Mint>,

    #[account(
        init,
        seeds = [b"vault_mer", vault.key().as_ref()],
        bump,
        payer = admin,
        token::mint = mer_mint,
        token::authority = vault,
    )]
    pub vault_mer: Account<'info, TokenAccount>,

    #[account(
        init,
        seeds = [b"lp_mint", vault.key().as_ref()],
        bump,
        payer = admin,
        mint::decimals = mer_mint.decimals,
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
        has_one = vault_mer,
        has_one = lp_mint,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub vault_mer: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_mer: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_lp: Account<'info, TokenAccount>,

    pub user_transfer_authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// This function exists for convenience and does not provide anything more than a token transfer
#[derive(Accounts)]
pub struct Reward<'info> {
    #[account(
        has_one = vault_mer,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub vault_mer: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_mer: Account<'info, TokenAccount>,

    pub user_transfer_authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(
        mut,
        has_one = vault_mer,
        has_one = lp_mint,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub vault_mer: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_mer: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_lp: Account<'info, TokenAccount>,

    pub user_transfer_authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum VaultError {
    #[msg("Stake amount cannot be zero")]
    ZeroStakeAmount,
    #[msg("Reward amount cannot be zero")]
    ZeroRewardAmount,
    #[msg("Withdraw amount cannot be zero")]
    ZeroWithdrawAmount,
}
