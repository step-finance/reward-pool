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
        CliCommand::CreateUser { staking_mint, base } => {
            create_user(&program, &payer, &staking_mint, &base)?;
        }
        CliCommand::Pause { staking_mint, base } => {
            pause(&program, &payer, &staking_mint, &base)?;
        }
        CliCommand::Unpause { staking_mint, base } => {
            unpause(&program, &payer, &staking_mint, &base)?;
        }
        CliCommand::Stake {
            staking_mint,
            base,
            amount,
        } => {
            stake(&program, &payer, &staking_mint, &base, amount)?;
        }
        CliCommand::Unstake {
            staking_mint,
            base,
            spt_amount,
        } => {
            unstake(&program, &payer, &staking_mint, &base, spt_amount)?;
        }
        CliCommand::Authorize {
            staking_mint,
            base,
            funder,
        } => {
            authorize_funder(&program, &payer, &staking_mint, &base, &funder)?;
        }
        CliCommand::Deauthorize {
            staking_mint,
            base,
            funder,
        } => {
            deauthorize_funder(&program, &payer, &staking_mint, &base, &funder)?;
        }
        CliCommand::Fund {
            staking_mint,
            base,
            amount_a,
            amount_b,
        } => {
            fund(&program, &payer, &staking_mint, &base, amount_a, amount_b)?;
        }
        CliCommand::Claim { staking_mint, base } => {
            claim(&program, &payer, &staking_mint, &base)?;
        }
        CliCommand::CloseUser { staking_mint, base } => {
            close_user(&program, &payer, &staking_mint, &base)?;
        }
        CliCommand::ClosePool { staking_mint, base } => {
            close_pool(&program, &payer, &staking_mint, &base)?;
        }
        CliCommand::ShowInfo { staking_mint, base } => {
            show_info(&program, &staking_mint, &base)?;
        }
        CliCommand::StakeInfo { staking_mint, base } => {
            stake_info(&program, &staking_mint, &base, &payer.pubkey())?;
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
    let pool_pda = get_pool_pda(&program, &staking_mint, &base_pubkey)?;

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

pub fn create_user(
    program: &Program,
    owner: &Keypair,
    staking_mint: &Pubkey,
    base: &Pubkey,
) -> Result<()> {
    let pool_pda = get_pool_pda(&program, &staking_mint, &base)?;
    let UserPDA { user } = get_user_pda(&pool_pda.pubkey, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;
    let builder = program
        .request()
        .accounts(dual_farming::accounts::CreateUser {
            pool: pool_pda.pubkey,
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

pub fn pause(
    program: &Program,
    authority: &Keypair,
    staking_mint: &Pubkey,
    base: &Pubkey,
) -> Result<()> {
    let pool_pda = get_pool_pda(&program, &staking_mint, &base)?;
    let builder = program
        .request()
        .accounts(dual_farming::accounts::Pause {
            pool: pool_pda.pubkey,
            authority: authority.pubkey(),
        })
        .args(dual_farming::instruction::Pause {})
        .signer(authority);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn unpause(
    program: &Program,
    authority: &Keypair,
    staking_mint: &Pubkey,
    base: &Pubkey,
) -> Result<()> {
    let pool_pda = get_pool_pda(&program, &staking_mint, &base)?;
    let builder = program
        .request()
        .accounts(dual_farming::accounts::Unpause {
            pool: pool_pda.pubkey,
            authority: authority.pubkey(),
        })
        .args(dual_farming::instruction::Unpause {})
        .signer(authority);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn stake(
    program: &Program,
    owner: &Keypair,
    staking_mint: &Pubkey,
    base: &Pubkey,
    amount: u64,
) -> Result<()> {
    let pool_pda = get_pool_pda(&program, &staking_mint, &base)?;
    let pool = get_pool(program, pool_pda.pubkey)?;
    let UserPDA { user } = get_user_pda(&pool_pda.pubkey, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;

    let stake_from_account = get_or_create_ata(&program, &owner.pubkey(), &pool.staking_mint)?;

    let builder = program
        .request()
        .accounts(dual_farming::accounts::Stake {
            pool: pool_pda.pubkey,
            staking_vault: pool.staking_vault,
            stake_from_account,
            user: user_pubkey,
            owner: owner.pubkey(),
            token_program: spl_token::ID,
        })
        .args(dual_farming::instruction::Stake { amount })
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

pub fn unstake(
    program: &Program,
    owner: &Keypair,
    staking_mint: &Pubkey,
    base: &Pubkey,
    spt_amount: u64,
) -> Result<()> {
    let pool_pda = get_pool_pda(&program, &staking_mint, &base)?;
    let pool = get_pool(program, pool_pda.pubkey)?;
    let UserPDA { user } = get_user_pda(&pool_pda.pubkey, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;
    let stake_from_account = get_or_create_ata(&program, &owner.pubkey(), &pool.staking_mint)?;

    let builder = program
        .request()
        .accounts(dual_farming::accounts::Stake {
            pool: pool_pda.pubkey,
            staking_vault: pool.staking_vault,
            user: user_pubkey,
            stake_from_account,
            owner: owner.pubkey(),
            token_program: spl_token::ID,
        })
        .args(dual_farming::instruction::Unstake { spt_amount })
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

pub fn authorize_funder(
    program: &Program,
    authority: &Keypair,
    staking_mint: &Pubkey,
    base: &Pubkey,
    funder_to_add: &Pubkey,
) -> Result<()> {
    let pool_pda = get_pool_pda(&program, &staking_mint, &base)?;
    let builder = program
        .request()
        .accounts(dual_farming::accounts::FunderChange {
            pool: pool_pda.pubkey,
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
    staking_mint: &Pubkey,
    base: &Pubkey,
    funder_to_remove: &Pubkey,
) -> Result<()> {
    let pool_pda = get_pool_pda(&program, &staking_mint, &base)?;
    let builder = program
        .request()
        .accounts(dual_farming::accounts::FunderChange {
            pool: pool_pda.pubkey,
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
    staking_mint: &Pubkey,
    base: &Pubkey,
    amount_a: u64,
    amount_b: u64,
) -> Result<()> {
    let pool_pda = get_pool_pda(&program, &staking_mint, &base)?;
    let pool = get_pool(program, pool_pda.pubkey)?;
    let from_a = get_or_create_ata(&program, &funder.pubkey(), &pool.reward_a_mint)?;
    let from_b = get_or_create_ata(&program, &funder.pubkey(), &pool.reward_b_mint)?;
    let builder = program
        .request()
        .accounts(dual_farming::accounts::Fund {
            pool: pool_pda.pubkey,
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

pub fn claim(
    program: &Program,
    owner: &Keypair,
    staking_mint: &Pubkey,
    base: &Pubkey,
) -> Result<()> {
    let pool_pda = get_pool_pda(&program, &staking_mint, &base)?;
    let pool = get_pool(program, pool_pda.pubkey)?;
    let UserPDA { user } = get_user_pda(&pool_pda.pubkey, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;

    let reward_a_account = get_or_create_ata(&program, &owner.pubkey(), &pool.reward_a_mint)?;
    let reward_b_account = get_or_create_ata(&program, &owner.pubkey(), &pool.reward_b_mint)?;

    let builder = program
        .request()
        .accounts(dual_farming::accounts::ClaimReward {
            pool: pool_pda.pubkey,
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

pub fn close_user(
    program: &Program,
    owner: &Keypair,
    staking_mint: &Pubkey,
    base: &Pubkey,
) -> Result<()> {
    let pool_pda = get_pool_pda(&program, &staking_mint, &base)?;
    let UserPDA { user } = get_user_pda(&pool_pda.pubkey, &owner.pubkey(), &program.id());
    let (user_pubkey, _) = user;

    let builder = program
        .request()
        .accounts(dual_farming::accounts::CloseUser {
            pool: pool_pda.pubkey,
            user: user_pubkey,
            owner: owner.pubkey(),
        })
        .args(dual_farming::instruction::Claim {})
        .signer(owner);
    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

pub fn close_pool(
    program: &Program,
    authority: &Keypair,
    staking_mint: &Pubkey,
    base: &Pubkey,
) -> Result<()> {
    let pool_pda = get_pool_pda(&program, &staking_mint, &base)?;
    let pool = get_pool(program, pool_pda.pubkey)?;
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
            pool: pool_pda.pubkey,
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

pub fn show_info(program: &Program, staking_mint: &Pubkey, base: &Pubkey) -> Result<()> {
    let pda = get_pool_pda(&program, &staking_mint, base)?;
    let pool = get_pool(program, pda.pubkey)?;
    println!("pool_pubkey {:#?}", pda.pubkey);
    println!("user_stake_count {:#?}", pool.user_stake_count);
    println!("staking_vault {:#?}", pool.staking_vault);

    Ok(())
}

pub fn stake_info(
    program: &Program,
    staking_mint: &Pubkey,
    base: &Pubkey,
    user: &Pubkey,
) -> Result<()> {
    let pool_pda = get_pool_pda(&program, &staking_mint, &base)?;
    let UserPDA { user } = get_user_pda(&pool_pda.pubkey, &user, &program.id());
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
