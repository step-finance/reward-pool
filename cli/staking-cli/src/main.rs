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
            reward_mint,
            reward_duration,
            funding_amount,
        } => {
            initialize_pool(
                &program,
                &payer,
                &staking_mint,
                &reward_mint,
                reward_duration,
                funding_amount,
            )?;
        }
        CliCommand::ActivateFarming { pool_pubkey } => {
            activate_farming(&program, &payer, &pool_pubkey)?;
        }
        CliCommand::CreateUser { pool_pubkey } => {
            create_user(&program, &payer, &pool_pubkey)?;
        }
        CliCommand::Stake {
            pool_pubkey,
            amount,
        } => {
            stake(&program, &payer, &pool_pubkey, amount)?;
        }
        CliCommand::Unstake {
            pool_pubkey,
            spt_amount,
        } => {
            unstake(&program, &payer, &pool_pubkey, spt_amount)?;
        }
        CliCommand::Claim { pool_pubkey } => {
            claim(&program, &payer, &pool_pubkey)?;
        }
        CliCommand::CloseUser { pool_pubkey } => {
            close_user(&program, &payer, &pool_pubkey)?;
        }
        CliCommand::ShowInfo { pool_pubkey } => {
            show_info(&program, &pool_pubkey)?;
        }
        CliCommand::StakeInfo { pool_pubkey } => {
            stake_info(&program, &pool_pubkey, &payer.pubkey())?;
        }
    }
    Ok(())
}

fn initialize_pool(
    program: &Program,
    admin: &Keypair,
    staking_mint: &Pubkey,
    reward_mint: &Pubkey,
    reward_duration: u64,
    funding_amount: u64,
) -> Result<()> {
    let pool_keypair = Keypair::new();
    let pool_pubkey = pool_keypair.pubkey();
    print!("pool_pubkey {}", pool_pubkey);

    let VaultPDAs {
        staking_vault,
        reward_vault,
    } = get_vault_pdas(&program.id(), &pool_pubkey);
    let (staking_vault_pubkey, _) = staking_vault;
    let (reward_vault_pubkey, _) = reward_vault;

    let builder = program
        .request()
        .accounts(staking::accounts::InitializePool {
            pool: pool_pubkey,
            staking_mint: *staking_mint,
            staking_vault: staking_vault_pubkey,
            reward_mint: *reward_mint,
            reward_vault: reward_vault_pubkey,
            admin: admin.pubkey(),
            system_program: solana_program::system_program::ID,
            token_program: spl_token::ID,
            rent: solana_program::sysvar::rent::ID,
        })
        .args(staking::instruction::InitializePool {
            reward_duration,
            funding_amount,
        })
        .signer(admin)
        .signer(&pool_keypair);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn activate_farming(program: &Program, admin: &Keypair, pool_pubkey: &Pubkey) -> Result<()> {
    let builder = program
        .request()
        .accounts(staking::accounts::ActivateFarming {
            pool: *pool_pubkey,
            admin: admin.pubkey(),
        })
        .args(staking::instruction::ActivateFarming {})
        .signer(admin);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn create_user(program: &Program, owner: &Keypair, pool_pubkey: &Pubkey) -> Result<()> {
    let UserPDA { user } = get_user_pda(pool_pubkey, &owner.pubkey(), &program.id());
    let (user_pubkey, _nonce) = user;
    let builder = program
        .request()
        .accounts(staking::accounts::CreateUser {
            pool: *pool_pubkey,
            user: user_pubkey,
            owner: owner.pubkey(),
            system_program: solana_program::system_program::ID,
        })
        .args(staking::instruction::CreateUser {})
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn stake(program: &Program, owner: &Keypair, pool_pubkey: &Pubkey, amount: u64) -> Result<()> {
    let pool = get_pool(program, *pool_pubkey)?;
    let UserPDA { user } = get_user_pda(pool_pubkey, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;

    let stake_from_account = get_or_create_ata(&program, &owner.pubkey(), &pool.staking_mint)?;

    let builder = program
        .request()
        .accounts(staking::accounts::DepositOrWithdraw {
            pool: *pool_pubkey,
            staking_vault: pool.staking_vault,
            stake_from_account,
            user: user_pubkey,
            owner: owner.pubkey(),
            token_program: spl_token::ID,
        })
        .args(staking::instruction::Deposit { amount })
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

pub fn unstake(
    program: &Program,
    owner: &Keypair,
    pool_pubkey: &Pubkey,
    spt_amount: u64,
) -> Result<()> {
    let pool = get_pool(program, *pool_pubkey)?;
    let UserPDA { user } = get_user_pda(pool_pubkey, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;
    let stake_from_account = get_or_create_ata(&program, &owner.pubkey(), &pool.staking_mint)?;

    let builder = program
        .request()
        .accounts(staking::accounts::DepositOrWithdraw {
            pool: *pool_pubkey,
            staking_vault: pool.staking_vault,
            user: user_pubkey,
            stake_from_account,
            owner: owner.pubkey(),
            token_program: spl_token::ID,
        })
        .args(staking::instruction::Withdraw { spt_amount })
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

pub fn claim(program: &Program, owner: &Keypair, pool_pubkey: &Pubkey) -> Result<()> {
    let pool = get_pool(program, *pool_pubkey)?;
    let UserPDA { user } = get_user_pda(pool_pubkey, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;

    let reward_account = get_or_create_ata(&program, &owner.pubkey(), &pool.reward_mint)?;

    let builder = program
        .request()
        .accounts(staking::accounts::ClaimReward {
            pool: *pool_pubkey,
            staking_vault: pool.staking_vault,
            reward_vault: pool.reward_vault,
            user: user_pubkey,
            owner: owner.pubkey(),
            reward_account,
            token_program: spl_token::ID,
        })
        .args(staking::instruction::Claim {})
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn close_user(program: &Program, owner: &Keypair, pool_pubkey: &Pubkey) -> Result<()> {
    let UserPDA { user } = get_user_pda(pool_pubkey, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;

    let builder = program
        .request()
        .accounts(staking::accounts::CloseUser {
            pool: *pool_pubkey,
            user: user_pubkey,
            owner: owner.pubkey(),
        })
        .args(staking::instruction::Claim {})
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn show_info(program: &Program, pool_pubkey: &Pubkey) -> Result<()> {
    let pool = get_pool(program, *pool_pubkey)?;

    println!("{:?}", pool);

    Ok(())
}

pub fn stake_info(program: &Program, pool_pubkey: &Pubkey, user: &Pubkey) -> Result<()> {
    let UserPDA { user } = get_user_pda(pool_pubkey, &user, &program.id());
    let (user_pubkey, _) = user;
    let user = get_user(&program, user_pubkey)?;
    println!("balance_staked {:#?}", user.balance_staked);
    println!(
        "reward_per_token_complete {:#?}",
        user.reward_per_token_complete
    );
    println!(
        "reward_per_token_pending {:#?}",
        user.reward_per_token_pending
    );
    Ok(())
}
