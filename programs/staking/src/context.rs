use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;
use anchor_spl::token::{Mint, Token, TokenAccount};
use std::convert::TryInto;

/// Accounts for [InitializePool](/staking/instruction/struct.InitializePool.html) instruction
#[derive(Accounts)]
pub struct InitializePool<'info> {
    /// The farming pool PDA.
    #[account(
        init,
        payer = admin,
        space = 800 // 1 + 466 + buffer
    )]
    pub pool: Box<Account<'info, Pool>>,

    /// The staking vault PDA.
    #[account(
        init,
        seeds = [b"staking_vault".as_ref(), pool.key().as_ref()],
        bump,
        payer = admin,
        token::mint = staking_mint,
        token::authority = staking_vault,
    )]
    pub staking_vault: Box<Account<'info, TokenAccount>>,
    /// The staking Mint.
    pub staking_mint: Box<Account<'info, Mint>>,
    /// The xMER reward Mint.
    pub xmer_reward_mint: Box<Account<'info, Mint>>,
    /// The reward Vault PDA.
    #[account(
        init,
        seeds = [b"xmer_reward_vault".as_ref(), pool.key().as_ref()],
        bump,
        payer = admin,
        token::mint = xmer_reward_mint,
        token::authority = staking_vault,
    )]
    pub xmer_reward_vault: Box<Account<'info, TokenAccount>>,

    /// The authority of the pool   
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Token Program
    pub token_program: Program<'info, Token>,
    /// Rent
    pub rent: Sysvar<'info, Rent>,
    /// System program
    pub system_program: Program<'info, System>,
}

/// Accounts for [ActivateFarming](/staking/instruction/struct.ActivateFarming.html) instruction
#[derive(Accounts)]
pub struct ActivateJupFarming<'info> {
    #[account(
        mut,
        has_one = admin,
        constraint = pool.jup_last_update_time == 0 // only allow update 1 time
    )]
    /// The farming pool PDA.
    pub pool: Box<Account<'info, Pool>>,
    /// The admin of the pool
    pub admin: Signer<'info>,
}

/// Accounts for [SetJupInformation](/staking/instruction/struct.SetJupInformation.html) instruction
#[derive(Accounts)]
pub struct SetJupInformation<'info> {
    #[account(
        mut,
        has_one = admin,
        has_one = staking_vault,
        constraint = pool.jup_reward_end_timestamp != 0,
        constraint = pool.jup_reward_end_timestamp < sysvar::clock::Clock::get().unwrap().unix_timestamp.try_into().unwrap(), // user can only claim jup if farming is over
        constraint = pool.is_jup_info_enable == 0
    )]
    /// The farming pool PDA.
    pub pool: Box<Account<'info, Pool>>,
    /// staking vault of pool
    pub staking_vault: Box<Account<'info, TokenAccount>>,
    /// The xMER reward Mint.
    pub jup_reward_mint: Box<Account<'info, Mint>>,
    /// The reward Vault PDA.
    #[account(
         init,
         seeds = [b"jup_reward_vault".as_ref(), pool.key().as_ref()],
         bump,
         payer = admin,
         token::mint = jup_reward_mint,
         token::authority = staking_vault,
     )]
    pub jup_reward_vault: Box<Account<'info, TokenAccount>>,
    /// The admin of the pool
    #[account(mut)]
    pub admin: Signer<'info>,
    /// Token Program
    pub token_program: Program<'info, Token>,
    /// Rent
    pub rent: Sysvar<'info, Rent>,
    /// System program
    pub system_program: Program<'info, System>,
}

/// Accounts for [AuthorizeFunder](/dual_farming/instruction/struct.AuthorizeFunder.html)
/// and [DeauthorizeFunder](/dual_farming/instruction/struct.DeauthorizeFunder.html) instructions.
#[derive(Accounts)]
pub struct FunderChange<'info> {
    /// Global accounts for the staking instance.
    #[account(
        mut,
        has_one = admin,
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// Admin of the pool
    pub admin: Signer<'info>,
}

/// Accounts for [FundXMer](/staking/instruction/struct.FundXMer.html) instruction.
#[derive(Accounts)]
pub struct FundXMer<'info> {
    /// Global accounts for the staking instance.
    #[account(
        mut,
        has_one = staking_vault,
        has_one = xmer_reward_vault,
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// Staking vault PDA
    #[account(mut)]
    pub staking_vault: Box<Account<'info, TokenAccount>>,
    /// Reward xMER Vault PDA
    #[account(mut)]
    pub xmer_reward_vault: Box<Account<'info, TokenAccount>>,
    /// Funder
    #[account(
        //require signed funder auth - otherwise constant micro fund could hold funds hostage
        constraint = funder.key() == pool.admin || pool.funders.iter().any(|x| *x == funder.key()),
    )]
    pub funder: Signer<'info>,
    /// Funder reward xMER ATA
    #[account(mut)]
    pub from_xmer: Box<Account<'info, TokenAccount>>,
    /// Misc.
    pub token_program: Program<'info, Token>,
}

/// Accounts for [FundJup](/staking/instruction/struct.FundJup.html) instruction.
#[derive(Accounts)]
pub struct FundJup<'info> {
    /// Global accounts for the staking instance.
    #[account(
        mut,
        has_one = jup_reward_vault,
        constraint = pool.is_jup_info_enable != 0
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// Reward xMER Vault PDA
    #[account(mut)]
    pub jup_reward_vault: Box<Account<'info, TokenAccount>>,
    /// Funder
    #[account(
        //require signed funder auth - otherwise constant micro fund could hold funds hostage
        constraint = funder.key() == pool.admin || pool.funders.iter().any(|x| *x == funder.key()),
    )]
    pub funder: Signer<'info>,
    /// Funder reward xMER ATA
    #[account(mut)]
    pub from_jup: Box<Account<'info, TokenAccount>>,
    /// Misc.
    pub token_program: Program<'info, Token>,
}

/// Accounts for [CreateUser](/staking/instruction/struct.CreateUser.html) instruction
#[derive(Accounts)]
pub struct CreateUser<'info> {
    /// The farming pool PDA.
    pub pool: Box<Account<'info, Pool>>,
    /// User staking PDA.
    #[account(
        init,
        payer = owner,
        seeds = [
            owner.key.as_ref(),
            pool.key().as_ref()
        ],
        bump,
        space = 200 // 1 + 129 + buffer
    )]
    pub user: Box<Account<'info, User>>,
    /// The authority of user
    #[account(mut)]
    pub owner: Signer<'info>,
    /// System Program
    pub system_program: Program<'info, System>,
}

/// Accounts for [Deposit](/staking/instruction/struct.DepositOrWithdraw.html) instruction and [Withdraw](/staking/instruction/struct.Withdraw.html) instruction
#[derive(Accounts)]
pub struct DepositOrWithdraw<'info> {
    /// The farming pool PDA.
    #[account(
        mut,
        has_one = staking_vault,
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// The staking vault PDA.
    #[account(mut)]
    pub staking_vault: Box<Account<'info, TokenAccount>>,

    /// User staking PDA.
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
    )]
    pub user: Box<Account<'info, User>>,
    /// The authority of user
    pub owner: Signer<'info>,
    /// The user ATA
    #[account(mut)]
    pub stake_from_account: Box<Account<'info, TokenAccount>>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Accounts for [Claim](/staking/instruction/struct.ClaimXMerReward.html) instruction
#[derive(Accounts)]
pub struct ClaimXMerReward<'info> {
    /// The farming pool.
    #[account(
        mut,
        has_one = staking_vault,
        has_one = xmer_reward_vault,
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// The staking vault PDA.
    pub staking_vault: Box<Account<'info, TokenAccount>>,
    /// Vault of the pool, which store the xMER to be distributed
    #[account(mut)]
    pub xmer_reward_vault: Box<Account<'info, TokenAccount>>,

    /// User staking PDA.
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
    )]
    pub user: Box<Account<'info, User>>,
    /// The authority of user
    pub owner: Signer<'info>,
    /// User token account to receive xMER reward
    #[account(mut)]
    pub xmer_reward_account: Box<Account<'info, TokenAccount>>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Accounts for [ClaimJupReward](/staking/instruction/struct.Claim.html) instruction
#[derive(Accounts)]
pub struct ClaimJupReward<'info> {
    /// The farming pool PDA.
    #[account(
        mut,
        has_one = staking_vault,
        has_one = jup_reward_vault,
        constraint = pool.is_jup_info_enable != 0
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// The staking vault PDA.
    pub staking_vault: Box<Account<'info, TokenAccount>>,
    /// Vault of the pool, which store the xMER to be distributed
    #[account(mut)]
    pub jup_reward_vault: Box<Account<'info, TokenAccount>>,

    /// User staking PDA.
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
    )]
    pub user: Box<Account<'info, User>>,
    /// The authority of user
    pub owner: Signer<'info>,
    /// User token account to receive Jup reward
    #[account(mut)]
    pub jup_reward_account: Box<Account<'info, TokenAccount>>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

/// Accounts for [CloseUser](/staking/instruction/struct.CloseUser.html) instruction
#[derive(Accounts)]
pub struct CloseUser<'info> {
    /// The farming pool PDA.
    pub pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        close = owner,
        has_one = owner,
        has_one = pool,
        constraint = user.balance_staked == 0,
        constraint = user.total_jup_reward == user.jup_reward_harvested,
        constraint = user.xmer_reward_pending == 0,
        constraint = pool.is_jup_info_enable != 0
    )]
    /// User account to be close
    pub user: Account<'info, User>,
    /// Owner of the user account
    pub owner: Signer<'info>,
}

/// Accounts for [GetUserInfo](/staking/instruction/struct.GetUserInfo.html) instruction
#[derive(Accounts)]
pub struct GetUserInfo<'info> {
    /// The farming pool.
    #[account(mut)]
    pub pool: Box<Account<'info, Pool>>,

    /// User staking PDA.
    #[account(mut, has_one = pool,)]
    pub user: Box<Account<'info, User>>,
}
