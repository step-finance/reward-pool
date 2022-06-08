mod args;
mod utils;

use crate::args::*;
use crate::utils::*;
use anchor_client::solana_sdk::commitment_config::CommitmentConfig;
use anchor_client::solana_sdk::pubkey::Pubkey;
use anchor_client::solana_sdk::signer::keypair::*;
use anchor_client::solana_sdk::signer::Signer;
use anchor_client::{Client, Program};
use anyhow::Result;
use core::str::FromStr;
use solana_program::system_program;
use std::rc::Rc;

use clap::*;

const BASE_KEY: &str = "HWzXGcGHy4tcpYfaRDCyLNzXqBTv3E6BttpCH2vJxArv";

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
            token_mint,
            base_key_location,
        } => {
            initialize_vault(&program, &payer, &token_mint, base_key_location)?;
        }
        CliCommand::TransferAdmin {
            token_mint,
            new_admin_path,
        } => {
            let new_admin =
                read_keypair_file(new_admin_path).expect("Wallet keypair file not found");
            transfer_admin(&program, &token_mint, &payer, &new_admin)?;
        }
        CliCommand::ShowInfo { token_mint } => {
            show_vault_info(&program, &token_mint)?;
        }
        CliCommand::Stake { token_mint, amount } => {
            stake(&program, &token_mint, &payer, amount)?;
        }
        CliCommand::Reward { token_mint, amount } => {
            reward(&program, &token_mint, &payer, amount)?;
        }
        CliCommand::Unstake {
            token_mint,
            unmint_amount,
        } => {
            unstake(&program, &token_mint, &payer, unmint_amount)?;
        }
        CliCommand::UpdateLockedRewardDegradation {
            token_mint,
            locked_reward_degradation,
        } => {
            update_locked_reward_degradation(
                &program,
                &token_mint,
                &payer,
                locked_reward_degradation,
            )?;
        }
    }
    Ok(())
}

fn update_locked_reward_degradation(
    program: &Program,
    token_mint: &Pubkey,
    admin: &Keypair,
    locked_reward_degradation: u64,
) -> Result<()> {
    let base_pubkey = Pubkey::from_str(BASE_KEY)?;

    let VaultPdas {
        vault,
        token_vault: _,
        lp_mint: _,
    } = get_vault_pdas(&base_pubkey, &token_mint, &program.id());

    let (vault_pubkey, _) = vault;

    let builder = program
        .request()
        .accounts(staking::accounts::UpdateLockedRewardDegradation {
            vault: vault_pubkey,
            admin: admin.pubkey(),
        })
        .args(staking::instruction::UpdateLockedRewardDegradation {
            locked_reward_degradation,
        })
        .signer(admin);

    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

fn unstake(
    program: &Program,
    token_mint: &Pubkey,
    payer: &Keypair,
    unmint_amount: u64,
) -> Result<()> {
    let base_pubkey = Pubkey::from_str(BASE_KEY)?;

    let VaultPdas {
        vault,
        token_vault,
        lp_mint,
    } = get_vault_pdas(&base_pubkey, &token_mint, &program.id());

    let (vault_pubkey, _) = vault;
    let (token_vault_pubkey, _) = token_vault;
    let (lp_mint_pubkey, _) = lp_mint;

    let user_lp = get_or_create_ata(&program, &payer.pubkey(), &lp_mint_pubkey)?;
    let user_token = get_or_create_ata(&program, &payer.pubkey(), &token_mint)?;

    let builder = program
        .request()
        .accounts(staking::accounts::Stake {
            lp_mint: lp_mint_pubkey,
            token_program: spl_token::ID,
            vault: vault_pubkey,
            user_transfer_authority: payer.pubkey(),
            token_vault: token_vault_pubkey,
            user_lp,
            user_token,
        })
        .args(staking::instruction::Unstake { unmint_amount })
        .signer(payer);

    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

fn reward(program: &Program, token_mint: &Pubkey, payer: &Keypair, amount: u64) -> Result<()> {
    let base_pubkey = Pubkey::from_str(BASE_KEY)?;

    let VaultPdas {
        vault,
        token_vault,
        lp_mint: _,
    } = get_vault_pdas(&base_pubkey, &token_mint, &program.id());

    let (vault_pubkey, _) = vault;
    let (token_vault_pubkey, _) = token_vault;

    let user_token = get_or_create_ata(&program, &payer.pubkey(), &token_mint)?;

    let builder = program
        .request()
        .accounts(staking::accounts::Reward {
            token_program: spl_token::ID,
            vault: vault_pubkey,
            user_transfer_authority: payer.pubkey(),
            token_vault: token_vault_pubkey,
            user_token,
        })
        .args(staking::instruction::Reward { amount })
        .signer(payer);

    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

fn stake(program: &Program, token_mint: &Pubkey, payer: &Keypair, amount: u64) -> Result<()> {
    let base_pubkey = Pubkey::from_str(BASE_KEY)?;

    let VaultPdas {
        vault,
        token_vault,
        lp_mint,
    } = get_vault_pdas(&base_pubkey, &token_mint, &program.id());

    let (vault_pubkey, _) = vault;
    let (token_vault_pubkey, _) = token_vault;
    let (lp_mint_pubkey, _) = lp_mint;

    let user_lp = get_or_create_ata(&program, &payer.pubkey(), &lp_mint_pubkey)?;
    let user_token = get_or_create_ata(&program, &payer.pubkey(), &token_mint)?;

    let builder = program
        .request()
        .accounts(staking::accounts::Stake {
            lp_mint: lp_mint_pubkey,
            token_program: spl_token::ID,
            vault: vault_pubkey,
            user_transfer_authority: payer.pubkey(),
            token_vault: token_vault_pubkey,
            user_lp,
            user_token,
        })
        .args(staking::instruction::Stake { amount })
        .signer(payer);

    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

fn show_vault_info(program: &Program, token_mint: &Pubkey) -> Result<()> {
    let base_pubkey = Pubkey::from_str(BASE_KEY)?;

    let VaultPdas {
        vault,
        token_vault: _,
        lp_mint: _,
    } = get_vault_pdas(&base_pubkey, &token_mint, &program.id());

    let (vault_pubkey, _) = vault;
    let vault: staking::vault::Vault = program.account(vault_pubkey)?;

    println!("{:#?}", vault);

    Ok(())
}

fn transfer_admin(
    program: &Program,
    token_mint: &Pubkey,
    admin: &Keypair,
    new_admin: &Keypair,
) -> Result<()> {
    let base_pubkey = Pubkey::from_str(BASE_KEY)?;
    let VaultPdas {
        vault,
        token_vault: _,
        lp_mint: _,
    } = get_vault_pdas(&base_pubkey, &token_mint, &program.id());

    let (vault_pubkey, _) = vault;

    let builder = program
        .request()
        .accounts(staking::accounts::TransferAdmin {
            admin: admin.pubkey(),
            new_admin: new_admin.pubkey(),
            vault: vault_pubkey,
        })
        .args(staking::instruction::TransferAdmin {})
        .signer(admin)
        .signer(new_admin);

    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

fn initialize_vault(
    program: &Program,
    admin: &Keypair,
    token_mint: &Pubkey,
    base_key_location: String,
) -> Result<()> {
    let base_keypair = read_keypair_file(&*shellexpand::tilde(&base_key_location))
        .expect("Cannot read a keypair file");

    let base_pubkey = base_keypair.pubkey();
    println!("base pubkey {}", base_pubkey);

    let VaultPdas {
        vault,
        token_vault,
        lp_mint,
    } = get_vault_pdas(&base_pubkey, &token_mint, &program.id());

    let (vault_pubkey, vault_bump) = vault;
    let (token_vault_pubkey, _) = token_vault;
    let (lp_mint_pubkey, _) = lp_mint;

    let builder = program
        .request()
        .accounts(staking::accounts::InitializeVault {
            admin: admin.pubkey(),
            base: base_pubkey,
            lp_mint: lp_mint_pubkey,
            token_mint: *token_mint,
            vault: vault_pubkey,
            token_vault: token_vault_pubkey,
            rent: solana_program::sysvar::rent::ID,
            system_program: system_program::ID,
            token_program: spl_token::ID,
        })
        .args(staking::instruction::InitializeVault { vault_bump })
        .signer(admin)
        .signer(&base_keypair);

    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}
