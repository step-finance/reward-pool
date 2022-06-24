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
use staking::vault::Vault;
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
        CliCommand::TransferAdmin {
            vault_pubkey,
            new_admin_path,
        } => {
            let new_admin =
                read_keypair_file(new_admin_path).expect("Wallet keypair file not found");
            transfer_admin(&program, &vault_pubkey, &payer, &new_admin)?;
        }
        CliCommand::ShowInfo { vault_pubkey } => {
            show_vault_info(&program, &vault_pubkey)?;
        }
        CliCommand::Stake {
            vault_pubkey,
            amount,
        } => {
            stake(&program, &vault_pubkey, &payer, amount)?;
        }
        CliCommand::Reward {
            vault_pubkey,
            amount,
        } => {
            reward(&program, &vault_pubkey, &payer, amount)?;
        }
        CliCommand::Unstake {
            vault_pubkey,
            unmint_amount,
        } => {
            unstake(&program, &vault_pubkey, &payer, unmint_amount)?;
        }
        CliCommand::UpdateLockedRewardDegradation {
            vault_pubkey,
            locked_reward_degradation,
        } => {
            update_locked_reward_degradation(
                &program,
                &vault_pubkey,
                &payer,
                locked_reward_degradation,
            )?;
        }
    }
    Ok(())
}

fn update_locked_reward_degradation(
    program: &Program,
    vault_pubkey: &Pubkey,
    admin: &Keypair,
    locked_reward_degradation: u64,
) -> Result<()> {
    let vault: Vault = program.account(*vault_pubkey)?;
    let token_mint = vault.token_mint;
    let VaultPdas {
        token_vault: _,
        lp_mint: _,
    } = get_vault_pdas(&vault_pubkey, &token_mint, &program.id());

    let builder = program
        .request()
        .accounts(staking::accounts::UpdateLockedRewardDegradation {
            vault: *vault_pubkey,
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
    vault_pubkey: &Pubkey,
    payer: &Keypair,
    unmint_amount: u64,
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
        .accounts(staking::accounts::Stake {
            lp_mint: lp_mint_pubkey,
            token_program: spl_token::ID,
            vault: *vault_pubkey,
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

fn reward(program: &Program, vault_pubkey: &Pubkey, payer: &Keypair, amount: u64) -> Result<()> {
    let vault: Vault = program.account(*vault_pubkey)?;
    let token_mint = vault.token_mint;

    let VaultPdas {
        token_vault,
        lp_mint: _,
    } = get_vault_pdas(vault_pubkey, &token_mint, &program.id());

    let (token_vault_pubkey, _) = token_vault;

    let user_token = get_or_create_ata(&program, &payer.pubkey(), &token_mint)?;

    let builder = program
        .request()
        .accounts(staking::accounts::Reward {
            token_program: spl_token::ID,
            vault: *vault_pubkey,
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

fn stake(program: &Program, vault_pubkey: &Pubkey, payer: &Keypair, amount: u64) -> Result<()> {
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
        .accounts(staking::accounts::Stake {
            lp_mint: lp_mint_pubkey,
            token_program: spl_token::ID,
            vault: *vault_pubkey,
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

fn show_vault_info(program: &Program, vault_pubkey: &Pubkey) -> Result<()> {
    let vault: Vault = program.account(*vault_pubkey)?;
    let token_mint = vault.token_mint;

    let VaultPdas {
        token_vault: _,
        lp_mint: _,
    } = get_vault_pdas(vault_pubkey, &token_mint, &program.id());

    println!("{:#?}", vault);

    Ok(())
}

fn transfer_admin(
    program: &Program,
    vault_pubkey: &Pubkey,
    admin: &Keypair,
    new_admin: &Keypair,
) -> Result<()> {
    let vault: Vault = program.account(*vault_pubkey)?;
    let token_mint = vault.token_mint;
    let VaultPdas {
        token_vault: _,
        lp_mint: _,
    } = get_vault_pdas(vault_pubkey, &token_mint, &program.id());

    let builder = program
        .request()
        .accounts(staking::accounts::TransferAdmin {
            admin: admin.pubkey(),
            new_admin: new_admin.pubkey(),
            vault: *vault_pubkey,
        })
        .args(staking::instruction::TransferAdmin {})
        .signer(admin)
        .signer(new_admin);

    let signature = builder.send()?;
    println!("Signature {:?}", signature);

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
        .accounts(staking::accounts::InitializeVault {
            admin: admin.pubkey(),
            lp_mint: lp_mint_pubkey,
            token_mint: *token_mint,
            vault: vault_pubkey,
            token_vault: token_vault_pubkey,
            rent: solana_program::sysvar::rent::ID,
            system_program: system_program::ID,
            token_program: spl_token::ID,
        })
        .args(staking::instruction::InitializeVault {})
        .signer(admin)
        .signer(&vault_keypair);

    let signature = builder.send()?;
    println!("Signature {:?}", signature);
    Ok(())
}
