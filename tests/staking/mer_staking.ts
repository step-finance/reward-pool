import assert from 'assert';

import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Staking } from "../../target/types/staking";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.Staking as Program<Staking>;
const admin = new anchor.web3.Keypair();
const user = new anchor.web3.Keypair();

let vaultMer, merMint, vault, nonce, vaultMerNonce, lpMint, lpMintNonce,  adminMer, adminLp, vaultLpToken;

describe('mer_staking', () => {

  it('Mer vault Is initialized', async () => {

    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(admin.publicKey, 10000000000),
      "confirmed"
    );

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(user.publicKey, 10000000000),
      "confirmed"
    );

    merMint = await Token.createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6,
      TOKEN_PROGRAM_ID
    );

    [vault, nonce] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("vault")),
      ],
      program.programId
    );

    [vaultMer, vaultMerNonce] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("vault_mer")),
        vault.toBuffer(),
      ],
      program.programId
    );

    [lpMint, lpMintNonce] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("lp_mint")),
        vault.toBuffer(),
      ],
      program.programId
    );

    const bumps = {
      vault: nonce,
      vaultMer: vaultMerNonce,
      lpMint: lpMintNonce
    };

    const tx = await program.rpc.initializeVault(
      bumps,
      {
        accounts: {
          vault,
          vaultMer,
          merMint: merMint.publicKey,
          lpMint,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [admin]
      }
    );
    console.log("Your transaction signature", tx);

    let vaultAccount = await program.account.vault.fetch(
      vault
    );

    console.log(vaultAccount);

  });
  
  it('First Mer Staked', async () => {
    const merAmount = 100000000;

    // mints mer to user account
    adminMer = await merMint.createAssociatedTokenAccount(admin.publicKey);
    await merMint.mintTo(
      adminMer,
      admin,
      [],
      merAmount
    )
    vaultLpToken = new Token(
      provider.connection,
      lpMint,
      TOKEN_PROGRAM_ID,
      admin
    )
    adminLp = await vaultLpToken.createAssociatedTokenAccount(admin.publicKey);

    const tx = await program.rpc.stake(
      new anchor.BN(merAmount),
      {
        accounts :{
          vault,
          vaultMer,
          lpMint,
          userMer: adminMer,
          userLp: adminLp,
          userTransferAuthority: admin.publicKey,
          tokenProgram:  TOKEN_PROGRAM_ID
        },
        signers: [admin]
      }
    )

    const userMerTokenAccount = await merMint.getAccountInfo(adminMer);
    assert.strictEqual(0, userMerTokenAccount.amount.toNumber());

    const vaultMerTokenAccount = await merMint.getAccountInfo(vaultMer);
    assert.strictEqual(merAmount, vaultMerTokenAccount.amount.toNumber());

    const userLpTokenAccount = await vaultLpToken.getAccountInfo(adminLp);
    assert.strictEqual(merAmount, userLpTokenAccount.amount.toNumber());
  });

  it('Second Mer Staked', async () => {
    const merAmount = 200000000;

    await merMint.mintTo(
      adminMer,
      admin,
      [],
      merAmount
    )

    const tx = await program.rpc.stake(
      new anchor.BN(merAmount),
      {
        accounts: {
          vault,
          vaultMer,
          lpMint,
          userMer: adminMer,
          userLp: adminLp,
          userTransferAuthority: admin.publicKey,
          tokenProgram:  TOKEN_PROGRAM_ID
        },
        signers: [admin]
      }
    )
  
    const userMerTokenAccount = await merMint.getAccountInfo(adminMer);
    assert.strictEqual(0, userMerTokenAccount.amount.toNumber());
  
    const userLpTokenAccount = await vaultLpToken.getAccountInfo(adminLp);
    assert.strictEqual(merAmount+100000000, userLpTokenAccount.amount.toNumber());
  });

  it('Reward Added to vault', async () => {
    const merAmount = 200000000;

    await merMint.mintTo(
      adminMer,
      admin,
      [],
      merAmount + 10
    )
  
    const tx = await program.rpc.reward(
      new anchor.BN(merAmount),
      {
        accounts :{
          vault,
          vaultMer,
          userMer: adminMer,
          userTransferAuthority: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [admin]
      }
    )

    const vaultMerTokenAccount = await merMint.getAccountInfo(vaultMer);
    assert.strictEqual(500000000, vaultMerTokenAccount.amount.toNumber());
  });

  
  it('Unstake', async () => {
    const lpAmount = 50000000;

    const tx = await program.rpc.unstake(
      new anchor.BN(lpAmount),
      {
        accounts: {
          vault,
          vaultMer,
          lpMint,
          userMer: adminMer,
          userLp: adminLp,
          userTransferAuthority: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [admin]
      }
    )
  
    const userMerTokenAccount = await merMint.getAccountInfo(adminMer);
    assert.strictEqual(83333343, userMerTokenAccount.amount.toNumber());
  
    const userLpTokenAccount = await vaultLpToken.getAccountInfo(adminLp);
    assert.strictEqual(250000000, userLpTokenAccount.amount.toNumber());
      
  });

});
