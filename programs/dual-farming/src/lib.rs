//! Dual farming program
#![deny(rustdoc::all)]
#![allow(rustdoc::missing_doc_code_examples)]
#![warn(clippy::unwrap_used)]
#![warn(clippy::integer_arithmetic)]
#![warn(missing_docs)]

use std::convert::Into;
use std::convert::TryInto;
use std::fmt::Debug;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{clock, sysvar};
use anchor_spl::token::{self, Mint, Token, TokenAccount};

use crate::constants::*;
use crate::pool::*;

/// Export for pool implementation
pub mod pool;

declare_id!("AXFHikQNKk2zgiss9USaUVccLt4TSqmXBLEkZZ6GhojH");

#[cfg(not(feature = "dev"))]
mod constants {
    pub const MIN_DURATION: u64 = 86400;
}

#[cfg(feature = "dev")]
mod constants {
    pub const MIN_DURATION: u64 = 1;
}

const PRECISION: u128 = u64::MAX as u128;

/// Updates the pool with the total reward per token that is due stakers
/// Using the calculator specific to that pool version which uses the reward
/// rate on the pool.
/// Optionally updates user with pending rewards and "complete" rewards.
/// A new user to the pool has their completed set to current amount due
/// such that they start earning from that point. Hence "complete" is a
/// bit misleading - it does not mean actually earned.
pub fn update_rewards(
    pool: &mut Box<Account<Pool>>,
    user: Option<&mut Box<Account<User>>>,
    total_staked: u64,
) -> Result<()> {
    let last_time_reward_applicable = last_time_reward_applicable(pool.reward_duration_end);

    let (reward_a, reward_b) = reward_per_token(pool, total_staked, last_time_reward_applicable);

    pool.reward_a_per_token_stored = reward_a;
    if pool.reward_a_vault != pool.reward_b_vault {
        pool.reward_b_per_token_stored = reward_b;
    }

    pool.last_update_time = last_time_reward_applicable;

    if let Some(u) = user {
        let (a, b) = user_earned_amount(pool, u);

        u.reward_a_per_token_pending = a;
        u.reward_a_per_token_complete = pool.reward_a_per_token_stored;

        u.reward_b_per_token_pending = b;
        u.reward_b_per_token_complete = pool.reward_b_per_token_stored;
    }

    Ok(())
}

/// The min of current time and reward duration end, such that after the pool reward
/// period ends, this always returns the pool end time
fn last_time_reward_applicable(reward_duration_end: u64) -> u64 {
    let c = clock::Clock::get().unwrap();
    std::cmp::min(c.unix_timestamp.try_into().unwrap(), reward_duration_end)
}

/// Dual farming program
#[program]
pub mod dual_farming {
    use super::*;

    /// Initializes a new pool. Able to create pool with single reward by passing the same Mint account for reward_a_mint and reward_a_mint
    pub fn initialize_pool(ctx: Context<InitializePool>, reward_duration: u64) -> Result<()> {
        if reward_duration < MIN_DURATION {
            return Err(ErrorCode::DurationTooShort.into());
        }
        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.paused = false;
        pool.staking_mint = ctx.accounts.staking_mint.key();
        pool.staking_vault = ctx.accounts.staking_vault.key();
        pool.reward_a_mint = ctx.accounts.reward_a_mint.key();
        pool.reward_a_vault = ctx.accounts.reward_a_vault.key();
        pool.reward_b_mint = ctx.accounts.reward_b_mint.key();
        pool.reward_b_vault = ctx.accounts.reward_b_vault.key();
        pool.reward_duration = reward_duration;
        pool.total_staked = 0;
        pool.reward_duration_end = 0;
        pool.last_update_time = 0;
        pool.reward_a_rate = 0;
        pool.reward_b_rate = 0;
        pool.reward_a_per_token_stored = 0;
        pool.reward_b_per_token_stored = 0;
        pool.user_stake_count = 0;
        pool.base_key = ctx.accounts.base.key();
        // Unwrap here is safe as long as the key matches the account in the context
        pool.pool_bump = *ctx.bumps.get("pool").unwrap();
        Ok(())
    }

    /// Initialize a user staking account
    pub fn create_user(ctx: Context<CreateUser>) -> Result<()> {
        let user = &mut ctx.accounts.user;
        user.pool = *ctx.accounts.pool.to_account_info().key;
        user.owner = *ctx.accounts.owner.key;
        user.reward_a_per_token_complete = 0;
        user.reward_b_per_token_complete = 0;
        user.reward_a_per_token_pending = 0;
        user.reward_b_per_token_pending = 0;
        user.balance_staked = 0;
        user.nonce = *ctx.bumps.get("user").unwrap();

        let pool = &mut ctx.accounts.pool;
        pool.user_stake_count = pool.user_stake_count.checked_add(1).unwrap();
        Ok(())
    }

    /// Pause the pool
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.paused = true;

        Ok(())
    }

    /// Unpauses a previously paused pool. Allowing for funding.
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.paused = false;
        Ok(())
    }

    /// User deposit tokens in the pool.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        if amount == 0 {
            return Err(ErrorCode::AmountMustBeGreaterThanZero.into());
        }
        let pool = &mut ctx.accounts.pool;
        if pool.paused {
            return Err(ErrorCode::PoolPaused.into());
        }
        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(pool, user_opt, pool.total_staked).unwrap();

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
                .ok_or(ErrorCode::MathOverflow)?;
            emit!(EventDeposit { amount });
        }
        Ok(())
    }

    /// User withdraw tokens in the pool.
    pub fn withdraw(ctx: Context<Deposit>, spt_amount: u64) -> Result<()> {
        if spt_amount == 0 {
            return Err(ErrorCode::AmountMustBeGreaterThanZero.into());
        }

        let pool = &mut ctx.accounts.pool;

        if ctx.accounts.user.balance_staked < spt_amount {
            return Err(ErrorCode::InsufficientFundWithdraw.into());
        }

        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(pool, user_opt, pool.total_staked).unwrap();
        ctx.accounts.user.balance_staked = ctx
            .accounts
            .user
            .balance_staked
            .checked_sub(spt_amount)
            .unwrap();

        // Transfer tokens from the pool vault to user vault.
        {
            let seeds = &[
                pool.base_key.as_ref(),
                pool.staking_mint.as_ref(),
                &[pool.pool_bump],
            ];
            let pool_signer = &[&seeds[..]];

            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.staking_vault.to_account_info(),
                    to: ctx.accounts.stake_from_account.to_account_info(),
                    authority: pool.to_account_info(),
                },
                pool_signer,
            );
            token::transfer(cpi_ctx, spt_amount)?;

            pool.total_staked = pool
                .total_staked
                .checked_sub(spt_amount)
                .ok_or(ErrorCode::MathOverflow)?;
            emit!(EventWithdraw { amount: spt_amount });
        }
        Ok(())
    }

    /// Authorize additional funders for the pool
    pub fn authorize_funder(ctx: Context<FunderChange>, funder_to_add: Pubkey) -> Result<()> {
        if funder_to_add == ctx.accounts.pool.authority.key() {
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
        if funder_to_remove == ctx.accounts.pool.authority.key() {
            return Err(ErrorCode::CannotDeauthorizePoolAuthority.into());
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

    /// Fund the pool with rewards.  This resets the clock on the end date, pushing it out to the set duration. And, linearly redistributes remaining rewards.
    pub fn fund(ctx: Context<Fund>, amount_a: u64, amount_b: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        //can't compare using reward_vault because it is PDA. The PDA seed contain different prefix
        //if mint are the same, we just use a
        if amount_b > 0 && ctx.accounts.reward_a_vault.mint == ctx.accounts.reward_b_vault.mint {
            return Err(ErrorCode::SingleDepositTokenBCannotBeFunded.into());
        }

        update_rewards(pool, None, pool.total_staked).unwrap();

        let (reward_a_rate, reward_b_rate) = rate_after_funding(pool, amount_a, amount_b)?;
        pool.reward_a_rate = reward_a_rate;
        pool.reward_b_rate = reward_b_rate;

        // Transfer reward A tokens into the A vault.
        if amount_a > 0 {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.from_a.to_account_info(),
                    to: ctx.accounts.reward_a_vault.to_account_info(),
                    authority: ctx.accounts.funder.to_account_info(),
                },
            );

            token::transfer(cpi_ctx, amount_a)?;
        }

        // Transfer reward B tokens into the B vault.
        if amount_b > 0 {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.from_b.to_account_info(),
                    to: ctx.accounts.reward_b_vault.to_account_info(),
                    authority: ctx.accounts.funder.to_account_info(),
                },
            );

            token::transfer(cpi_ctx, amount_b)?;
        }

        let current_time = clock::Clock::get()
            .unwrap()
            .unix_timestamp
            .try_into()
            .unwrap();
        pool.last_update_time = current_time;
        pool.reward_duration_end = current_time.checked_add(pool.reward_duration).unwrap();

        emit!(EventFund { amount_a, amount_b });
        Ok(())
    }

    /// User claim rewards
    pub fn claim(ctx: Context<ClaimReward>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(pool, user_opt, pool.total_staked).unwrap();

        let seeds = &[
            ctx.accounts.pool.base_key.as_ref(),
            ctx.accounts.pool.staking_mint.as_ref(),
            &[ctx.accounts.pool.pool_bump],
        ];
        let pool_signer = &[&seeds[..]];

        let mut claimed_reward_a: u64 = 0;
        let mut claimed_reward_b: u64 = 0;

        if ctx.accounts.user.reward_a_per_token_pending > 0 {
            let mut reward_amount = ctx.accounts.user.reward_a_per_token_pending;
            let vault_balance = ctx.accounts.reward_a_vault.amount;

            ctx.accounts.user.reward_a_per_token_pending = 0;
            if vault_balance < reward_amount {
                reward_amount = vault_balance;
            }

            if reward_amount > 0 {
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    token::Transfer {
                        from: ctx.accounts.reward_a_vault.to_account_info(),
                        to: ctx.accounts.reward_a_account.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    pool_signer,
                );
                token::transfer(cpi_ctx, reward_amount)?;
                claimed_reward_a = reward_amount;
            }
        }

        if ctx.accounts.user.reward_b_per_token_pending > 0 {
            let mut reward_amount = ctx.accounts.user.reward_b_per_token_pending;
            let vault_balance = ctx.accounts.reward_b_vault.amount;

            ctx.accounts.user.reward_b_per_token_pending = 0;
            if vault_balance < reward_amount {
                reward_amount = vault_balance;
            }

            if reward_amount > 0 {
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    token::Transfer {
                        from: ctx.accounts.reward_b_vault.to_account_info(),
                        to: ctx.accounts.reward_b_account.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    pool_signer,
                );
                token::transfer(cpi_ctx, reward_amount)?;
                claimed_reward_b = reward_amount;
            }
        }

        emit!(EventClaim {
            amount_a: claimed_reward_a,
            amount_b: claimed_reward_b
        });
        Ok(())
    }

    /// Withdraw token that mistakenly deposited to staking_vault
    pub fn withdraw_extra_token(ctx: Context<WithdrawExtraToken>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let total_amount = ctx.accounts.staking_vault.amount;
        let total_staked = pool.total_staked;
        let withdrawable_amount = total_amount
            .checked_sub(total_staked)
            .ok_or(ErrorCode::MathOverflow)?;

        if withdrawable_amount > 0 {
            let seeds = &[
                pool.base_key.as_ref(),
                pool.staking_mint.as_ref(),
                &[pool.pool_bump],
            ];
            let pool_signer = &[&seeds[..]];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.staking_vault.to_account_info(),
                    to: ctx.accounts.withdraw_to_account.to_account_info(),
                    authority: pool.to_account_info(),
                },
                pool_signer,
            );

            token::transfer(cpi_ctx, withdrawable_amount)?;
        }

        Ok(())
    }

    /// Closes a users stake account. Validation is done to ensure this is only allowed when the user has nothing staked and no rewards pending.
    pub fn close_user(ctx: Context<CloseUser>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.user_stake_count = pool.user_stake_count.checked_sub(1).unwrap();
        Ok(())
    }

    /// Closes a pool account. Only able to be done when there are no users staked.
    pub fn close_pool(ctx: Context<ClosePool>) -> Result<()> {
        let pool = &ctx.accounts.pool;

        let signer_seeds = &[
            ctx.accounts.pool.base_key.as_ref(),
            ctx.accounts.pool.staking_mint.as_ref(),
            &[ctx.accounts.pool.pool_bump],
        ];

        //instead of closing these vaults, we could technically just
        //set_authority on them. it's not very ata clean, but it'd work
        //if size of tx is an issue, thats an approach

        //close staking vault
        let ix = spl_token::instruction::transfer(
            &spl_token::ID,
            ctx.accounts.staking_vault.to_account_info().key,
            ctx.accounts.staking_refundee.to_account_info().key,
            &ctx.accounts.pool.key(),
            &[&ctx.accounts.pool.key()],
            ctx.accounts.staking_vault.amount,
        )?;
        solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.staking_vault.to_account_info(),
                ctx.accounts.staking_refundee.to_account_info(),
                ctx.accounts.pool.to_account_info(),
            ],
            &[signer_seeds],
        )?;
        let ix = spl_token::instruction::close_account(
            &spl_token::ID,
            ctx.accounts.staking_vault.to_account_info().key,
            ctx.accounts.refundee.key,
            &ctx.accounts.pool.key(),
            &[&ctx.accounts.pool.key()],
        )?;
        solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.staking_vault.to_account_info(),
                ctx.accounts.refundee.to_account_info(),
                ctx.accounts.pool.to_account_info(),
            ],
            &[signer_seeds],
        )?;

        //close token a vault
        let ix = spl_token::instruction::transfer(
            &spl_token::ID,
            ctx.accounts.reward_a_vault.to_account_info().key,
            ctx.accounts.reward_a_refundee.to_account_info().key,
            &ctx.accounts.pool.key(),
            &[&ctx.accounts.pool.key()],
            ctx.accounts.reward_a_vault.amount,
        )?;
        solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.reward_a_vault.to_account_info(),
                ctx.accounts.reward_a_refundee.to_account_info(),
                ctx.accounts.pool.to_account_info(),
            ],
            &[signer_seeds],
        )?;
        let ix = spl_token::instruction::close_account(
            &spl_token::ID,
            ctx.accounts.reward_a_vault.to_account_info().key,
            ctx.accounts.refundee.key,
            &ctx.accounts.pool.key(),
            &[&ctx.accounts.pool.key()],
        )?;
        solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.reward_a_vault.to_account_info(),
                ctx.accounts.refundee.to_account_info(),
                ctx.accounts.pool.to_account_info(),
            ],
            &[signer_seeds],
        )?;

        if pool.reward_a_vault != pool.reward_b_vault {
            //close token b vault
            let ix = spl_token::instruction::transfer(
                &spl_token::ID,
                ctx.accounts.reward_b_vault.to_account_info().key,
                ctx.accounts.reward_b_refundee.to_account_info().key,
                &ctx.accounts.pool.key(),
                &[&ctx.accounts.pool.key()],
                ctx.accounts.reward_b_vault.amount,
            )?;
            solana_program::program::invoke_signed(
                &ix,
                &[
                    ctx.accounts.token_program.to_account_info(),
                    ctx.accounts.reward_b_vault.to_account_info(),
                    ctx.accounts.reward_b_refundee.to_account_info(),
                    ctx.accounts.pool.to_account_info(),
                ],
                &[signer_seeds],
            )?;
            let ix = spl_token::instruction::close_account(
                &spl_token::ID,
                ctx.accounts.reward_b_vault.to_account_info().key,
                ctx.accounts.refundee.key,
                &ctx.accounts.pool.key(),
                &[&ctx.accounts.pool.key()],
            )?;
            solana_program::program::invoke_signed(
                &ix,
                &[
                    ctx.accounts.token_program.to_account_info(),
                    ctx.accounts.reward_b_vault.to_account_info(),
                    ctx.accounts.refundee.to_account_info(),
                    ctx.accounts.pool.to_account_info(),
                ],
                &[signer_seeds],
            )?;
        }
        Ok(())
    }
}

/// Accounts for [InitializePool](/dual_farming/instruction/struct.InitializePool.html) instruction
#[derive(Accounts)]
pub struct InitializePool<'info> {
    /// Global accounts for the staking instance.
    #[account(
        init,
        seeds = [
            base.key().as_ref(),
            staking_mint.key().as_ref()
        ],
        payer = authority,
        bump,
        space = 8 + 494 // discriminator + content + buffer
    )]
    pool: Box<Account<'info, Pool>>,
    /// Staking mint
    staking_mint: Box<Account<'info, Mint>>,

    /// Staking vault PDA
    #[account(
        init,
        seeds = [
            b"staking",
            pool.key().as_ref(),
        ],
        bump,
        payer = authority,
        token::mint = staking_mint,
        token::authority = pool
    )]
    staking_vault: Box<Account<'info, TokenAccount>>,

    /// Reward A mint
    reward_a_mint: Box<Account<'info, Mint>>,

    /// Reward A vault PDA
    #[account(
        init,
        seeds = [
            b"reward_a",
            pool.key().as_ref(),
        ],
        bump,
        payer = authority,
        token::mint = reward_a_mint,
        token::authority = pool
    )]
    reward_a_vault: Box<Account<'info, TokenAccount>>,

    /// Reward B mint
    reward_b_mint: Box<Account<'info, Mint>>,

    /// Reward B vault PDA
    #[account(
        init,
        seeds = [
            b"reward_b",
            pool.key().as_ref(),
        ],
        bump,
        payer = authority,
        token::mint = reward_b_mint,
        token::authority = pool
    )]
    reward_b_vault: Box<Account<'info, TokenAccount>>,

    /// Authority of the pool
    #[account(mut)]
    authority: Signer<'info>,

    /// Base
    base: Signer<'info>,
    /// System program
    system_program: Program<'info, System>,
    /// SPL Token program
    token_program: Program<'info, Token>,
    /// Rent
    rent: Sysvar<'info, Rent>,
}

/// Accounts for [CreateUser](/dual_farming/instruction/struct.CreateUser.html) instruction
#[derive(Accounts)]
pub struct CreateUser<'info> {
    /// Global accounts for the staking instance.
    #[account(
        mut,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    /// User
    #[account(
        init,
        payer = owner,
        seeds = [
            owner.key.as_ref(),
            pool.to_account_info().key.as_ref()
        ],
        bump,
        space = 200, //8 + 32 + 32 + 16 + 16 + 8 + 8 + 8 + 1 + buffer
    )]
    user: Box<Account<'info, User>>,
    /// Authority of user account
    #[account(mut)]
    owner: Signer<'info>,
    /// Misc.
    system_program: Program<'info, System>,
}

/// Accounts for [Pause](/dual_farming/instruction/struct.Pause.html) instruction
#[derive(Accounts)]
pub struct Pause<'info> {
    /// Global accounts for the staking instance.
    #[account(
        mut,
        has_one = authority,
        constraint = !pool.paused,
        constraint = pool.reward_duration_end < clock::Clock::get().unwrap().unix_timestamp.try_into().unwrap(),
        constraint = pool.reward_duration_end > 0,
    )]
    pool: Box<Account<'info, Pool>>,
    /// Authority of the pool
    authority: Signer<'info>,
}

/// Accounts for [Unpause](/dual_farming/instruction/struct.Unpause.html) instruction
#[derive(Accounts)]
pub struct Unpause<'info> {
    /// Global accounts for the staking instance.
    #[account(
        mut,
        has_one = authority,
        constraint = pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    /// Authority of the pool
    authority: Signer<'info>,
}

/// Accounts for [Deposit](/dual_farming/instruction/struct.Deposit.html) and [Withdraw](/dual_farming/instruction/struct.Withdraw.html) instructions.
#[derive(Accounts)]
pub struct Deposit<'info> {
    /// Global accounts for the deposit/withdraw instance.
    #[account(
        mut,
        has_one = staking_vault,
    )]
    pool: Box<Account<'info, Pool>>,
    /// Staking vault PDA.
    #[account(mut)]
    staking_vault: Box<Account<'info, TokenAccount>>,

    /// User.
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
        seeds = [
            owner.key.as_ref(),
            pool.to_account_info().key.as_ref()
        ],
        bump = user.nonce,
    )]
    user: Box<Account<'info, User>>,
    /// Authority of user
    owner: Signer<'info>,
    /// User staking ATA
    #[account(mut)]
    stake_from_account: Box<Account<'info, TokenAccount>>,
    /// Misc.
    token_program: Program<'info, Token>,
}

/// Accounts for [AuthorizeFunder](/dual_farming/instruction/struct.AuthorizeFunder.html)
/// and [DeauthorizeFunder](/dual_farming/instruction/struct.DeauthorizeFunder.html) instructions.
#[derive(Accounts)]
pub struct FunderChange<'info> {
    /// Global accounts for the staking instance.
    #[account(
        mut,
        has_one = authority,
    )]
    pool: Box<Account<'info, Pool>>,
    /// Authority of the pool
    authority: Signer<'info>,
}

/// Accounts for [Fund](/dual_farming/instruction/struct.Fund.html) instruction.
#[derive(Accounts)]
pub struct Fund<'info> {
    /// Global accounts for the staking instance.
    #[account(
        mut,
        has_one = staking_vault,
        has_one = reward_a_vault,
        has_one = reward_b_vault,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    /// Staking vault PDA
    #[account(mut)]
    staking_vault: Box<Account<'info, TokenAccount>>,
    /// Reward A Vault PDA
    #[account(mut)]
    reward_a_vault: Box<Account<'info, TokenAccount>>,
    /// Reward B Vault PDA
    #[account(mut)]
    reward_b_vault: Box<Account<'info, TokenAccount>>,
    /// Funder
    #[account(
        //require signed funder auth - otherwise constant micro fund could hold funds hostage
        constraint = funder.key() == pool.authority || pool.funders.iter().any(|x| *x == funder.key()),
    )]
    funder: Signer<'info>,
    /// Funder reward A ATA
    #[account(mut)]
    from_a: Box<Account<'info, TokenAccount>>,
    /// Funder reward B ATA
    #[account(mut)]
    from_b: Box<Account<'info, TokenAccount>>,
    /// Misc.
    token_program: Program<'info, Token>,
}

/// Accounts for [WithdrawExtraToken](/dual_farming/instruction/struct.WithdrawExtraToken.html) instruction
#[derive(Accounts)]
pub struct WithdrawExtraToken<'info> {
    /// Global accounts for the staking instance.
    #[account(
        has_one = staking_vault,
        has_one = authority,
        constraint = pool.reward_duration_end < sysvar::clock::Clock::get().unwrap().unix_timestamp.try_into().unwrap(),
    )]
    pool: Box<Account<'info, Pool>>,
    /// Staking vault PDA
    #[account(mut)]
    staking_vault: Box<Account<'info, TokenAccount>>,
    /// Token account to receive mistakenly deposited token
    #[account(mut)]
    withdraw_to_account: Box<Account<'info, TokenAccount>>,
    /// Authority of the staking instance
    authority: Signer<'info>,
    /// Misc.
    token_program: Program<'info, Token>,
}

/// Accounts for [Claim](/dual_farming/instruction/struct.Claim.html) instruction.
#[derive(Accounts)]
pub struct ClaimReward<'info> {
    /// Global accounts for the staking instance.
    #[account(
        mut,
        has_one = staking_vault,
        has_one = reward_a_vault,
        has_one = reward_b_vault,
    )]
    pool: Box<Account<'info, Pool>>,
    /// Staking vault PDA.
    #[account(mut)]
    staking_vault: Box<Account<'info, TokenAccount>>,
    /// Reward A Vault PDA
    #[account(mut)]
    reward_a_vault: Box<Account<'info, TokenAccount>>,
    /// Reward B Vault PDA
    #[account(mut)]
    reward_b_vault: Box<Account<'info, TokenAccount>>,

    /// User.
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
        seeds = [
            owner.to_account_info().key.as_ref(),
            pool.to_account_info().key.as_ref()
        ],
        bump = user.nonce,
    )]
    user: Box<Account<'info, User>>,
    /// Authority of user
    owner: Signer<'info>,
    /// User's Reward A ATA
    #[account(mut)]
    reward_a_account: Box<Account<'info, TokenAccount>>,
    /// User's Reward B ATA
    #[account(mut)]
    reward_b_account: Box<Account<'info, TokenAccount>>,
    // Misc.
    token_program: Program<'info, Token>,
}
/// Accounts for [CloseUser](/dual_farming/instruction/struct.CloseUser.html) instruction
#[derive(Accounts)]
pub struct CloseUser<'info> {
    #[account(mut)]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        close = owner,
        has_one = owner,
        has_one = pool,
        seeds = [
            owner.to_account_info().key.as_ref(),
            pool.to_account_info().key.as_ref()
        ],
        bump = user.nonce,
        constraint = user.balance_staked == 0,
        constraint = user.reward_a_per_token_pending == 0,
        constraint = user.reward_b_per_token_pending == 0,
    )]
    user: Account<'info, User>,
    // To receive lamports when close the user account
    #[account(mut)]
    owner: Signer<'info>,
}
/// Accounts for [ClosePool](/dual_farming/instruction/struct.ClosePool.html) instruction
#[derive(Accounts)]
pub struct ClosePool<'info> {
    #[account(mut)]
    /// CHECK: refundee
    refundee: UncheckedAccount<'info>,
    #[account(mut)]
    staking_refundee: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    reward_a_refundee: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    reward_b_refundee: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        close = refundee,
        has_one = authority,
        has_one = staking_vault,
        has_one = reward_a_vault,
        has_one = reward_b_vault,
        constraint = pool.paused,
        constraint = pool.reward_duration_end > 0,
        constraint = pool.reward_duration_end < sysvar::clock::Clock::get().unwrap().unix_timestamp.try_into().unwrap(),
        constraint = pool.user_stake_count == 0,
    )]
    pool: Account<'info, Pool>,
    authority: Signer<'info>,
    #[account(mut,
        constraint = staking_vault.amount == 0, // Admin need to withdraw out mistakenly deposited token firstly
    )]
    staking_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    reward_a_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    reward_b_vault: Box<Account<'info, TokenAccount>>,
    token_program: Program<'info, Token>,
}

/// Pool account wrapper
#[account]
pub struct Pool {
    /// Privileged account.
    pub authority: Pubkey, // 32
    /// Paused state of the program
    pub paused: bool, // 1
    /// Mint of the token that can be staked.
    pub staking_mint: Pubkey, // 32
    /// Vault to store staked tokens.
    pub staking_vault: Pubkey, // 32
    /// Mint of the reward A token.
    pub reward_a_mint: Pubkey, // 32
    /// Vault to store reward A tokens.
    pub reward_a_vault: Pubkey, // 32
    /// Mint of the reward B token.
    pub reward_b_mint: Pubkey, // 32
    /// Vault to store reward B tokens.
    pub reward_b_vault: Pubkey, // 32
    /// Base key
    pub base_key: Pubkey, // 32
    /// The period which rewards are linearly distributed.
    pub reward_duration: u64, // 8
    /// The timestamp at which the current reward period ends.
    pub reward_duration_end: u64, // 8
    /// The last time reward states were updated.
    pub last_update_time: u64, // 8
    /// Rate of reward A distribution.
    pub reward_a_rate: u64, // 8
    /// Rate of reward B distribution.
    pub reward_b_rate: u64, // 8
    /// Last calculated reward A per pool token.
    pub reward_a_per_token_stored: u128, // 16
    /// Last calculated reward B per pool token.
    pub reward_b_per_token_stored: u128, // 16
    /// Users staked
    pub user_stake_count: u32, // 4
    /// authorized funders
    /// [] because short size, fixed account size, and ease of use on
    /// client due to auto generated account size property
    pub funders: [Pubkey; 4], // 32 * 4 = 128
    /// Pool bump
    pub pool_bump: u8, // 1
    /// Total staked amount
    pub total_staked: u64,
}

/// Farming user account
#[account]
#[derive(Default)]
pub struct User {
    /// Pool the this user belongs to.
    pub pool: Pubkey,
    /// The owner of this account.
    pub owner: Pubkey,
    /// The amount of token A claimed.
    pub reward_a_per_token_complete: u128,
    /// The amount of token B claimed.
    pub reward_b_per_token_complete: u128,
    /// The amount of token A pending claim.
    pub reward_a_per_token_pending: u64,
    /// The amount of token B pending claim.
    pub reward_b_per_token_pending: u64,
    /// The amount staked.
    pub balance_staked: u64,
    /// Signer nonce.
    pub nonce: u8,
}

/// Deposit event
#[event]
pub struct EventDeposit {
    amount: u64,
}

/// Withdraw event
#[event]
pub struct EventWithdraw {
    amount: u64,
}

/// Fund event
#[event]
pub struct EventFund {
    amount_a: u64,
    amount_b: u64,
}

/// Claim event
#[event]
pub struct EventClaim {
    amount_a: u64,
    amount_b: u64,
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

/// Program error codes
#[error_code]
pub enum ErrorCode {
    /// Insufficient funds to withdraw.
    #[msg("Insufficient funds to withdraw.")]
    InsufficientFundWithdraw,
    /// Amount must be greater than zero.
    #[msg("Amount must be greater than zero.")]
    AmountMustBeGreaterThanZero,
    /// Reward B cannot be funded - pool is single deposit.
    #[msg("Reward B cannot be funded - pool is single deposit.")]
    SingleDepositTokenBCannotBeFunded,
    /// Pool is paused.
    #[msg("Pool is paused.")]
    PoolPaused,
    /// Duration cannot be shorter than one day.
    #[msg("Duration cannot be shorter than one day.")]
    DurationTooShort,
    /// Provided funder is already authorized to fund.
    #[msg("Provided funder is already authorized to fund.")]
    FunderAlreadyAuthorized,
    /// Maximum funders already authorized.
    #[msg("Maximum funders already authorized.")]
    MaxFunders,
    /// Cannot deauthorize the primary pool authority.
    #[msg("Cannot deauthorize the primary pool authority.")]
    CannotDeauthorizePoolAuthority,
    /// Authority not found for deauthorization.
    #[msg("Authority not found for deauthorization.")]
    CannotDeauthorizeMissingAuthority,
    /// Math opeartion overflow
    #[msg("Math operation overflow")]
    MathOverflow,
}

impl Debug for Pool {
    /// writes a subset of pool fields for debugging
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::result::Result<(), std::fmt::Error> {
        write!(f, "paused: {} reward_duration: {} reward_duration_end: {} reward_a_rate: {} reward_b_rate: {} reward_a_per_token_stored {} reward_b_per_token_stored {}",                
        self.paused,
        self.reward_duration,
        self.reward_duration_end,
        self.reward_a_rate,
        self.reward_b_rate,
        self.reward_a_per_token_stored,
        self.reward_b_per_token_stored,
    )
    }
}

impl Debug for User {
    /// writes a subset of user fields for debugging
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::result::Result<(), std::fmt::Error> {
        if cfg!(feature = "verbose") {
            write!(f, "reward_a_per_token_complete: {:?} reward_b_per_token_complete: {} reward_a_per_token_pending: {} reward_b_per_token_pending: {} balance_staked: {} nonce: {}",
                self.reward_a_per_token_complete,
                self.reward_b_per_token_complete,
                self.reward_a_per_token_pending,
                self.reward_b_per_token_pending,
                self.balance_staked,
                self.nonce,
            )
        } else {
            write!(f, "balance_staked: {:?}", self.balance_staked,)
        }
    }
}
