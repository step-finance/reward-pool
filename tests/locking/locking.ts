import assert from "assert";

import * as anchor from "@project-serum/anchor";
import { AnchorError, Program } from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Locking } from "../../target/types/locking";
import { getClock } from "../clock";
import { sleep } from "@project-serum/common";

type Pubkey = anchor.web3.PublicKey;
const BN = anchor.BN;
type BN = anchor.BN;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.Locking as Program<Locking>;
const admin = new anchor.web3.Keypair();
const user = new anchor.web3.Keypair();
const vaultKeypair = new anchor.web3.Keypair();

let tokenVault: Pubkey | null;
let tokenMint: Token | null; // MER
let vault: Pubkey | null;
let tokenVaultNonce: number = 0;
let lpMint: Pubkey | null; // xMER
let vaultLpToken: Token | null;
let userToken: Pubkey | null;
let userLp: Pubkey | null;
let adminToken: Pubkey | null;
let adminLp: Pubkey | null;

const tokenAmount = 100_000_000;

async function assertAnchorError(result: Promise<string>, errorCode: string) {
  try {
    await result;
  } catch (error) {
    assert.strictEqual(error instanceof AnchorError, true);
    let anchorError = error as AnchorError;
    assert.strictEqual(anchorError.error.errorCode.code, errorCode);
  }
}

describe("locking", () => {
  it("initialize vault", async () => {
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

    vault = vaultKeypair.publicKey;

    [tokenVault, tokenVaultNonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode("token_vault")),
          vault.toBuffer(),
        ],
        program.programId
      );

    [lpMint] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("lp_mint")),
        vault.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .initializeVault()
      .accounts({
        vault,
        tokenVault,
        tokenMint: tokenMint.publicKey,
        lpMint,
        admin: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([vaultKeypair, admin])
      .rpc();

    let vaultAccount = await program.account.vault.fetch(vault);
    assert.deepStrictEqual(
      vaultAccount.admin.toBase58(),
      admin.publicKey.toBase58()
    );
    assert.deepStrictEqual(vaultAccount.lpMint.toBase58(), lpMint.toBase58());
    assert.deepStrictEqual(
      vaultAccount.tokenMint.toBase58(),
      tokenMint.publicKey.toBase58()
    );
    assert.deepStrictEqual(
      vaultAccount.tokenVault.toBase58(),
      tokenVault.toBase58()
    );
    assert.deepStrictEqual(vaultAccount.tokenVaultBump, tokenVaultNonce);
    assert.deepStrictEqual(vaultAccount.releaseDate.toNumber(), 0);

    vaultLpToken = new Token(
      provider.connection,
      lpMint,
      TOKEN_PROGRAM_ID,
      user
    );

    userToken = await tokenMint.createAssociatedTokenAccount(user.publicKey);
    await tokenMint.mintTo(userToken, admin, [], tokenAmount);
    userLp = await vaultLpToken.createAssociatedTokenAccount(user.publicKey);

    adminToken = await tokenMint.createAssociatedTokenAccount(admin.publicKey);
    await tokenMint.mintTo(adminToken, admin, [], tokenAmount);
    adminLp = await vaultLpToken.createAssociatedTokenAccount(admin.publicKey);
  });

  it("lock MER for xMER before locking start", async () => {
    await program.methods
      .lock(new BN(tokenAmount))
      .accounts({
        lpMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault,
        userLp,
        userToken,
        userTransferAuthority: user.publicKey,
        vault,
      })
      .signers([user])
      .rpc();
    const userTokenAccount = await tokenMint.getAccountInfo(userToken);
    assert.strictEqual(0, userTokenAccount.amount.toNumber());

    const userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(tokenAmount, userLpTokenAccount.amount.toNumber());

    const tokenVaultAccount = await tokenMint.getAccountInfo(tokenVault);
    assert.strictEqual(tokenVaultAccount.amount.toNumber(), tokenAmount);
  });

  it("unlock xMER for MER before locking start", async () => {
    const burnAmount = tokenAmount;
    await program.methods
      .unlock(new BN(burnAmount))
      .accounts({
        lpMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault,
        userLp,
        userToken,
        userTransferAuthority: user.publicKey,
        vault,
      })
      .signers([user])
      .rpc();

    const userTokenAccount = await tokenMint.getAccountInfo(userToken);
    assert.strictEqual(burnAmount, userTokenAccount.amount.toNumber());

    const userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(0, userLpTokenAccount.amount.toNumber());

    const tokenVaultAccount = await tokenMint.getAccountInfo(tokenVault);
    assert.strictEqual(tokenVaultAccount.amount.toNumber(), 0);
  });

  it("non-admin failed to set release date", async () => {
    const clock = await getClock(program.provider.connection);
    const releaseDate = clock.info.unixTimestamp + 5;
    const setRelaseDate = program.methods
      .setReleaseDate(new BN(releaseDate))
      .accounts({
        admin: admin.publicKey,
        vault,
      })
      .signers([user])
      .rpc();
    assert.rejects(setRelaseDate);
  });

  it("start locking period", async () => {
    const clock = await getClock(program.provider.connection);
    const releaseDate = clock.info.unixTimestamp + 5;
    await program.methods
      .setReleaseDate(new BN(releaseDate))
      .accounts({
        admin: admin.publicKey,
        vault,
      })
      .signers([admin])
      .rpc();

    const vaultState = await program.account.vault.fetch(vault);
    assert.strictEqual(vaultState.releaseDate.toNumber(), releaseDate);
  });

  it("fail to set release date after locking is started", async () => {
    const clock = await getClock(program.provider.connection);
    const releaseDate = clock.info.unixTimestamp;
    const setReleaseDate = program.methods
      .setReleaseDate(new BN(releaseDate))
      .accounts({
        admin: admin.publicKey,
        vault,
      })
      .signers([admin])
      .rpc();
    assertAnchorError(setReleaseDate, "LockingStarted");
  });

  it("lock MER for xMER after the locking is started", async () => {
    await program.methods
      .lock(new BN(tokenAmount))
      .accounts({
        lpMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault,
        userLp,
        userToken,
        userTransferAuthority: user.publicKey,
        vault,
      })
      .signers([user])
      .rpc();
    const userTokenAccount = await tokenMint.getAccountInfo(userToken);
    assert.strictEqual(0, userTokenAccount.amount.toNumber());

    const userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(tokenAmount, userLpTokenAccount.amount.toNumber());

    const tokenVaultAccount = await tokenMint.getAccountInfo(tokenVault);
    assert.strictEqual(tokenVaultAccount.amount.toNumber(), tokenAmount);
  });

  it("fail to unlock XMER for MER after locking is started", async () => {
    const unlock = program.methods
      .unlock(new BN(tokenAmount))
      .accounts({
        lpMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault,
        userLp,
        userToken,
        userTransferAuthority: user.publicKey,
        vault,
      })
      .signers([user])
      .rpc();
    await assertAnchorError(unlock, "LockingStarted");
  });

  it("unlock xMER for MER when release date reached", async () => {
    await sleep(5500); // Wait for release date
    await program.methods
      .unlock(new BN(tokenAmount))
      .accounts({
        lpMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault,
        userLp,
        userToken,
        userTransferAuthority: user.publicKey,
        vault,
      })
      .signers([user])
      .rpc();

    const userTokenAccount = await tokenMint.getAccountInfo(userToken);
    assert.strictEqual(tokenAmount, userTokenAccount.amount.toNumber());

    const userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(0, userLpTokenAccount.amount.toNumber());

    const tokenVaultAccount = await tokenMint.getAccountInfo(tokenVault);
    assert.strictEqual(tokenVaultAccount.amount.toNumber(), 0);
  });

  it("lock MER for xMER after release date", async () => {
    await program.methods
      .lock(new BN(tokenAmount))
      .accounts({
        lpMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault,
        userLp,
        userToken,
        userTransferAuthority: user.publicKey,
        vault,
      })
      .signers([user])
      .rpc();

    const userTokenAccount = await tokenMint.getAccountInfo(userToken);
    assert.strictEqual(0, userTokenAccount.amount.toNumber());

    const userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(tokenAmount, userLpTokenAccount.amount.toNumber());

    const tokenVaultAccount = await tokenMint.getAccountInfo(tokenVault);
    assert.strictEqual(tokenVaultAccount.amount.toNumber(), tokenAmount);
  });

  it("fail to unlock extra MER", async () => {
    const unlock = program.methods
      .unlock(new BN(tokenAmount * 2))
      .accounts({
        lpMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault,
        userLp,
        userToken,
        userTransferAuthority: user.publicKey,
        vault,
      })
      .signers([user])
      .rpc();
    await assertAnchorError(unlock, "InsufficientLpAmount");
  });
});
