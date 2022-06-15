import * as anchor from "@project-serum/anchor";

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const program = anchor.workspace.SingleFarming;

type PublicKey = anchor.web3.PublicKey;
type Keypair = anchor.web3.Keypair;

export async function createMint(provider, decimals) {
  const mint = await Token.createMint(
    provider.connection,
    provider.wallet.payer,
    provider.wallet.publicKey,
    null,
    decimals,
    TOKEN_PROGRAM_ID
  );
  return mint;
}

export async function createMintFromPriv(
  mintAccount,
  provider,
  mintAuthority,
  freezeAuthority,
  decimals,
  programId
) {
  const token = new Token(
    provider.connection,
    mintAccount.publicKey,
    programId,
    provider.wallet.payer
  );

  // Allocate memory for the account
  const balanceNeeded = await Token.getMinBalanceRentForExemptMint(
    provider.connection
  );

  const transaction = new anchor.web3.Transaction();
  transaction.add(
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.payer.publicKey,
      newAccountPubkey: mintAccount.publicKey,
      lamports: balanceNeeded,
      space: MintLayout.span,
      programId,
    })
  );

  transaction.add(
    Token.createInitMintInstruction(
      programId,
      mintAccount.publicKey,
      decimals,
      mintAuthority,
      freezeAuthority
    )
  );

  await provider.sendAndConfirm(transaction, [mintAccount]);
  return token;
}

export async function mintToAccount(provider, mint, destination, amount) {
  const tx = new anchor.web3.Transaction();
  tx.add(
    Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      mint,
      destination,
      provider.wallet.publicKey,
      [],
      amount
    )
  );
  await provider.sendAndConfirm(tx);
}

export async function sendLamports(provider, destination, amount) {
  const tx = new anchor.web3.Transaction();
  tx.add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      lamports: amount,
      toPubkey: destination,
    })
  );
  await provider.sendAndConfirm(tx);
}

export async function getOrCreateAssociatedTokenAccount(
  tokenMint: PublicKey,
  owner: PublicKey,
  payer: Keypair,
  provider: anchor.Provider
) {
  const toAccount = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    tokenMint,
    owner
  );
  const account = await provider.connection.getAccountInfo(toAccount);
  if (!account) {
    const tx = new anchor.web3.Transaction().add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenMint,
        toAccount,
        owner,
        payer.publicKey
      )
    );

    const signature = await provider.sendAndConfirm(tx, [payer]);
    await provider.connection.confirmTransaction(signature);

    return Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      tokenMint,
      owner
    );
  }
  return toAccount;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function computePoolAccount(stakingMint) {
  return anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("pool"), stakingMint.toBuffer()],
    program.programId
  );
}

export function computeStakingVaultAccount(pool) {
  return anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("staking_vault"), pool.toBuffer()],
    program.programId
  );
}

export function computeRewardVaultAccount(pool) {
  return anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("reward_vault"), pool.toBuffer()],
    program.programId
  );
}

export function computeUserAccount(wallet, pool) {
  return anchor.web3.PublicKey.findProgramAddress(
    [wallet.toBuffer(), pool.toBuffer()],
    program.programId
  );
}
