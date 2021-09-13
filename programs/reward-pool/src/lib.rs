use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;
use anchor_spl::token::{self, Mint, TokenAccount};
use std::convert::Into;
use std::convert::TryInto;

pub fn update_rewards(
    pool: &mut ProgramAccount<Pool>,
    reward_a_mint: &CpiAccount<anchor_spl::token::Mint>,
    reward_b_mint: &CpiAccount<anchor_spl::token::Mint>,
    user: Option<&mut ProgramAccount<User>>,
    clock: &Clock,
    total_staked: u64,
) -> Result<()> {
    let base_ten: u64 = 10;
    let reward_a_decimals: u64 = base_ten.pow(reward_a_mint.decimals.into());
    let reward_b_decimals: u64 = base_ten.pow(reward_b_mint.decimals.into());

    let last_time_reward_applicable =
        last_time_reward_applicable(pool.reward_duration_end, clock.unix_timestamp);

    msg!("last_time_reward_applicable: {}", last_time_reward_applicable);

    pool.reward_a_per_token_stored = reward_per_token(
        total_staked,
        pool.reward_a_per_token_stored,
        last_time_reward_applicable,
        pool.last_update_time,
        pool.reward_a_rate,
        reward_a_decimals,
    );

    msg!("pool.reward_a_per_token_stored: {}", pool.reward_a_per_token_stored);

    pool.reward_b_per_token_stored = reward_per_token(
        total_staked,
        pool.reward_b_per_token_stored,
        last_time_reward_applicable,
        pool.last_update_time,
        pool.reward_b_rate,
        reward_b_decimals,
    );

    pool.last_update_time = last_time_reward_applicable;

    msg!("pool.last_update_time: {}", pool.last_update_time);

    if let Some(u) = user {
        u.reward_a_per_token_pending = earned(
            u.balance_staked,
            pool.reward_a_per_token_stored,
            u.reward_a_per_token_complete,
            u.reward_a_per_token_pending,
            reward_a_decimals,
        );
        u.reward_a_per_token_complete = pool.reward_a_per_token_stored;

        msg!("u.reward_a_per_token_pending: {}", u.reward_a_per_token_pending);
        msg!("u.reward_a_per_token_complete: {}", u.reward_a_per_token_complete);

        u.reward_b_per_token_pending = earned(
            u.balance_staked,
            pool.reward_b_per_token_stored,
            u.reward_b_per_token_complete,
            u.reward_b_per_token_pending,
            reward_b_decimals,
        );
        u.reward_b_per_token_complete = pool.reward_b_per_token_stored;
    }

    Ok(())
}

pub fn last_time_reward_applicable(reward_duration_end: u64, unix_timestamp: i64) -> u64 {
    return std::cmp::min(unix_timestamp.try_into().unwrap(), reward_duration_end);
}

pub fn reward_per_token(
    total_staked: u64,
    reward_per_token_stored: u64,
    last_time_reward_applicable: u64,
    last_update_time: u64,
    reward_rate: u64,
    reward_decimals: u64,
) -> u64 {
    if total_staked == 0 {
        return reward_per_token_stored;
    }
    return reward_per_token_stored
                .checked_add(
                    (last_time_reward_applicable as u128)
                    .checked_sub(last_update_time as u128)
                    .unwrap()
                    .checked_mul(reward_rate as u128)
                    .unwrap()
                    .checked_mul(reward_decimals as u128)
                    .unwrap()
                    .checked_div(total_staked as u128)
                    .unwrap()
                    .try_into()
                    .unwrap(),
                )
                .unwrap();
}

pub fn earned(
    balance_staked: u64,
    reward_per_token_x: u64,
    user_reward_per_token_x_paid: u64,
    user_reward_x_pending: u64,
    reward_decimals: u64,
) -> u64 {
    return (balance_staked as u128)
        .checked_mul(
            (reward_per_token_x as u128)
                .checked_sub(user_reward_per_token_x_paid as u128)
                .unwrap(),
        )
        .unwrap()
        .checked_div(reward_decimals as u128)
        .unwrap()
        .checked_add(user_reward_x_pending as u128)
        .unwrap()
        .try_into() //the divide by decimals will shrink to u64 again
        .unwrap()
}

#[program]
pub mod reward_pool {
    use super::*;

    pub fn initialize_program(
        ctx: Context<InitializeProgram>,
        nonce: u8, 
        authority_mint: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        if config.authority_mint != Pubkey::default() {
            return Err(ErrorCode::ProgramAlreadyInitialized.into());
        }
        
        let (proper_address, proper_nonce) = Pubkey::find_program_address(
            &[ &b"config"[..] ], 
            ctx.program_id
        );
        if proper_address != *config.to_account_info().key || proper_nonce != nonce {
            return Err(ErrorCode::InvalidConfig.into());
        }

        config.authority_mint = authority_mint;

        Ok(())
    }

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        authority: Pubkey,
        nonce: u8,
        staking_mint: Pubkey,
        staking_vault: Pubkey,
        reward_a_mint: Pubkey,
        reward_a_vault: Pubkey,
        reward_b_mint: Pubkey,
        reward_b_vault: Pubkey,
        reward_duration: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        pool.authority = authority;
        pool.nonce = nonce;
        pool.paused = false;
        pool.staking_mint = staking_mint;
        pool.staking_vault = staking_vault;
        pool.reward_a_mint = reward_a_mint;
        pool.reward_a_vault = reward_a_vault;
        pool.reward_b_mint = reward_b_mint;
        pool.reward_b_vault = reward_b_vault;
        pool.reward_duration = reward_duration;
        pool.reward_duration_end = 0;
        pool.last_update_time = 0;
        pool.reward_a_rate = 0;
        pool.reward_b_rate = 0;
        pool.reward_a_per_token_stored = 0;
        pool.reward_b_per_token_stored = 0;

        msg!("created pool nonce {}", nonce);

        Ok(())
    }

    pub fn create_user(ctx: Context<CreateUser>, nonce: u8) -> Result<()> {
        let user = &mut ctx.accounts.user;
        user.pool = *ctx.accounts.pool.to_account_info().key;
        user.owner = *ctx.accounts.owner.key;
        user.reward_a_per_token_complete = 0;
        user.reward_b_per_token_complete = 0;
        user.reward_a_per_token_pending = 0;
        user.reward_b_per_token_pending = 0;
        user.balance_staked = 0;
        user.nonce = nonce;

        msg!("created user nonce {}", nonce);
        Ok(())
    }

    pub fn pause(ctx: Context<Pause>, paused: bool) -> Result<()> {
        ctx.accounts.pool.paused = paused;
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        if ctx.accounts.pool.paused {
            return Err(ErrorCode::PoolPaused.into());
        }
        if amount == 0 {
            return Err(ErrorCode::AmountMustBeGreaterThanZero.into());
        }

        let total_staked = ctx.accounts.staking_vault.amount;

        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(
            &mut ctx.accounts.pool,
            &ctx.accounts.reward_a_mint,
            &ctx.accounts.reward_b_mint,
            user_opt,
            &ctx.accounts.clock,
            total_staked,
        )
        .unwrap();
        
        ctx.accounts.user.balance_staked = ctx.accounts.user.balance_staked.checked_add(amount).unwrap();

        // Transfer tokens into the stake vault.
        {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.clone(),
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

    pub fn unstake(ctx: Context<Stake>, spt_amount: u64) -> Result<()> {
        if spt_amount == 0 {
            return Err(ErrorCode::AmountMustBeGreaterThanZero.into());
        }

        let total_staked = ctx.accounts.staking_vault.amount;

        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(
            &mut ctx.accounts.pool,
            &ctx.accounts.reward_a_mint,
            &ctx.accounts.reward_b_mint,
            user_opt,
            &ctx.accounts.clock,
            total_staked,
        )
        .unwrap();
        
        ctx.accounts.user.balance_staked = ctx.accounts.user.balance_staked.checked_sub(spt_amount).unwrap();

        // Transfer tokens from the pool vault to user vault.
        {
            let seeds = &[
                ctx.accounts.pool.to_account_info().key.as_ref(),
                &[ctx.accounts.pool.nonce],
            ];
            let pool_signer = &[&seeds[..]];

            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.clone(),
                token::Transfer {
                    from: ctx.accounts.staking_vault.to_account_info(),
                    to: ctx.accounts.stake_from_account.to_account_info(),
                    authority: ctx.accounts.pool_signer.to_account_info(),
                },
                pool_signer,
            );
            token::transfer(cpi_ctx, spt_amount.try_into().unwrap())?;
        }

        Ok(())
    }

    pub fn fund(ctx: Context<Fund>, amount_a: u64, amount_b: u64) -> Result<()> {
        if ctx.accounts.pool.paused {
            return Err(ErrorCode::PoolPaused.into());
        }

        let pool = &mut ctx.accounts.pool;
        let total_staked = ctx.accounts.staking_vault.amount;

        update_rewards(
            pool,
            &ctx.accounts.reward_a_mint,
            &ctx.accounts.reward_b_mint,
            None,
            &ctx.accounts.clock,
            total_staked,
        )
        .unwrap();

        let current_time = ctx.accounts.clock.unix_timestamp.try_into().unwrap();
        let reward_period_end = pool.reward_duration_end;

        if current_time >= reward_period_end {
            pool.reward_a_rate = amount_a.checked_div(pool.reward_duration).unwrap();
            pool.reward_b_rate = amount_b.checked_div(pool.reward_duration).unwrap();
        } else {
            let remaining = pool.reward_duration_end.checked_sub(current_time).unwrap();
            let leftover_a = remaining.checked_mul(pool.reward_a_rate).unwrap();
            let leftover_b = remaining.checked_mul(pool.reward_b_rate).unwrap();

            pool.reward_a_rate = amount_a
                .checked_add(leftover_a)
                .unwrap()
                .checked_div(pool.reward_duration)
                .unwrap();
            pool.reward_b_rate = amount_b
                .checked_add(leftover_b)
                .unwrap()
                .checked_div(pool.reward_duration)
                .unwrap();
        }

        // Transfer reward A tokens into the A vault.
        if amount_a > 0 {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.clone(),
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
                ctx.accounts.token_program.clone(),
                token::Transfer {
                    from: ctx.accounts.from_b.to_account_info(),
                    to: ctx.accounts.reward_b_vault.to_account_info(),
                    authority: ctx.accounts.funder.to_account_info(),
                },
            );

            token::transfer(cpi_ctx, amount_b)?;
        }

        pool.last_update_time = current_time;
        pool.reward_duration_end = current_time.checked_add(pool.reward_duration).unwrap();

        Ok(())
    }

    pub fn claim(ctx: Context<ClaimReward>) -> Result<()> {
        let total_staked = ctx.accounts.staking_vault.amount;

        let user_opt = Some(&mut ctx.accounts.user);
        update_rewards(
            &mut ctx.accounts.pool,
            &ctx.accounts.reward_a_mint,
            &ctx.accounts.reward_b_mint,
            user_opt,
            &ctx.accounts.clock,
            total_staked,
        )
        .unwrap();

        let seeds = &[
            ctx.accounts.pool.to_account_info().key.as_ref(),
            &[ctx.accounts.pool.nonce],
        ];
        let pool_signer = &[&seeds[..]];

        if ctx.accounts.user.reward_a_per_token_pending > 0 {
            let mut reward_amount = ctx.accounts.user.reward_a_per_token_pending;
            let vault_balance = ctx.accounts.reward_a_vault.amount;

            msg!("reward_amount {}", reward_amount);
            msg!("vault_balance {}", vault_balance);

            ctx.accounts.user.reward_a_per_token_pending = 0;
            if vault_balance < reward_amount {
                reward_amount = vault_balance;
            }

            if reward_amount > 0 {
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.clone(),
                    token::Transfer {
                        from: ctx.accounts.reward_a_vault.to_account_info(),
                        to: ctx.accounts.reward_a_account.to_account_info(),
                        authority: ctx.accounts.pool_signer.to_account_info(),
                    },
                    pool_signer,
                );
                token::transfer(cpi_ctx, reward_amount)?;
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
                    ctx.accounts.token_program.clone(),
                    token::Transfer {
                        from: ctx.accounts.reward_b_vault.to_account_info(),
                        to: ctx.accounts.reward_b_account.to_account_info(),
                        authority: ctx.accounts.pool_signer.to_account_info(),
                    },
                    pool_signer,
                );
                token::transfer(cpi_ctx, reward_amount)?;
            }
        }

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(nonce: u8)]
pub struct InitializeProgram<'info> {
    #[account(
        init,
        seeds = [&b"config"[..], &[nonce]],
        payer = payer,
    )]
    config: ProgramAccount<'info, ProgramConfig>,
    #[account(signer)]
    payer: AccountInfo<'info>,
    #[account(address = system_program::ID)]
    system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    //no assertions needed here; anchor's owner and discriminator checks assert trust
    config: ProgramAccount<'info, ProgramConfig>,
    #[account(
        constraint = authority_token_account.mint == config.authority_mint,
        constraint = (
            authority_token_account.owner == *authority_token_owner.to_account_info().key
            ||
            (authority_token_account.delegate.is_some()
                && authority_token_account.delegate.unwrap() == *authority_token_owner.to_account_info().key
                && authority_token_account.delegated_amount > 0)
        ),
        constraint = !authority_token_account.is_frozen(),
        constraint = authority_token_account.amount > 0,
    )]
    authority_token_account: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    authority_token_owner: AccountInfo<'info>,
    #[account(init)]
    pool: ProgramAccount<'info, Pool>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(nonce: u8)]
pub struct CreateUser<'info> {
    // Stake instance.
    pool: ProgramAccount<'info, Pool>,
    // Member.
    #[account(
        init,
        seeds = [
            owner.key.as_ref(), 
            pool.to_account_info().key.as_ref(),
            &[nonce],
        ],
        payer = owner,
    )]
    user: ProgramAccount<'info, User>,
    #[account(signer)]
    owner: AccountInfo<'info>,
    // Misc.
    #[account(address = token::ID)]
    token_program: AccountInfo<'info>,
    #[account(address = system_program::ID)]
    system_program: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(mut, has_one = authority)]
    pool: ProgramAccount<'info, Pool>,
    #[account(signer)]
    authority: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut, 
        has_one = reward_a_mint,
        has_one = reward_b_mint
    )]
    pool: ProgramAccount<'info, Pool>,
    reward_a_mint: CpiAccount<'info, Mint>,
    reward_b_mint: CpiAccount<'info, Mint>,
    #[account(mut,
        constraint = staking_vault.owner == *pool_signer.key
    )]
    staking_vault: CpiAccount<'info, TokenAccount>,

    // User.
    #[account(
        mut, 
        has_one = owner, 
        has_one = pool,
        seeds = [
            owner.key.as_ref(), 
            pool.to_account_info().key.as_ref(),
            &[user.nonce],
        ],
    )]
    user: ProgramAccount<'info, User>,
    #[account(signer)] //todo not signer; require stake_from_account auth to user program account instead?
    owner: AccountInfo<'info>,
    #[account(mut,
        constraint = stake_from_account.mint == pool.staking_mint,
        has_one = owner
    )]
    stake_from_account: CpiAccount<'info, TokenAccount>,

    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref(),
            &[pool.nonce],
        ],
    )]
    pool_signer: AccountInfo<'info>,

    // Misc.
    clock: Sysvar<'info, Clock>,
    #[account(address = token::ID)]
    token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Fund<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut, 
        has_one = reward_a_mint,
        has_one = reward_b_mint
    )]
    pool: ProgramAccount<'info, Pool>,
    reward_a_mint: CpiAccount<'info, Mint>,
    reward_b_mint: CpiAccount<'info, Mint>,
    #[account(mut,
        constraint = staking_vault.owner == *pool_signer.key
    )]
    staking_vault: CpiAccount<'info, TokenAccount>,
    #[account(mut,
        constraint = reward_a_vault.owner == *pool_signer.key
    )]
    reward_a_vault: CpiAccount<'info, TokenAccount>,
    #[account(mut,
        constraint = reward_b_vault.owner == *pool_signer.key
    )]
    reward_b_vault: CpiAccount<'info, TokenAccount>,

    #[account(signer)] //todo remove signer and add approval to pool authority on tokens
    funder: AccountInfo<'info>,
    #[account(mut)]
    from_a: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    from_b: CpiAccount<'info, TokenAccount>,

    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref(),
            &[pool.nonce],
        ],
    )]
    pool_signer: AccountInfo<'info>,

    // Misc.
    clock: Sysvar<'info, Clock>,
    #[account(constraint = token_program.key == &token::ID)]
    token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut, 
        has_one = reward_a_mint,
        has_one = reward_b_mint
    )]
    pool: ProgramAccount<'info, Pool>,
    reward_a_mint: CpiAccount<'info, Mint>,
    reward_b_mint: CpiAccount<'info, Mint>,
    #[account(mut,
        constraint = staking_vault.owner == *pool_signer.key
    )]
    staking_vault: CpiAccount<'info, TokenAccount>,
    #[account(mut,
        constraint = reward_a_vault.owner == *pool_signer.key
    )]
    reward_a_vault: CpiAccount<'info, TokenAccount>,
    #[account(mut,
        constraint = reward_b_vault.owner == *pool_signer.key
    )]
    reward_b_vault: CpiAccount<'info, TokenAccount>,

    // User.
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
        seeds = [
            owner.to_account_info().key.as_ref(),
            pool.to_account_info().key.as_ref(),
            &[user.nonce],
        ],
    )]
    user: ProgramAccount<'info, User>,
    #[account(signer)]
    owner: AccountInfo<'info>,
    #[account(mut,
        constraint = reward_a_account.mint == *reward_a_mint.to_account_info().key,
        constraint = reward_a_account.owner == *owner.key
    )]
    reward_a_account: CpiAccount<'info, TokenAccount>,
    #[account(mut,
        constraint = reward_b_account.mint == *reward_b_mint.to_account_info().key,
        constraint = reward_b_account.owner == *owner.key
    )]
    reward_b_account: CpiAccount<'info, TokenAccount>,

    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref(),
            &[pool.nonce],
        ],
    )]
    pool_signer: AccountInfo<'info>,

    // Misc.
    clock: Sysvar<'info, Clock>,
    #[account(address = token::ID)]
    token_program: AccountInfo<'info>,
}

#[account]
#[derive(Default)]
pub struct ProgramConfig {
    pub authority_mint: Pubkey,
}

#[account]
#[derive(Default)]
pub struct Pool {
    /// Priviledged account.
    pub authority: Pubkey,
    /// Nonce to derive the program-derived address owning the vaults.
    pub nonce: u8,
    /// Paused state of the program
    pub paused: bool,
    /// Mint of the token that can be staked.
    pub staking_mint: Pubkey,
    /// Vault to store staked tokens.
    pub staking_vault: Pubkey,
    /// Mint of the reward A token.
    pub reward_a_mint: Pubkey,
    /// Vault to store reward A tokens.
    pub reward_a_vault: Pubkey,
    /// Mint of the reward A token.
    pub reward_b_mint: Pubkey,
    /// Vault to store reward B tokens.
    pub reward_b_vault: Pubkey,
    /// The period which rewards are linearly distributed.
    pub reward_duration: u64,
    /// The timestamp at which the current reward period ends.
    pub reward_duration_end: u64,
    /// The last time reward states were updated.
    pub last_update_time: u64,
    /// Rate of reward A distribution.
    pub reward_a_rate: u64,
    /// Rate of reward B distribution.
    pub reward_b_rate: u64,
    /// Last calculated reward A per pool token.
    pub reward_a_per_token_stored: u64,
    /// Last calculated reward B per pool token.
    pub reward_b_per_token_stored: u64,
}

#[account]
#[derive(Default)]
pub struct User {
    /// Pool the this user belongs to.
    pub pool: Pubkey,
    /// The owner of this account.
    pub owner: Pubkey,
    /// The amount of token A claimed.
    pub reward_a_per_token_complete: u64,
    /// The amount of token B claimed.
    pub reward_b_per_token_complete: u64,
    /// The amount of token A pending claim.
    pub reward_a_per_token_pending: u64,
    /// The amount of token B pending claim.
    pub reward_b_per_token_pending: u64,
    /// The amount staked.
    pub balance_staked: u64,
    /// Signer nonce.
    pub nonce: u8,
}

#[error]
pub enum ErrorCode {
    #[msg("The pool is paused.")]
    PoolPaused,
    #[msg("The nonce given doesn't derive a valid program address.")]
    InvalidNonce,
    #[msg("User signer doesn't match the derived address.")]
    InvalidUserSigner,
    #[msg("An unknown error has occured.")]
    Unknown,
    #[msg("Invalid mint supplied.")]
    InvalidMint,
    #[msg("Invalid config supplied.")]
    InvalidConfig,
    #[msg("Please specify the correct authority for this program.")]
    InvalidProgramAuthority,
    #[msg("Insufficient funds to unstake.")]
    InsufficientFundUnstake,
    #[msg("Amount must be greater than zero.")]
    AmountMustBeGreaterThanZero,
    #[msg("Program already initialized.")]
    ProgramAlreadyInitialized,
}
