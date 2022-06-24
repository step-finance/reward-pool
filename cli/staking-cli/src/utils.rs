use anchor_client::solana_client::rpc_response::RpcSimulateTransactionResult;
use anchor_client::RequestBuilder;
use anchor_client::{solana_sdk::pubkey::Pubkey, Program};
use anyhow::Result;
use spl_associated_token_account::{create_associated_token_account, get_associated_token_address};

#[derive(Clone, Copy, Debug)]
pub struct VaultPdas {
    pub token_vault: (Pubkey, u8),
    pub lp_mint: (Pubkey, u8),
}

pub fn get_vault_pdas(
    vault_pubkey: &Pubkey,
    token_mint: &Pubkey,
    program_id: &Pubkey,
) -> VaultPdas {
    let seeds = [b"token_vault".as_ref(), vault_pubkey.as_ref()];
    let (token_vault_pubkey, token_vault_bump) = Pubkey::find_program_address(&seeds, &program_id);

    let seeds = [b"lp_mint", vault_pubkey.as_ref()];
    let (lp_mint_pubkey, lp_mint_bump) = Pubkey::find_program_address(&seeds, &program_id);

    VaultPdas {
        token_vault: (token_vault_pubkey, token_vault_bump),
        lp_mint: (lp_mint_pubkey, lp_mint_bump),
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
