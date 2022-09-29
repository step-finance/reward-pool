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
            xmer_reward_mint,
            jup_reward_duration,
            jup_funding_amount,
            xmer_reward_duration,
        } => {
            initialize_pool(
                &program,
                &payer,
                &staking_mint,
                &xmer_reward_mint,
                jup_reward_duration,
                jup_funding_amount,
                xmer_reward_duration,
            )?;
        }
        CliCommand::ActivateFarming { pool_pubkey } => {
            activate_farming(&program, &payer, &pool_pubkey)?;
        }
        CliCommand::SetJupInformation {
            pool_pubkey,
            jup_mint,
        } => {
            set_jup_information(&program, &payer, &pool_pubkey, &jup_mint)?;
        }
        CliCommand::Authorize { pool, funder } => {
            authorize_funder(&program, &payer, &pool, &funder)?;
        }
        CliCommand::Deauthorize { pool, funder } => {
            deauthorize_funder(&program, &payer, &pool, &funder)?;
        }
        CliCommand::FundXmer { pool, amount } => {
            fund_xmer(&program, &payer, &pool, amount)?;
        }
        CliCommand::FundJup { pool, amount } => {
            fund_jup(&program, &payer, &pool, amount)?;
        }
        CliCommand::CreateUser { pool_pubkey } => {
            create_user(&program, &payer, &pool_pubkey)?;
        }
        CliCommand::DepositFull { pool_pubkey } => {
            deposit_full(&program, &payer, &pool_pubkey)?;
        }
        CliCommand::Deposit {
            pool_pubkey,
            amount,
        } => {
            deposit(&program, &payer, &pool_pubkey, amount)?;
        }
        CliCommand::Withdraw {
            pool_pubkey,
            spt_amount,
        } => {
            withdraw(&program, &payer, &pool_pubkey, spt_amount)?;
        }
        CliCommand::ClaimXmer { pool_pubkey } => {
            claim_xmer(&program, &payer, &pool_pubkey)?;
        }
        CliCommand::ClaimJup { pool_pubkey } => {
            claim_jup(&program, &payer, &pool_pubkey)?;
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
    xmer_reward_mint: &Pubkey,
    jup_reward_duration: u64,
    jup_funding_amount: u64,
    xmer_reward_duration: u64,
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

    let (xmer_reward_vault_pubkey, _) = Pubkey::find_program_address(
        &[b"xmer_reward_vault".as_ref(), pool_pubkey.as_ref()],
        &staking::id(),
    );

    let builder = program
        .request()
        .accounts(staking::accounts::InitializePool {
            pool: pool_pubkey,
            staking_mint: *staking_mint,
            staking_vault: staking_vault_pubkey,
            xmer_reward_mint: *xmer_reward_mint,
            xmer_reward_vault: xmer_reward_vault_pubkey,
            admin: admin.pubkey(),
            system_program: solana_program::system_program::ID,
            token_program: spl_token::ID,
            rent: solana_program::sysvar::rent::ID,
        })
        .args(staking::instruction::InitializePool {
            jup_reward_duration,
            jup_funding_amount,
            xmer_reward_duration,
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
        .accounts(staking::accounts::ActivateJupFarming {
            pool: *pool_pubkey,
            admin: admin.pubkey(),
        })
        .args(staking::instruction::ActivateJupFarming {})
        .signer(admin);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}
pub fn set_jup_information(
    program: &Program,
    admin: &Keypair,
    pool_pubkey: &Pubkey,
    jup_mint: &Pubkey,
) -> Result<()> {
    let pool = get_pool(program, *pool_pubkey)?;

    let (jup_reward_vault, _) = Pubkey::find_program_address(
        &[b"jup_reward_vault".as_ref(), pool_pubkey.as_ref()],
        &staking::id(),
    );

    let builder = program
        .request()
        .accounts(staking::accounts::SetJupInformation {
            pool: *pool_pubkey,
            staking_vault: pool.staking_vault,
            jup_reward_mint: *jup_mint,
            jup_reward_vault: jup_reward_vault,
            admin: admin.pubkey(),
            system_program: solana_program::system_program::ID,
            token_program: spl_token::ID,
            rent: solana_program::sysvar::rent::ID,
        })
        .args(staking::instruction::SetJupInformation {})
        .signer(admin);
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
        .accounts(staking::accounts::FunderChange {
            pool: *pool,
            admin: authority.pubkey(),
        })
        .args(staking::instruction::AuthorizeFunder {
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
        .accounts(staking::accounts::FunderChange {
            pool: *pool,
            admin: authority.pubkey(),
        })
        .args(staking::instruction::DeauthorizeFunder {
            funder_to_remove: *funder_to_remove,
        })
        .signer(authority);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn fund_xmer(
    program: &Program,
    funder: &Keypair,
    pool_pda: &Pubkey,
    amount: u64,
) -> Result<()> {
    let pool = get_pool(program, *pool_pda)?;
    let from_xmer = get_or_create_ata(&program, &funder.pubkey(), &pool.xmer_reward_mint)?;
    let builder = program
        .request()
        .accounts(staking::accounts::FundXMer {
            pool: *pool_pda,
            staking_vault: pool.staking_vault,
            xmer_reward_vault: pool.xmer_reward_vault,
            funder: funder.pubkey(),
            from_xmer,
            token_program: spl_token::ID,
        })
        .args(staking::instruction::FundXmer { amount })
        .signer(funder);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}
pub fn fund_jup(program: &Program, funder: &Keypair, pool_pda: &Pubkey, amount: u64) -> Result<()> {
    let pool = get_pool(program, *pool_pda)?;
    let from_jup = get_or_create_ata(&program, &funder.pubkey(), &pool.jup_reward_mint)?;
    let builder = program
        .request()
        .accounts(staking::accounts::FundJup {
            pool: *pool_pda,
            jup_reward_vault: pool.jup_reward_vault,
            funder: funder.pubkey(),
            from_jup,
            token_program: spl_token::ID,
        })
        .args(staking::instruction::FundJup { amount })
        .signer(funder);
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

pub fn deposit_full(program: &Program, owner: &Keypair, pool_pubkey: &Pubkey) -> Result<()> {
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
        .args(staking::instruction::DepositFull {})
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

pub fn deposit(
    program: &Program,
    owner: &Keypair,
    pool_pubkey: &Pubkey,
    amount: u64,
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

pub fn withdraw(
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

pub fn claim_xmer(program: &Program, owner: &Keypair, pool_pubkey: &Pubkey) -> Result<()> {
    let pool = get_pool(program, *pool_pubkey)?;
    let UserPDA { user } = get_user_pda(pool_pubkey, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;

    let xmer_reward_account = get_or_create_ata(&program, &owner.pubkey(), &pool.xmer_reward_mint)?;

    let builder = program
        .request()
        .accounts(staking::accounts::ClaimXMerReward {
            pool: *pool_pubkey,
            staking_vault: pool.staking_vault,
            xmer_reward_vault: pool.xmer_reward_vault,
            user: user_pubkey,
            owner: owner.pubkey(),
            xmer_reward_account,
            token_program: spl_token::ID,
        })
        .args(staking::instruction::ClaimXmer {})
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}
pub fn claim_jup(program: &Program, owner: &Keypair, pool_pubkey: &Pubkey) -> Result<()> {
    let pool = get_pool(program, *pool_pubkey)?;
    let UserPDA { user } = get_user_pda(pool_pubkey, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;

    let jup_reward_account = get_or_create_ata(&program, &owner.pubkey(), &pool.jup_reward_mint)?;

    let builder = program
        .request()
        .accounts(staking::accounts::ClaimJupReward {
            pool: *pool_pubkey,
            staking_vault: pool.staking_vault,
            jup_reward_vault: pool.jup_reward_vault,
            user: user_pubkey,
            owner: owner.pubkey(),
            jup_reward_account,
            token_program: spl_token::ID,
        })
        .args(staking::instruction::ClaimJup {})
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
        .args(staking::instruction::CloseUser {})
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
    println!("user {:#?}", user);
    Ok(())
}
