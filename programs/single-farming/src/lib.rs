use crate::calculator::*;
use crate::constants::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use std::convert::Into;
use std::convert::TryInto;
use std::str::FromStr;
mod calculator;

declare_id!("Dev9TukuTHwNmYm2NUcXQ9iuNL8UrP3TnZCj1Y7UjV18");

#[cfg(not(feature = "dev"))]
mod constants {
    use super::*;
    pub const MIN_DURATION: u64 = 86400; // 1 day
    pub fn validate_admin_address(pubkey: Pubkey) -> bool {
        if pubkey == Pubkey::from_str("DHLXnJdACTY83yKwnUkeoDjqi4QBbsYGa1v8tJL76ViX").unwrap() {
            return true;
        }
        return false;
    }

    pub fn validate_staking_mint(pubkey: Pubkey) -> bool {
        if pubkey == Pubkey::from_str("MERt85fc5boKw3BW1eYdxonEuJNvXbiMbs6hvheau5K").unwrap() {
            return true;
        }
        return false;
    }
}

#[cfg(feature = "dev")]
mod constants {
    use super::*;
    pub const MIN_DURATION: u64 = 1;
    pub fn validate_admin_address(pubkey: Pubkey) -> bool {
        return true;
    }

    pub fn validate_staking_mint(pubkey: Pubkey) -> bool {
        return true;
    }
}

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
    let last_time_reward_applicable = last_time_reward_applicable(pool.reward_end_timestamp);

    let reward = reward_per_token(pool, total_staked, last_time_reward_applicable)
        .ok_or(ErrorCode::MathOverFlow)?;

    pool.reward_per_token_stored = reward;
    pool.last_update_time = last_time_reward_applicable;

    if let Some(u) = user {
        let amount = user_earned_amount(pool, u).ok_or(ErrorCode::MathOverFlow)?;

        u.reward_per_token_pending = amount;
        u.reward_per_token_complete = pool.reward_per_token_stored;
    }

    Ok(())
}

/// The min of current time and reward duration end, such that after the pool reward
/// period ends, this always returns the pool end time
fn last_time_reward_applicable(reward_end_timestamp: u64) -> u64 {
    let c = clock::Clock::get().unwrap();
    std::cmp::min(c.unix_timestamp.try_into().unwrap(), reward_end_timestamp)
}

#[program]
pub mod single_farming {
    use super::*;

    /// Initializes a new pool
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        pool_nonce: u8,
        reward_start_timestamp: u64,
        reward_duration: u64,
        funding_amount: u64,
    ) -> Result<()> {
        if reward_duration < MIN_DURATION {
            return Err(ErrorCode::DurationTooShort.into());
        }
        // validate current time
        let current_time: u64 = clock::Clock::get()
            .unwrap()
            .unix_timestamp
            .try_into()
            .unwrap();
        if reward_start_timestamp < current_time {
            return Err(ErrorCode::InvalidStartDate.into());
        }

        let pool = &mut ctx.accounts.pool;
        pool.nonce = pool_nonce;
        pool.staking_mint = ctx.accounts.staking_mint.key();
        pool.staking_vault = ctx.accounts.staking_vault.key();
        pool.reward_mint = ctx.accounts.reward_mint.key();
        pool.reward_vault = ctx.accounts.reward_vault.key();
        pool.reward_start_timestamp = reward_start_timestamp;

        pool.reward_end_timestamp = reward_start_timestamp
            .checked_add(reward_duration)
            .ok_or(ErrorCode::MathOverFlow)?;

        pool.last_update_time = reward_start_timestamp;
        pool.reward_rate =
            rate_by_funding(funding_amount, reward_duration).ok_or(ErrorCode::MathOverFlow)?;
        pool.reward_per_token_stored = 0;
        Ok(())
    }

    /// Initialize a user staking account
    pub fn create_user<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, CreateUser<'info>>,
        nonce: u8,
    ) -> Result<()> {
        let user = &mut ctx.accounts.user;
        user.pool = *ctx.accounts.pool.to_account_info().key;
        user.owner = *ctx.accounts.owner.key;
        user.reward_per_token_complete = 0;
        user.reward_per_token_pending = 0;
        user.balance_staked = 0;
        user.nonce = nonce;
        Ok(())
    }

    /// A user stakes tokens in the pool.
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        if amount == 0 {
            return Err(ErrorCode::AmountMustBeGreaterThanZero.into());
        }
        let pool = &mut ctx.accounts.pool;
        let current_time: u64 = clock::Clock::get()
            .unwrap()
            .unix_timestamp
            .try_into()
            .unwrap();
        // msg!("current_time {}", current_time);
        if current_time < pool.reward_start_timestamp {
            return Err(ErrorCode::FarmingNotStart.into());
        }

        let total_staked = ctx.accounts.staking_vault.amount;

        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(pool, user_opt, total_staked)?;

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
        }

        Ok(())
    }

    /// A user unstakes tokens in the pool.
    pub fn unstake(ctx: Context<Stake>, spt_amount: u64) -> Result<()> {
        if spt_amount == 0 {
            return Err(ErrorCode::AmountMustBeGreaterThanZero.into());
        }

        let pool = &mut ctx.accounts.pool;
        let total_staked = ctx.accounts.staking_vault.amount;

        if ctx.accounts.user.balance_staked < spt_amount {
            return Err(ErrorCode::InsufficientFundUnstake.into());
        }

        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(pool, user_opt, total_staked)?;
        ctx.accounts.user.balance_staked = ctx
            .accounts
            .user
            .balance_staked
            .checked_sub(spt_amount)
            .ok_or(ErrorCode::CannotUnstakeMoreThanBalance)?;

        // Transfer tokens from the pool vault to user vault.
        {
            let staking_mint = pool.staking_mint;
            let seeds = &[b"pool".as_ref(), staking_mint.as_ref(), &[pool.nonce]];
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
        }

        Ok(())
    }

    /// A user claiming rewards
    pub fn claim(ctx: Context<ClaimReward>) -> Result<()> {
        let total_staked = ctx.accounts.staking_vault.amount;

        let pool = &mut ctx.accounts.pool;
        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(pool, user_opt, total_staked)?;

        let staking_mint = pool.staking_mint;
        let seeds = &[b"pool".as_ref(), staking_mint.as_ref(), &[pool.nonce]];
        let pool_signer = &[&seeds[..]];

        // emit pending reward
        emit!(EventPendingReward {
            value: ctx.accounts.user.reward_per_token_pending,
        });

        if ctx.accounts.user.reward_per_token_pending > 0 {
            let reward_per_token_pending = ctx.accounts.user.reward_per_token_pending;
            let vault_balance = ctx.accounts.reward_vault.amount;

            let reward_amount = if vault_balance < reward_per_token_pending {
                vault_balance
            } else {
                reward_per_token_pending
            };

            if reward_amount > 0 {
                ctx.accounts.user.reward_per_token_pending = reward_per_token_pending
                    .checked_sub(reward_amount)
                    .ok_or(ErrorCode::MathOverFlow)?;

                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    token::Transfer {
                        from: ctx.accounts.reward_vault.to_account_info(),
                        to: ctx.accounts.reward_account.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    pool_signer,
                );
                token::transfer(cpi_ctx, reward_amount)?;
                emit!(EventClaimReward {
                    value: reward_amount,
                });
            }
        }

        Ok(())
    }

    /// Closes a users stake account. Validation is done to ensure this is only allowed when
    /// the user has nothing staked and no rewards pending.
    pub fn close_user(ctx: Context<CloseUser>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(pool_nonce: u8)]
pub struct InitializePool<'info> {
    #[account(
        init,
        seeds = [b"pool".as_ref(), staking_mint.key().as_ref()], 
        bump,
        payer = admin,
        space = 200 // 1 + 177 + buffer
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        init,
        seeds = [b"staking_vault".as_ref(), pool.key().as_ref()],
        bump,
        payer = admin,
        token::mint = staking_mint,
        token::authority = pool,
    )]
    pub staking_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = validate_staking_mint(staking_mint.key()) @ ErrorCode::WrongStakingMint)]
    pub staking_mint: Box<Account<'info, Mint>>,
    pub reward_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        seeds = [b"reward_vault".as_ref(), pool.key().as_ref()],
        bump,
        payer = admin,
        token::mint = reward_mint,
        token::authority = pool,
    )]
    pub reward_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut, constraint = validate_admin_address(admin.key()) @ ErrorCode::InvalidAdminWhenCreatingPool)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
    /// CHECK: Rent
    pub rent: UncheckedAccount<'info>,
    /// CHECK: System program
    pub system_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(nonce: u8)]
pub struct CreateUser<'info> {
    pub pool: Box<Account<'info, Pool>>,
    // Member.
    #[account(
        init,
        payer = owner,
        seeds = [
            owner.key.as_ref(),
            pool.to_account_info().key.as_ref()
        ],
        bump,
        space = 120 // 1 + 97 + buffer
    )]
    pub user: Box<Account<'info, User>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    // Misc.
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut,
        has_one = staking_vault,
    )]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    pub staking_vault: Box<Account<'info, TokenAccount>>,

    // User.
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
    )]
    pub user: Box<Account<'info, User>>,
    pub owner: Signer<'info>,
    #[account(mut)]
    pub stake_from_account: Box<Account<'info, TokenAccount>>,

    // Misc.
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut,
        has_one = staking_vault,
        has_one = reward_vault,
    )]
    pub pool: Box<Account<'info, Pool>>,
    pub staking_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub reward_vault: Box<Account<'info, TokenAccount>>,

    // User.
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
    )]
    pub user: Box<Account<'info, User>>,
    pub owner: Signer<'info>,
    #[account(mut)]
    pub reward_account: Box<Account<'info, TokenAccount>>,

    // Misc.
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseUser<'info> {
    pub pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        close = owner,
        has_one = owner,
        has_one = pool,
        constraint = user.balance_staked == 0,
        constraint = user.reward_per_token_pending == 0,
    )]
    pub user: Account<'info, User>,
    pub owner: Signer<'info>,
}

#[account]
#[derive(Default)]
pub struct Pool {
    /// Nonce to derive the program-derived address owning the vaults.
    pub nonce: u8,
    /// Mint of the token that can be staked.
    pub staking_mint: Pubkey,
    /// Vault to store staked tokens.
    pub staking_vault: Pubkey,
    /// Mint of the reward A token.
    pub reward_mint: Pubkey,
    /// Vault to store reward A tokens.
    pub reward_vault: Pubkey,
    /// The timestamp at which the current reward period ends.
    pub reward_start_timestamp: u64,
    /// The timestamp at which the current reward period ends.
    pub reward_end_timestamp: u64,
    /// The last time reward states were updated.
    pub last_update_time: u64,
    /// Rate of reward A distribution.
    pub reward_rate: u64,
    /// Last calculated reward A per pool token.
    pub reward_per_token_stored: u128,
}

#[account]
#[derive(Default)]
pub struct User {
    /// Pool the this user belongs to.
    pub pool: Pubkey,
    /// The owner of this account.
    pub owner: Pubkey,
    /// The amount of token A claimed.
    pub reward_per_token_complete: u128,
    /// The amount of token A pending claim.
    pub reward_per_token_pending: u64,
    /// The amount staked.
    pub balance_staked: u64,
    /// Signer nonce.
    pub nonce: u8,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Staking mint is wrong")]
    WrongStakingMint,
    #[msg("Create pool with wrong admin")]
    InvalidAdminWhenCreatingPool,
    #[msg("Start time cannot be smaller than current time")]
    InvalidStartDate,
    #[msg("Farming hasn't started")]
    FarmingNotStart,
    #[msg("Cannot unstake more than staked amount")]
    CannotUnstakeMoreThanBalance,
    #[msg("Insufficient funds to unstake.")]
    InsufficientFundUnstake,
    #[msg("Amount must be greater than zero.")]
    AmountMustBeGreaterThanZero,
    #[msg("Duration cannot be shorter than one day.")]
    DurationTooShort,
    #[msg("MathOverFlow")]
    MathOverFlow,
}

#[event]
pub struct EventPendingReward {
    pub value: u64,
}

#[event]
pub struct EventClaimReward {
    pub value: u64,
}
