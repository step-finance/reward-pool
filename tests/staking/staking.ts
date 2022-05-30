import assert from "assert";

import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Staking } from "../../target/types/staking";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.Staking as Program<Staking>;
const admin = new anchor.web3.Keypair();
const base = new anchor.web3.Keypair();
const user = new anchor.web3.Keypair();

let tokenVault,
  tokenMint,
  vault,
  nonce,
  tokenVaultNonce,
  lpMint,
  lpMintNonce,
  adminLp,
  vaultLpToken,
  adminToken,
  userToken,
  userLp;

describe("staking", () => {
  it("Vault Is initialized", async () => {
    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(user.publicKey, 10000000000),
      "confirmed"
    );

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(admin.publicKey, 10000000000),
      "confirmed"
    );

    tokenMint = await Token.createMint(
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
        tokenMint.publicKey.toBuffer(),
        base.publicKey.toBuffer(),
      ],
      program.programId
    );

    [tokenVault, tokenVaultNonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode("token_vault")),
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

    const tx = await program.rpc.initializeVault(nonce, {
      accounts: {
        vault,
        base: base.publicKey,
        tokenVault,
        tokenMint: tokenMint.publicKey,
        lpMint,
        admin: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [base, admin],
    });
    console.log("Your transaction signature", tx);

    let vaultAccount = await program.account.vault.fetch(vault);

    console.log(vaultAccount);
  });

  it("First Token Staked", async () => {
    const tokenAmount = 100_000_000;

    // mints mer to user account
    userToken = await tokenMint.createAssociatedTokenAccount(user.publicKey);

    await tokenMint.mintTo(userToken, admin, [], tokenAmount);
    vaultLpToken = new Token(
      provider.connection,
      lpMint,
      TOKEN_PROGRAM_ID,
      user
    );
    userLp = await vaultLpToken.createAssociatedTokenAccount(user.publicKey);
    const tx = await program.rpc.stake(new anchor.BN(tokenAmount), {
      accounts: {
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [user],
    });

    const userTokenAccount = await tokenMint.getAccountInfo(userToken);
    assert.strictEqual(0, userTokenAccount.amount.toNumber());

    const vaultTokenAccount = await tokenMint.getAccountInfo(tokenVault);
    assert.strictEqual(tokenAmount, vaultTokenAccount.amount.toNumber());

    const userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(tokenAmount, userLpTokenAccount.amount.toNumber());
  });

  it("Second token Staked", async () => {
    const tokenAmount = 200_000_000;

    await tokenMint.mintTo(userToken, admin, [], tokenAmount);

    const tx = await program.rpc.stake(new anchor.BN(tokenAmount), {
      accounts: {
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [user],
    });

    const userTokenAccount = await tokenMint.getAccountInfo(userToken);
    assert.strictEqual(0, userTokenAccount.amount.toNumber());

    const userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(
      tokenAmount + 100_000_000,
      userLpTokenAccount.amount.toNumber()
    );
  });

  it("Reward Added to vault", async () => {
    const tokenAmount = 200_000_000;
    adminToken = await tokenMint.createAssociatedTokenAccount(admin.publicKey);
    await tokenMint.mintTo(adminToken, admin, [], tokenAmount + 10);

    const tx = await program.rpc.reward(new anchor.BN(tokenAmount), {
      accounts: {
        vault,
        tokenVault,
        userToken: adminToken,
        userTransferAuthority: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [admin],
    });

    const vaultTokenAccount = await tokenMint.getAccountInfo(tokenVault);
    assert.strictEqual(500_000_000, vaultTokenAccount.amount.toNumber());
  });

  it("Unstake", async () => {
    const lpAmount = 200_000_000;

    const tx = await program.rpc.unstake(new anchor.BN(lpAmount), {
      accounts: {
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [user],
    });

    const userTokenAccount = await tokenMint.getAccountInfo(userToken);
    console.log("user token amount: ", userTokenAccount.amount.toNumber());    

    const userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(100_000_000, userLpTokenAccount.amount.toNumber());
  });

  it("Update locked reward degradation", async () => {
    let newRewardDegradation = 200000000000; //5 seconds
    const tx = await program.rpc.updateLockedRewardDegradation(
      new anchor.BN(newRewardDegradation),
      {
        accounts: {
          vault,
          admin: admin.publicKey,
        },
        signers: [admin],
      }
    );

    let vaultAccount = await program.account.vault.fetch(vault);
    assert.strictEqual(
      newRewardDegradation,
      vaultAccount.lockedRewardTracker.lockedRewardDegradation.toNumber()
    );
  });

  it("Unstake after waiting", async () => {
    // wait
    await wait(1);
    var lpAmount = 50_000_000;

    var tx = await program.rpc.unstake(new anchor.BN(lpAmount), {
      accounts: {
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [user],
    });

    var userTokenAccount = await tokenMint.getAccountInfo(userToken);
    console.log(userTokenAccount.amount.toNumber());

    var userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(50_000_000, userLpTokenAccount.amount.toNumber());

    await wait(4);
    var lpAmount = 50_000_000;

    var tx = await program.rpc.unstake(new anchor.BN(lpAmount), {
      accounts: {
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [user],
    });

    var userTokenAccount = await tokenMint.getAccountInfo(userToken);
    assert.strictEqual(500_000_000, userTokenAccount.amount.toNumber());

    var userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(0, userLpTokenAccount.amount.toNumber());
  });

  it("Change funder", async() => {
    let newFunder = new anchor.web3.Keypair();
    var tx = await program.rpc.changeFunder (
        {
          accounts: {
            vault,
            admin: admin.publicKey,
            funder: newFunder.publicKey
          },
          signers: [admin]
        }
    )
    let vaultAccount = await program.account.vault.fetch(
        vault
    );
    assert.strictEqual(newFunder.publicKey.toString(), vaultAccount.funder.toBase58());
  })

    it('Transfer admin', async () => {
        let newAdmin = new anchor.web3.Keypair();
        var tx = await program.rpc.transferAdmin (
            {
                accounts: {
                    vault,
                    admin: admin.publicKey,
                    newAdmin: newAdmin.publicKey
                },
                signers: [admin, newAdmin]
            }
        )
        let vaultAccount = await program.account.vault.fetch(
            vault
        );
        assert.strictEqual(newAdmin.publicKey.toString(), vaultAccount.admin.toBase58());
    });
});

async function wait(seconds) {
  while (seconds > 0) {
    console.log("countdown " + seconds--);
    await new Promise((a) => setTimeout(a, 1000));
  }
  console.log("wait over");
}
