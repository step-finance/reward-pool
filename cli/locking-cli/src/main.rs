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
use locking::vault::Vault;
use solana_program::system_program;
use std::rc::Rc;

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
        CliCommand::Init { token_mint } => {
            initialize_vault(&program, &payer, &token_mint)?;
        }
        CliCommand::ShowInfo { vault_pubkey } => {
            show_vault_info(&program, &vault_pubkey)?;
        }
        CliCommand::Lock {
            vault_pubkey,
            amount,
        } => {
            lock(&program, &vault_pubkey, &payer, amount)?;
        }
        CliCommand::Unlock {
            vault_pubkey,
            unlock_amount,
        } => {
            unlock(&program, &vault_pubkey, &payer, unlock_amount)?;
        }
        CliCommand::SetReleaseDate {
            vault_pubkey,
            release_date,
        } => {
            set_release_date(&program, &vault_pubkey, &payer, release_date)?;
        }
    }
    Ok(())
}

fn set_release_date(
    program: &Program,
    vault_pubkey: &Pubkey,
    payer: &Keypair,
    release_date: u64,
) -> Result<()> {
    let vault: Vault = program.account(*vault_pubkey)?;

    let builder = program
        .request()
        .accounts(locking::accounts::SetReleaseDate {
            admin: vault.admin,
            vault: *vault_pubkey,
        })
        .args(locking::instruction::SetReleaseDate { release_date })
        .signer(payer);

    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}

fn unlock(
    program: &Program,
    vault_pubkey: &Pubkey,
    payer: &Keypair,
    unlock_amount: u64,
) -> Result<()> {
    let vault: Vault = program.account(*vault_pubkey)?;
    let token_mint = vault.token_mint;

    let VaultPdas {
        token_vault,
        lp_mint,
    } = get_vault_pdas(&vault_pubkey, &token_mint, &program.id());

    let (token_vault_pubkey, _) = token_vault;
    let (lp_mint_pubkey, _) = lp_mint;

    let user_lp = get_or_create_ata(&program, &payer.pubkey(), &lp_mint_pubkey)?;
    let user_token = get_or_create_ata(&program, &payer.pubkey(), &token_mint)?;

    let builder = program
        .request()
        .accounts(locking::accounts::Lock {
            lp_mint: lp_mint_pubkey,
            token_program: spl_token::ID,
            vault: *vault_pubkey,
            user_transfer_authority: payer.pubkey(),
            token_vault: token_vault_pubkey,
            user_lp,
            user_token,
        })
        .args(locking::instruction::Unlock { unlock_amount })
        .signer(payer);

    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

fn lock(program: &Program, vault_pubkey: &Pubkey, payer: &Keypair, amount: u64) -> Result<()> {
    let vault: Vault = program.account(*vault_pubkey)?;
    let token_mint = vault.token_mint;

    let VaultPdas {
        token_vault,
        lp_mint,
    } = get_vault_pdas(vault_pubkey, &token_mint, &program.id());

    let (token_vault_pubkey, _) = token_vault;
    let (lp_mint_pubkey, _) = lp_mint;

    let user_lp = get_or_create_ata(&program, &payer.pubkey(), &lp_mint_pubkey)?;
    let user_token = get_or_create_ata(&program, &payer.pubkey(), &token_mint)?;

    let builder = program
        .request()
        .accounts(locking::accounts::Lock {
            lp_mint: lp_mint_pubkey,
            token_program: spl_token::ID,
            vault: *vault_pubkey,
            user_transfer_authority: payer.pubkey(),
            token_vault: token_vault_pubkey,
            user_lp,
            user_token,
        })
        .args(locking::instruction::Lock { amount })
        .signer(payer);

    let signature = builder.send()?;
    println!("Signature {:?}", signature);

    Ok(())
}

fn show_vault_info(program: &Program, vault_pubkey: &Pubkey) -> Result<()> {
    let vault: Vault = program.account(*vault_pubkey)?;
    println!("{:#?}", vault);

    Ok(())
}

fn initialize_vault(program: &Program, admin: &Keypair, token_mint: &Pubkey) -> Result<()> {
    let vault_keypair = Keypair::new();
    let vault_pubkey = vault_keypair.pubkey();
    println!("vault_pubkey {}", vault_pubkey);

    let VaultPdas {
        token_vault,
        lp_mint,
    } = get_vault_pdas(&vault_pubkey, &token_mint, &program.id());

    let (token_vault_pubkey, _) = token_vault;
    let (lp_mint_pubkey, _) = lp_mint;

    let builder = program
        .request()
        .accounts(locking::accounts::InitializeVault {
            admin: admin.pubkey(),
            lp_mint: lp_mint_pubkey,
            token_mint: *token_mint,
            vault: vault_pubkey,
            token_vault: token_vault_pubkey,
            rent: solana_program::sysvar::rent::ID,
            system_program: system_program::ID,
            token_program: spl_token::ID,
        })
        .args(locking::instruction::InitializeVault {})
        .signer(admin)
        .signer(&vault_keypair);

    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}
