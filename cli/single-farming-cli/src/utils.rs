use anchor_client::{solana_sdk::pubkey::Pubkey, Program};

use anyhow::Result;
use spl_associated_token_account::{create_associated_token_account, get_associated_token_address};

pub struct UserPDA {
    pub user: (Pubkey, u8),
}

pub struct PoolPDA {
    pub pubkey: Pubkey,
    pub bump: u8,
}

pub struct VaultPDAs {
    pub staking_vault: (Pubkey, u8),
    pub reward_vault: (Pubkey, u8),
}

pub fn get_user_pda(pool: &Pubkey, owner: &Pubkey, program_id: &Pubkey) -> UserPDA {
    let seeds = [owner.as_ref(), pool.as_ref()];
    let (user_pubkey, user_bump) = Pubkey::find_program_address(&seeds, &program_id);
    UserPDA {
        user: (user_pubkey, user_bump),
    }
}

pub fn get_user(program: &Program, user_pubkey: Pubkey) -> Result<single_farming::state::User> {
    Ok(program.account(user_pubkey)?)
}

pub fn get_pool_pda(program: &Program, staking_mint: &Pubkey) -> Result<PoolPDA> {
    let seeds = [b"pool", staking_mint.as_ref()];
    let (pool_pubkey, pool_bump) = Pubkey::find_program_address(&seeds, &program.id());
    Ok(PoolPDA {
        pubkey: pool_pubkey,
        bump: pool_bump,
    })
}

pub fn get_pool(program: &Program, pool_pubkey: Pubkey) -> Result<single_farming::state::Pool> {
    Ok(program.account(pool_pubkey)?)
}

pub fn get_vault_pdas(program_id: &Pubkey, pool_pubkey: &Pubkey) -> VaultPDAs {
    let seeds = [b"staking_vault", pool_pubkey.as_ref()];
    let (staking_vault_pubkey, staking_vault_bump) =
        Pubkey::find_program_address(&seeds, &program_id);
    let seeds = [b"reward_vault", pool_pubkey.as_ref()];
    let (reward_vault_pubkey, reward_vault_bump) =
        Pubkey::find_program_address(&seeds, &program_id);
    VaultPDAs {
        staking_vault: (staking_vault_pubkey, staking_vault_bump),
        reward_vault: (reward_vault_pubkey, reward_vault_bump),
    }
}

pub fn get_or_create_ata(
    program: &Program,
    wallet_address: &Pubkey,
    token_mint: &Pubkey,
) -> Result<Pubkey> {
    let ata_account = get_associated_token_address(&program.payer(), token_mint);
    let ata_account_info = program.rpc().get_account(&ata_account);
    if ata_account_info.is_err() {
        println!("Create ATA {:?} for Mint {:?}", ata_account, token_mint);
        let builder = program
            .request()
            .instruction(create_associated_token_account(
                &program.payer(),
                &wallet_address,
                &token_mint,
            ));
        let tx_signature = builder.send()?;
        println!("Signature {:?}", tx_signature);
    }
    Ok(ata_account)
}
