//! Staking program
#![deny(rustdoc::all)]
#![allow(rustdoc::missing_doc_code_examples)]
#![warn(clippy::unwrap_used)]
#![warn(clippy::integer_arithmetic)]
#![warn(missing_docs)]

use crate::context::*;

use crate::error::ErrorCode;
use crate::utils::rate_by_funding;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock;
use anchor_spl::token;
use std::convert::Into;
use std::convert::TryInto;

/// Export for context implementation
pub mod context;
/// Define error code
pub mod error;
/// Export for pool implementation
pub mod state;
/// Export for utils implementation
pub mod utils;

declare_id!("StakhsBRrXhafhcBUpMmQuippk1JrQuAk6GXuknBCxW");

/// Single farming program
#[program]
pub mod staking {
    use super::*;

    /// Initializes a new pool
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        jup_reward_duration: u64,
        jup_funding_amount: u64,
        xmer_reward_duration: u64,
    ) -> Result<()> {
        if jup_reward_duration == 0 {
            return Err(ErrorCode::JupDurationCannotBeZero.into());
        }

        let pool = &mut ctx.accounts.pool;
        // This is safe as long as the key matched the account in InitializePool context
        pool.staking_vault_nonce = *ctx.bumps.get("staking_vault").unwrap();
        pool.staking_mint = ctx.accounts.staking_mint.key();
        pool.staking_vault = ctx.accounts.staking_vault.key();

        // update jup  info
        pool.jup_reward_duration = jup_reward_duration;
        pool.total_staked = 0;
        pool.jup_last_update_time = 0;
        pool.jup_reward_end_timestamp = 0;
        pool.admin = ctx.accounts.admin.key();
        pool.jup_reward_rate = rate_by_funding(jup_funding_amount, jup_reward_duration)
            .ok_or(ErrorCode::MathOverFlow)?;
        pool.jup_reward_per_token_stored = 0;

        // update xmer info
        pool.xmer_reward_duration = xmer_reward_duration;
        pool.xmer_reward_mint = ctx.accounts.xmer_reward_mint.key();
        pool.xmer_reward_vault = ctx.accounts.xmer_reward_vault.key();
        pool.xmer_last_update_time = 0;
        pool.xmer_reward_end_timestamp = 0;
        pool.xmer_reward_per_token_stored = 0;
        Ok(())
    }

    /// Admin activates jup farming
    pub fn activate_jup_farming<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, ActivateJupFarming<'info>>,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let current_time = clock::Clock::get()
            .unwrap()
            .unix_timestamp
            .try_into()
            .unwrap();
        pool.jup_last_update_time = current_time;
        pool.jup_reward_end_timestamp = current_time
            .checked_add(pool.jup_reward_duration)
            .ok_or(ErrorCode::MathOverFlow)?;
        Ok(())
    }

    /// Admin set jup information, that will be done after TGE
    pub fn set_jup_information<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, SetJupInformation<'info>>,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.jup_reward_mint = ctx.accounts.jup_reward_mint.key();
        pool.jup_reward_vault = ctx.accounts.jup_reward_vault.key();
        // enable jup information
        pool.is_jup_info_enable = 1; // any number without zero
        Ok(())
    }

    /// Authorize additional funders for the pool
    pub fn authorize_funder(ctx: Context<FunderChange>, funder_to_add: Pubkey) -> Result<()> {
        if funder_to_add == ctx.accounts.pool.admin.key() {
            return Err(ErrorCode::FunderAlreadyAuthorized.into());
        }
        let funders = &mut ctx.accounts.pool.funders;
        if funders.iter().any(|x| *x == funder_to_add) {
            return Err(ErrorCode::FunderAlreadyAuthorized.into());
        }
        let default_pubkey = Pubkey::default();
        if let Some(idx) = funders.iter().position(|x| *x == default_pubkey) {
            funders[idx] = funder_to_add;
            emit!(EventAuthorizeFunder {
                new_funder: funder_to_add
            });
        } else {
            return Err(ErrorCode::MaxFunders.into());
        }
        Ok(())
    }

    /// Deauthorize funders for the pool
    pub fn deauthorize_funder(ctx: Context<FunderChange>, funder_to_remove: Pubkey) -> Result<()> {
        if funder_to_remove == ctx.accounts.pool.admin.key() {
            return Err(ErrorCode::CannotDeauthorizePoolAdmin.into());
        }
        let funders = &mut ctx.accounts.pool.funders;
        if let Some(idx) = funders.iter().position(|x| *x == funder_to_remove) {
            funders[idx] = Pubkey::default();
            emit!(EventUnauthorizeFunder {
                funder: funder_to_remove
            });
        } else {
            return Err(ErrorCode::CannotDeauthorizeMissingAuthority.into());
        }
        Ok(())
    }

    /// Fund the pool with xMER rewards.  This resets the clock on the end date, pushing it out to the set duration. And, linearly redistributes remaining rewards.
    pub fn fund_xmer(ctx: Context<FundXMer>, amount: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        pool.update_xmer_rewards(None).unwrap();

        let xmer_reward_rate = pool.xmer_rate_after_funding(amount)?;
        pool.xmer_reward_rate = xmer_reward_rate;

        // Transfer reward A tokens into the A vault.
        if amount > 0 {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.from_xmer.to_account_info(),
                    to: ctx.accounts.xmer_reward_vault.to_account_info(),
                    authority: ctx.accounts.funder.to_account_info(),
                },
            );

            token::transfer(cpi_ctx, amount)?;
        }

        let current_time = clock::Clock::get()
            .unwrap()
            .unix_timestamp
            .try_into()
            .unwrap();
        pool.xmer_last_update_time = current_time;
        pool.xmer_reward_end_timestamp =
            current_time.checked_add(pool.xmer_reward_duration).unwrap();

        emit!(EventFundXMer { amount });
        Ok(())
    }

    /// Fund the pool with JUP rewards.
    pub fn fund_jup(ctx: Context<FundJup>, amount: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        // only fund amount that we need to fund
        let actual_amount = pool.fund_jup(amount).ok_or(ErrorCode::MathOverFlow)?;

        if actual_amount > 0 {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.from_jup.to_account_info(),
                    to: ctx.accounts.jup_reward_vault.to_account_info(),
                    authority: ctx.accounts.funder.to_account_info(),
                },
            );

            token::transfer(cpi_ctx, actual_amount)?;
            emit!(EventFundJup {
                amount: actual_amount
            });
        } else {
            return Err(ErrorCode::JupIsFullyFunded.into());
        }

        Ok(())
    }

    /// Initialize a user staking account
    pub fn create_user<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, CreateUser<'info>>,
    ) -> Result<()> {
        let user = &mut ctx.accounts.user;
        user.pool = *ctx.accounts.pool.to_account_info().key;
        user.owner = *ctx.accounts.owner.key;
        user.jup_reward_per_token_complete = 0;
        user.total_jup_reward = 0;
        user.xmer_reward_per_token_complete = 0;
        user.xmer_reward_pending = 0;
        user.balance_staked = 0;
        user.nonce = *ctx.bumps.get("user").unwrap();
        Ok(())
    }

    /// A user deposit all tokens into the pool.
    pub fn deposit_full(ctx: Context<DepositOrWithdraw>) -> Result<()> {
        let full_amount = ctx.accounts.stake_from_account.amount;
        deposit(ctx, full_amount)
    }

    /// A user deposit tokens in the pool.
    pub fn deposit(ctx: Context<DepositOrWithdraw>, amount: u64) -> Result<()> {
        if amount == 0 {
            return Err(ErrorCode::AmountMustBeGreaterThanZero.into());
        }
        let pool = &mut ctx.accounts.pool;
        let user = &mut ctx.accounts.user;

        // update rewards for both jup and xMER
        pool.update_jup_rewards(user)?;
        pool.update_xmer_rewards(Some(user))?;

        ctx.accounts.user.balance_staked = ctx
            .accounts
            .user
            .balance_staked
            .checked_add(amount)
            .unwrap();

        // Transfer tokens into the stake vault.
        {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.stake_from_account.to_account_info(),
                    to: ctx.accounts.staking_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(), //todo use user account as signer
                },
            );
            token::transfer(cpi_ctx, amount)?;
            pool.total_staked = pool
                .total_staked
                .checked_add(amount)
                .ok_or(ErrorCode::MathOverFlow)?;
        }
        Ok(())
    }

    /// A user withdraw tokens in the pool.
    pub fn withdraw(ctx: Context<DepositOrWithdraw>, spt_amount: u64) -> Result<()> {
        if spt_amount == 0 {
            return Err(ErrorCode::AmountMustBeGreaterThanZero.into());
        }

        let pool = &mut ctx.accounts.pool;

        if ctx.accounts.user.balance_staked < spt_amount {
            return Err(ErrorCode::InsufficientFundUnstake.into());
        }

        let user = &mut ctx.accounts.user;
        pool.update_jup_rewards(user)?;
        pool.update_xmer_rewards(Some(user))?;
        ctx.accounts.user.balance_staked = ctx
            .accounts
            .user
            .balance_staked
            .checked_sub(spt_amount)
            .ok_or(ErrorCode::CannotUnstakeMoreThanBalance)?;

        // Transfer tokens from the pool vault to user vault.
        {
            let pool_key = pool.key();

            let seeds = &[
                b"staking_vault".as_ref(),
                pool_key.as_ref(),
                &[pool.staking_vault_nonce],
            ];
            let pool_signer = &[&seeds[..]];

            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.staking_vault.to_account_info(),
                    to: ctx.accounts.stake_from_account.to_account_info(),
                    authority: ctx.accounts.staking_vault.to_account_info(),
                },
                pool_signer,
            );
            token::transfer(cpi_ctx, spt_amount)?;
            pool.total_staked = pool
                .total_staked
                .checked_sub(spt_amount)
                .ok_or(ErrorCode::MathOverFlow)?;
        }

        Ok(())
    }

    /// A user claiming xmer
    pub fn claim_xmer(ctx: Context<ClaimXMerReward>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let user = &mut ctx.accounts.user;
        pool.update_jup_rewards(user)?;
        pool.update_xmer_rewards(Some(user))?;

        // emit pending reward
        emit!(EventPendingXMerReward {
            value: ctx.accounts.user.xmer_reward_pending,
        });
        if ctx.accounts.user.xmer_reward_pending > 0 {
            let xmer_reward_pending = ctx.accounts.user.xmer_reward_pending;
            let vault_balance = ctx.accounts.xmer_reward_vault.amount;

            // probably precision loss issue, so we send user max balance the vault has
            let reward_amount = if vault_balance < xmer_reward_pending {
                vault_balance
            } else {
                xmer_reward_pending
            };
            if reward_amount > 0 {
                // update xmer reward pending
                ctx.accounts.user.xmer_reward_pending = 0;

                let pool_key = pool.key();
                let seeds = &[
                    b"staking_vault".as_ref(),
                    pool_key.as_ref(),
                    &[pool.staking_vault_nonce],
                ];
                let pool_signer = &[&seeds[..]];
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    token::Transfer {
                        from: ctx.accounts.xmer_reward_vault.to_account_info(),
                        to: ctx.accounts.xmer_reward_account.to_account_info(),
                        authority: ctx.accounts.staking_vault.to_account_info(),
                    },
                    pool_signer,
                );
                token::transfer(cpi_ctx, reward_amount)?;
                emit!(EventClaimXMerReward {
                    value: reward_amount,
                });
            }
        }
        Ok(())
    }

    /// A user claiming xmer
    pub fn claim_jup(ctx: Context<ClaimJupReward>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let user = &mut ctx.accounts.user;
        pool.update_jup_rewards(user)?;

        let claimable_amount = pool
            .calculate_claimable_jup_for_an_user(user.total_jup_reward, user.jup_reward_harvested)
            .ok_or(ErrorCode::MathOverFlow)?;

        // emit pending reward
        emit!(EventPendingJupReward {
            pending_amount: user.total_jup_reward,
            claimable_amount: claimable_amount,
        });
        if claimable_amount > 0 {
            // update jup reward harvested
            ctx.accounts.user.jup_reward_harvested = user
                .jup_reward_harvested
                .checked_add(claimable_amount)
                .ok_or(ErrorCode::MathOverFlow)?;

            let pool_key = pool.key();
            let seeds = &[
                b"staking_vault".as_ref(),
                pool_key.as_ref(),
                &[pool.staking_vault_nonce],
            ];
            let pool_signer = &[&seeds[..]];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.jup_reward_vault.to_account_info(),
                    to: ctx.accounts.jup_reward_account.to_account_info(),
                    authority: ctx.accounts.staking_vault.to_account_info(),
                },
                pool_signer,
            );
            token::transfer(cpi_ctx, claimable_amount)?;
        }

        Ok(())
    }

    /// Function allows FE to simulate and get user information
    pub fn get_user_info(ctx: Context<GetUserInfo>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let user = &mut ctx.accounts.user;
        pool.update_jup_rewards(user)?;
        pool.update_xmer_rewards(Some(user))?;
        // emit pending reward
        emit!(EventUserReward {
            xmer_pending: ctx.accounts.user.xmer_reward_pending,
            total_jup_reward: ctx.accounts.user.total_jup_reward,
            total_jup_harvested: ctx.accounts.user.jup_reward_harvested,
        });
        Ok(())
    }

    /// Closes a users stake account. Validation is done to ensure this is only allowed when
    /// the user has nothing staked and no rewards pending.
    pub fn close_user(_ctx: Context<CloseUser>) -> Result<()> {
        Ok(())
    }
}

/// EventPendingReward
#[event]
pub struct EventPendingXMerReward {
    /// Pending xMer reward amount
    pub value: u64,
}

/// EventPendingReward
#[event]
pub struct EventPendingJupReward {
    /// Claimable Jup reward amount
    pub claimable_amount: u64,
    /// Pending Jup reward amount
    pub pending_amount: u64,
}

/// EventClaimXMerReward
#[event]
pub struct EventClaimXMerReward {
    /// Claim reward amount
    pub value: u64,
}

/// EventClaimJupReward
#[event]
pub struct EventClaimJupReward {
    /// Claim reward amount
    pub value: u64,
}

/// Authorized funder event
#[event]
pub struct EventAuthorizeFunder {
    new_funder: Pubkey,
}

/// Un-authorized funder event
#[event]
pub struct EventUnauthorizeFunder {
    funder: Pubkey,
}

/// XMer Fund event
#[event]
pub struct EventFundXMer {
    amount: u64,
}

/// Jup Fund event
#[event]
pub struct EventFundJup {
    amount: u64,
}

/// User info event
#[event]
pub struct EventUserReward {
    xmer_pending: u64,
    total_jup_reward: u64,
    total_jup_harvested: u64,
}
