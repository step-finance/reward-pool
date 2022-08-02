mod args;
mod utils;

use crate::args::*;
use crate::utils::*;
use anyhow::Result;

use anchor_client::solana_sdk::commitment_config::CommitmentConfig;
use anchor_client::solana_sdk::pubkey::Pubkey;
use anchor_client::solana_sdk::signer::keypair::*;
use anchor_client::solana_sdk::signer::Signer;
use anchor_client::{Client, Program};
use std::rc::Rc;
use std::str::FromStr;

use clap::*;

fn main() -> Result<()> {
    let opts = Opts::parse();
    let payer =
        read_keypair_file(opts.config_override.wallet_path).expect("Wallet keypair file not found");
    let wallet = payer.pubkey();

    println!("Wallet {:#?}", wallet);
    println!("Program ID: {:#?}", opts.config_override.program_id);

    let program_id = Pubkey::from_str(opts.config_override.program_id.as_str())?;
    let client = Client::new_with_options(
        opts.config_override.cluster,
        Rc::new(Keypair::from_bytes(&payer.to_bytes())?),
        CommitmentConfig::finalized(),
    );
    let program = client.program(program_id);
    match opts.command {
        CliCommand::Init {
            staking_mint,
            reward_a_mint,
            reward_b_mint,
            reward_duration,
        } => {
            initialize_pool(
                &program,
                &payer,
                &staking_mint,
                &reward_a_mint,
                &reward_b_mint,
                reward_duration,
            )?;
        }
        CliCommand::CreateUser { pool } => {
            create_user(&program, &payer, &pool)?;
        }
        CliCommand::Pause { pool } => {
            pause(&program, &payer, &pool)?;
        }
        CliCommand::Unpause { pool } => {
            unpause(&program, &payer, &pool)?;
        }
        CliCommand::Deposit { pool, amount } => {
            stake(&program, &payer, &pool, amount)?;
        }
        CliCommand::Withdraw { pool, spt_amount } => {
            unstake(&program, &payer, &pool, spt_amount)?;
        }
        CliCommand::Authorize { pool, funder } => {
            authorize_funder(&program, &payer, &pool, &funder)?;
        }
        CliCommand::Deauthorize { pool, funder } => {
            deauthorize_funder(&program, &payer, &pool, &funder)?;
        }
        CliCommand::Fund {
            pool,
            amount_a,
            amount_b,
        } => {
            fund(&program, &payer, &pool, amount_a, amount_b)?;
        }
        CliCommand::Claim { pool } => {
            claim(&program, &payer, &pool)?;
        }
        CliCommand::CloseUser { pool } => {
            close_user(&program, &payer, &pool)?;
        }
        CliCommand::ClosePool { pool } => {
            close_pool(&program, &payer, &pool)?;
        }
        CliCommand::ShowInfo { pool } => {
            show_info(&program, &pool)?;
        }
        CliCommand::StakeInfo { pool } => {
            stake_info(&program, &pool, &payer.pubkey())?;
        }
    }

    Ok(())
}

fn initialize_pool(
    program: &Program,
    authority: &Keypair,
    staking_mint: &Pubkey,
    reward_a_mint: &Pubkey,
    reward_b_mint: &Pubkey,
    reward_duration: u64,
) -> Result<()> {
    let base_keypair = Keypair::new();
    let base_pubkey = base_keypair.pubkey();
    println!("base pubkey {}", base_pubkey);
    let pool_pda = get_pool_pda(
        &program,
        reward_duration,
        &staking_mint,
        reward_a_mint,
        reward_b_mint,
        &base_pubkey,
    )?;

    let VaultPDAs {
        staking_vault,
        reward_a_vault,
        reward_b_vault,
    } = get_vault_pdas(&program.id(), &pool_pda.pubkey);
    let (staking_vault_pubkey, _) = staking_vault;
    let (reward_a_vault_pubkey, _) = reward_a_vault;
    let (reward_b_vault_pubkey, _) = reward_b_vault;

    let builder = program
        .request()
        .accounts(dual_farming::accounts::InitializePool {
            pool: pool_pda.pubkey,
            staking_mint: *staking_mint,
            staking_vault: staking_vault_pubkey,
            reward_a_mint: *reward_a_mint,
            reward_a_vault: reward_a_vault_pubkey,
            reward_b_mint: *reward_b_mint,
            reward_b_vault: reward_b_vault_pubkey,
            authority: authority.pubkey(),
            base: base_pubkey,
            system_program: solana_program::system_program::ID,
            token_program: spl_token::ID,
            rent: solana_program::sysvar::rent::ID,
        })
        .args(dual_farming::instruction::InitializePool { reward_duration })
        .signer(authority)
        .signer(&base_keypair);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn create_user(program: &Program, owner: &Keypair, pool: &Pubkey) -> Result<()> {
    let UserPDA { user } = get_user_pda(pool, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;
    let builder = program
        .request()
        .accounts(dual_farming::accounts::CreateUser {
            pool: *pool,
            user: user_pubkey,
            owner: owner.pubkey(),
            system_program: solana_program::system_program::ID,
        })
        .args(dual_farming::instruction::CreateUser {})
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn pause(program: &Program, authority: &Keypair, pool: &Pubkey) -> Result<()> {
    let builder = program
        .request()
        .accounts(dual_farming::accounts::Pause {
            pool: *pool,
            authority: authority.pubkey(),
        })
        .args(dual_farming::instruction::Pause {})
        .signer(authority);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn unpause(program: &Program, authority: &Keypair, pool: &Pubkey) -> Result<()> {
    let builder = program
        .request()
        .accounts(dual_farming::accounts::Unpause {
            pool: *pool,
            authority: authority.pubkey(),
        })
        .args(dual_farming::instruction::Unpause {})
        .signer(authority);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn stake(program: &Program, owner: &Keypair, pool_pda: &Pubkey, amount: u64) -> Result<()> {
    let pool = get_pool(program, *pool_pda)?;
    let UserPDA { user } = get_user_pda(pool_pda, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;

    let stake_from_account = get_or_create_ata(&program, &owner.pubkey(), &pool.staking_mint)?;

    let builder = program
        .request()
        .accounts(dual_farming::accounts::Deposit {
            pool: *pool_pda,
            staking_vault: pool.staking_vault,
            stake_from_account,
            user: user_pubkey,
            owner: owner.pubkey(),
            token_program: spl_token::ID,
        })
        .args(dual_farming::instruction::Deposit { amount })
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

pub fn unstake(
    program: &Program,
    owner: &Keypair,
    pool_pda: &Pubkey,
    spt_amount: u64,
) -> Result<()> {
    let pool = get_pool(program, *pool_pda)?;
    let UserPDA { user } = get_user_pda(pool_pda, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;
    let stake_from_account = get_or_create_ata(&program, &owner.pubkey(), &pool.staking_mint)?;

    let builder = program
        .request()
        .accounts(dual_farming::accounts::Deposit {
            pool: *pool_pda,
            staking_vault: pool.staking_vault,
            user: user_pubkey,
            stake_from_account,
            owner: owner.pubkey(),
            token_program: spl_token::ID,
        })
        .args(dual_farming::instruction::Withdraw { spt_amount })
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

pub fn authorize_funder(
    program: &Program,
    authority: &Keypair,
    pool: &Pubkey,
    funder_to_add: &Pubkey,
) -> Result<()> {
    let builder = program
        .request()
        .accounts(dual_farming::accounts::FunderChange {
            pool: *pool,
            authority: authority.pubkey(),
        })
        .args(dual_farming::instruction::AuthorizeFunder {
            funder_to_add: *funder_to_add,
        })
        .signer(authority);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn deauthorize_funder(
    program: &Program,
    authority: &Keypair,
    pool: &Pubkey,
    funder_to_remove: &Pubkey,
) -> Result<()> {
    let builder = program
        .request()
        .accounts(dual_farming::accounts::FunderChange {
            pool: *pool,
            authority: authority.pubkey(),
        })
        .args(dual_farming::instruction::DeauthorizeFunder {
            funder_to_remove: *funder_to_remove,
        })
        .signer(authority);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn fund(
    program: &Program,
    funder: &Keypair,
    pool_pda: &Pubkey,
    amount_a: u64,
    amount_b: u64,
) -> Result<()> {
    let pool = get_pool(program, *pool_pda)?;
    let from_a = get_or_create_ata(&program, &funder.pubkey(), &pool.reward_a_mint)?;
    let from_b = get_or_create_ata(&program, &funder.pubkey(), &pool.reward_b_mint)?;
    let builder = program
        .request()
        .accounts(dual_farming::accounts::Fund {
            pool: *pool_pda,
            staking_vault: pool.staking_vault,
            reward_a_vault: pool.reward_a_vault,
            reward_b_vault: pool.reward_b_vault,
            funder: funder.pubkey(),
            from_a,
            from_b,
            token_program: spl_token::ID,
        })
        .args(dual_farming::instruction::Fund { amount_a, amount_b })
        .signer(funder);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn claim(program: &Program, owner: &Keypair, pool_pda: &Pubkey) -> Result<()> {
    let pool = get_pool(program, *pool_pda)?;
    let UserPDA { user } = get_user_pda(pool_pda, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;

    let reward_a_account = get_or_create_ata(&program, &owner.pubkey(), &pool.reward_a_mint)?;
    let reward_b_account = get_or_create_ata(&program, &owner.pubkey(), &pool.reward_b_mint)?;

    let builder = program
        .request()
        .accounts(dual_farming::accounts::ClaimReward {
            pool: *pool_pda,
            staking_vault: pool.staking_vault,
            reward_a_vault: pool.reward_a_vault,
            reward_b_vault: pool.reward_b_vault,
            user: user_pubkey,
            owner: owner.pubkey(),
            reward_a_account,
            reward_b_account,
            token_program: spl_token::ID,
        })
        .args(dual_farming::instruction::Claim {})
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn close_user(program: &Program, owner: &Keypair, pool_pda: &Pubkey) -> Result<()> {
    let UserPDA { user } = get_user_pda(pool_pda, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;

    let builder = program
        .request()
        .accounts(dual_farming::accounts::CloseUser {
            pool: *pool_pda,
            user: user_pubkey,
            owner: owner.pubkey(),
        })
        .args(dual_farming::instruction::Claim {})
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn close_pool(program: &Program, authority: &Keypair, pool_pda: &Pubkey) -> Result<()> {
    let pool = get_pool(program, *pool_pda)?;
    let staking_refundee = get_or_create_ata(&program, &authority.pubkey(), &pool.staking_mint)?;
    let reward_a_refundee = get_or_create_ata(&program, &authority.pubkey(), &pool.reward_a_mint)?;
    let reward_b_refundee = get_or_create_ata(&program, &authority.pubkey(), &pool.reward_b_mint)?;

    let builder = program
        .request()
        .accounts(dual_farming::accounts::ClosePool {
            refundee: authority.pubkey(),
            staking_refundee,
            reward_a_refundee,
            reward_b_refundee,
            pool: *pool_pda,
            authority: authority.pubkey(),
            staking_vault: pool.staking_vault,
            reward_a_vault: pool.reward_a_vault,
            reward_b_vault: pool.reward_b_vault,
            token_program: spl_token::ID,
        })
        .args(dual_farming::instruction::ClosePool {})
        .signer(authority);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn show_info(program: &Program, pool_pda: &Pubkey) -> Result<()> {
    let pool = get_pool(program, *pool_pda)?;
    println!("pool_pubkey {:#?}", pool_pda);
    println!("user_stake_count {:#?}", pool.user_stake_count);
    println!("staking_vault {:#?}", pool.staking_vault);

    Ok(())
}

pub fn stake_info(program: &Program, pool_pda: &Pubkey, user: &Pubkey) -> Result<()> {
    let UserPDA { user } = get_user_pda(pool_pda, &user, &program.id());
    let (user_pubkey, _) = user;
    let user = get_user(&program, user_pubkey)?;
    println!("balance_staked {:#?}", user.balance_staked);
    println!(
        "reward_a_per_token_complete {:#?}",
        user.reward_a_per_token_complete
    );
    println!(
        "reward_a_per_token_pending {:#?}",
        user.reward_a_per_token_pending
    );
    println!(
        "reward_b_per_token_complete {:#?}",
        user.reward_b_per_token_complete
    );
    println!(
        "reward_b_per_token_pending {:#?}",
        user.reward_b_per_token_pending
    );
    Ok(())
}
