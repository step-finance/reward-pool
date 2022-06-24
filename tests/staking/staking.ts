import assert from "assert";

import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Staking } from "../../target/types/staking";
import { sleep } from "@project-serum/common";

type Pubkey = anchor.web3.PublicKey;
const BN = anchor.BN;
type BN = anchor.BN;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.Staking as Program<Staking>;
const admin = new anchor.web3.Keypair();
const user = new anchor.web3.Keypair();
const vaultKeypair = new anchor.web3.Keypair();
const funder = new anchor.web3.Keypair();
const newAdmin = new anchor.web3.Keypair();

let tokenVault: Pubkey | null;
let tokenMint: Token | null; // MER
let vault: Pubkey | null;
let vaultBump: number = 0;
let tokenVaultNonce: number = 0;
let lpMint: Pubkey | null; // xMER
let lpMintNonce: number = 0;
let vaultLpToken: Token | null;
let userToken: Pubkey | null;
let user2Token: Pubkey | null;
let userLp: Pubkey | null;
let user2Lp: Pubkey | null;
let adminToken: Pubkey | null;
let funderToken: Pubkey | null;
let newAdminToken: Pubkey | null;

describe("staking", () => {
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

    [lpMint, lpMintNonce] = await anchor.web3.PublicKey.findProgramAddress(
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
    assert.deepStrictEqual(
      vaultAccount.funder.toBase58(),
      anchor.web3.PublicKey.default.toBase58()
    );
    assert.deepStrictEqual(vaultAccount.totalAmount.toNumber(), 0);
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
  });

  it("unable to initialize vault with same token mint", async () => {
    let result = program.methods
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

    await assert.rejects(result);
  });

  it("first time stake token successful", async () => {
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

    await program.methods
      .stake(new anchor.BN(tokenAmount))
      .accounts({
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const userTokenAccount = await tokenMint.getAccountInfo(userToken);
    assert.strictEqual(0, userTokenAccount.amount.toNumber());

    const vaultTokenAccount = await tokenMint.getAccountInfo(tokenVault);
    assert.strictEqual(tokenAmount, vaultTokenAccount.amount.toNumber());

    const userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(tokenAmount, userLpTokenAccount.amount.toNumber());

    const vaultAccount = await program.account.vault.fetch(vault);
    assert.strictEqual(
      vaultAccount.totalAmount.toString(),
      tokenAmount.toString()
    );
  });

  it("second time stake token successful", async () => {
    const tokenAmount = 200_000_000;

    await tokenMint.mintTo(userToken, admin, [], tokenAmount);

    await program.methods
      .stake(new anchor.BN(tokenAmount))
      .accounts({
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const userTokenAccount = await tokenMint.getAccountInfo(userToken);
    assert.strictEqual(0, userTokenAccount.amount.toNumber());

    const userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(
      tokenAmount + 100_000_000,
      userLpTokenAccount.amount.toNumber()
    );

    const vaultAccount = await program.account.vault.fetch(vault);
    assert.strictEqual(
      vaultAccount.totalAmount.toString(),
      (100_000_000 + tokenAmount).toString()
    );
  });

  it("fail to add reward with unauthorized funder", async () => {
    const tokenAmount = 200_000_000;
    const unauthorizedFunder = new anchor.web3.Keypair();
    await program.provider.connection
      .requestAirdrop(unauthorizedFunder.publicKey, 1_000_000_000)
      .then(async (sig) => program.provider.connection.confirmTransaction(sig));
    const funderTokenAccount = await tokenMint.createAssociatedTokenAccount(
      unauthorizedFunder.publicKey
    );
    await tokenMint.mintTo(funderTokenAccount, admin, [], tokenAmount);

    let result = program.methods
      .reward(new anchor.BN(tokenAmount))
      .accounts({
        vault,
        tokenVault,
        userToken: funderTokenAccount,
        userTransferAuthority: unauthorizedFunder.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([unauthorizedFunder])
      .rpc();

    await assert.rejects(result);
  });

  it("change funder", async () => {
    await program.methods
      .changeFunder()
      .accounts({
        vault,
        admin: admin.publicKey,
        funder: funder.publicKey,
      })
      .signers([admin])
      .rpc();
    let vaultAccount = await program.account.vault.fetch(vault);
    assert.strictEqual(
      funder.publicKey.toString(),
      vaultAccount.funder.toBase58()
    );
  });

  it("admin add reward to vault", async () => {
    const tokenAmount = 200_000_000;
    adminToken = await tokenMint.createAssociatedTokenAccount(admin.publicKey);
    await tokenMint.mintTo(adminToken, admin, [], tokenAmount + 10);

    const beforeVaultAccount = await program.account.vault.fetch(vault);

    await program.methods
      .reward(new anchor.BN(tokenAmount))
      .accounts({
        vault,
        tokenVault,
        userToken: adminToken,
        userTransferAuthority: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([admin])
      .rpc();

    const vaultTokenAccount = await tokenMint.getAccountInfo(tokenVault);
    assert.strictEqual(500_000_000, vaultTokenAccount.amount.toNumber());

    const afterVaultAccount = await program.account.vault.fetch(vault);
    assert.strictEqual(afterVaultAccount.totalAmount.toString(), "500000000");
    assert.strictEqual(
      afterVaultAccount.lockedRewardTracker.lastReport.gt(
        beforeVaultAccount.lockedRewardTracker.lastReport
      ),
      true
    );
    assert.strictEqual(
      afterVaultAccount.lockedRewardTracker.lastUpdatedLockedReward.toString(),
      tokenAmount.toString()
    );
  });

  it("funder add reward to vault", async () => {
    const tokenAmount = 200_000_000;
    funderToken = await tokenMint.createAssociatedTokenAccount(
      funder.publicKey
    );
    await tokenMint.mintTo(funderToken, admin, [], tokenAmount + 10);

    const beforeVaultAccount = await program.account.vault.fetch(vault);

    await program.methods
      .reward(new anchor.BN(tokenAmount))
      .accounts({
        vault,
        tokenVault,
        userToken: funderToken,
        userTransferAuthority: funder.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([funder])
      .rpc();

    const vaultTokenAccount = await tokenMint.getAccountInfo(tokenVault);
    assert.strictEqual(700_000_000, vaultTokenAccount.amount.toNumber());

    const afterVaultAccount = await program.account.vault.fetch(vault);
    assert.strictEqual(afterVaultAccount.totalAmount.toString(), "700000000");
    assert.strictEqual(
      afterVaultAccount.lockedRewardTracker.lastReport.gt(
        beforeVaultAccount.lockedRewardTracker.lastReport
      ),
      true
    );
    assert.strictEqual(
      afterVaultAccount.lockedRewardTracker.lastUpdatedLockedReward.gt(
        beforeVaultAccount.lockedRewardTracker.lastUpdatedLockedReward
      ),
      true
    );
  });

  it("unstake from vault", async () => {
    const lpAmount = 200_000_000;

    const beforeUserTokenBalance = await tokenMint.getAccountInfo(userToken);

    await program.methods
      .unstake(new anchor.BN(lpAmount))
      .accounts({
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const afterUserTokenAccount = await tokenMint.getAccountInfo(userToken);
    assert.deepStrictEqual(
      afterUserTokenAccount.amount.gt(beforeUserTokenBalance.amount),
      true
    );

    const userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(100_000_000, userLpTokenAccount.amount.toNumber());
  });

  it("fail to unstake others LP token", async () => {
    let result = program.methods
      .unstake(new anchor.BN(10))
      .accounts({
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([admin]) // admin unstake user lp
      .rpc();

    await assert.rejects(result);
  });

  it("update locked reward degradation", async () => {
    let newRewardDegradation = 200000000000; //5 seconds
    await program.methods
      .updateLockedRewardDegradation(new anchor.BN(newRewardDegradation))
      .accounts({
        vault,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    let vaultAccount = await program.account.vault.fetch(vault);
    assert.strictEqual(
      newRewardDegradation,
      vaultAccount.lockedRewardTracker.lockedRewardDegradation.toNumber()
    );
  });

  it("unstake after waiting for profit drip", async () => {
    // wait 1 seconds
    await wait(1);
    let lpAmount = 50_000_000;

    await program.methods
      .unstake(new anchor.BN(lpAmount))
      .accounts({
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    var userTokenAccount = await tokenMint.getAccountInfo(userToken);
    console.log(userTokenAccount.amount.toNumber());

    var userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(50_000_000, userLpTokenAccount.amount.toNumber());

    // wait 4 seconds
    await wait(4);

    // after 5 seconds, profit is fully dripped
    await program.methods
      .unstake(new anchor.BN(lpAmount))
      .accounts({
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vault);
    // only 1 staker, and profit was fully dripped
    assert.deepStrictEqual(vaultAccount.totalAmount.toNumber(), 0);

    var userTokenAccount = await tokenMint.getAccountInfo(userToken);
    assert.strictEqual(700_000_000, userTokenAccount.amount.toNumber());

    var userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.strictEqual(0, userLpTokenAccount.amount.toNumber());
  });

  it("vault functional after depleted", async () => {
    const tokenAmount = 200_000_000;

    // Make sure it is depleted
    var [vaultAccount, lpMintSupply] = await Promise.all([
      program.account.vault.fetch(vault),
      program.provider.connection.getTokenSupply(lpMint),
    ]);

    assert.deepStrictEqual(vaultAccount.totalAmount.toString(), "0");
    assert.deepStrictEqual(lpMintSupply.value.amount, "0");

    await program.methods
      .stake(new anchor.BN(tokenAmount))
      .accounts({
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    var [userLpBalance, lpMintSupply] = await Promise.all([
      vaultLpToken.getAccountInfo(userLp),
      program.provider.connection.getTokenSupply(lpMint),
    ]);

    // Depleted vault mint correct lp amount
    assert.deepStrictEqual(
      userLpBalance.amount.toString(),
      tokenAmount.toString()
    );
    assert.deepStrictEqual(
      lpMintSupply.value.amount,
      userLpBalance.amount.toString()
    );

    // Admin deposit some reward
    await tokenMint.mintTo(adminToken, admin, [], tokenAmount);
    await program.methods
      .reward(new anchor.BN(tokenAmount))
      .accounts({
        vault,
        tokenVault,
        userToken: adminToken,
        userTransferAuthority: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([admin])
      .rpc();

    let seconds = 5;
    while (seconds-- > 0) {
      await sleep(1);

      // withdraw all liquidity, with partially dripped profit
      var userLpBalance = await vaultLpToken.getAccountInfo(userLp);
      await program.methods
        .unstake(userLpBalance.amount)
        .accounts({
          vault,
          tokenVault,
          lpMint,
          userToken,
          userLp,
          userTransferAuthority: user.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      var [userLpBalance, lpMintSupply, vaultAccount] = await Promise.all([
        vaultLpToken.getAccountInfo(userLp),
        program.provider.connection.getTokenSupply(lpMint),
        program.account.vault.fetch(vault),
      ]);

      assert.deepStrictEqual(userLpBalance.amount.toString(), "0");
      assert.deepStrictEqual(lpMintSupply.value.amount, "0");

      if (seconds > 0) {
        assert.deepStrictEqual(
          vaultAccount.totalAmount.gt(new anchor.BN(0)),
          true
        );

        // Stake again, to get unfinished dripping profit
        await program.methods
          .stake(new anchor.BN(tokenAmount))
          .accounts({
            vault,
            tokenVault,
            lpMint,
            userToken,
            userLp,
            userTransferAuthority: user.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();

        var [userLpBalance, lpMintSupply, vaultAccount] = await Promise.all([
          vaultLpToken.getAccountInfo(userLp),
          program.provider.connection.getTokenSupply(lpMint),
          program.account.vault.fetch(vault),
        ]);

        // Make sure it's minting LP upon staking
        assert.deepStrictEqual(
          userLpBalance.amount.toString(),
          lpMintSupply.value.amount.toString()
        );

        // Virtual price > 1 when it is fully unlocked
        const precision = new anchor.BN(100_000_000);
        const virtualPrice = vaultAccount.totalAmount
          .mul(precision)
          .div(new anchor.BN(lpMintSupply.value.amount));

        assert.deepStrictEqual(virtualPrice.gt(precision), true);
      }
    }
  });

  it("fail to stake 0 amount", async () => {
    let result = program.methods
      .stake(new anchor.BN(0))
      .accounts({
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();
    await assert.rejects(result);
  });

  it("transfer admin", async () => {
    await program.methods
      .transferAdmin()
      .accounts({
        vault,
        admin: admin.publicKey,
        newAdmin: newAdmin.publicKey,
      })
      .signers([admin, newAdmin])
      .rpc();
    let vaultAccount = await program.account.vault.fetch(vault);
    assert.strictEqual(
      newAdmin.publicKey.toBase58(),
      vaultAccount.admin.toBase58()
    );

    // new admin able to perform all admin related function
    const tokenAmount = 200_000_000;

    await program.provider.connection
      .requestAirdrop(newAdmin.publicKey, 1_000_000_000)
      .then((sig) => program.provider.connection.confirmTransaction(sig));

    newAdminToken = await tokenMint.createAssociatedTokenAccount(
      newAdmin.publicKey
    );

    await tokenMint.mintTo(newAdminToken, admin, [], tokenAmount);

    await program.methods
      .reward(new anchor.BN(tokenAmount))
      .accounts({
        vault,
        tokenVault,
        userToken: newAdminToken,
        userTransferAuthority: newAdmin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([newAdmin])
      .rpc();

    let newFunder = new anchor.web3.Keypair();
    await program.methods
      .changeFunder()
      .accounts({
        admin: newAdmin.publicKey,
        funder: newFunder.publicKey,
        vault,
      })
      .signers([newAdmin])
      .rpc();

    const newProfitDegradation = 1_000_000_000_000; // 1 seconds
    await program.methods
      .updateLockedRewardDegradation(new anchor.BN(newProfitDegradation))
      .accounts({
        admin: newAdmin.publicKey,
        vault,
      })
      .signers([newAdmin])
      .rpc();

    // wait for fully drip
    await wait(1);
  });

  it("vault still functional after admin changed", async () => {
    const tokenAmount = 100_000_000;

    await program.methods
      .stake(new anchor.BN(tokenAmount))
      .accounts({
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const beforeVaultAccount = await program.account.vault.fetch(vault);
    const beforeUserTokenAccount = await tokenMint.getAccountInfo(userToken);
    const beforeUserLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);

    assert.deepStrictEqual(
      beforeUserLpTokenAccount.amount.toString(),
      beforeVaultAccount.totalAmount.toString()
    );

    await program.methods
      .unstake(beforeUserLpTokenAccount.amount)
      .accounts({
        vault,
        tokenVault,
        lpMint,
        userToken,
        userLp,
        userTransferAuthority: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const userLpTokenAccount = await vaultLpToken.getAccountInfo(userLp);
    assert.deepStrictEqual(userLpTokenAccount.amount.toString(), "0");

    const afterVaultAccount = await program.account.vault.fetch(vault);
    assert.deepStrictEqual(afterVaultAccount.totalAmount.toString(), "0");

    const afterUserTokenAccount = await tokenMint.getAccountInfo(userToken);
    assert.deepStrictEqual(
      beforeUserTokenAccount.amount
        .add(beforeVaultAccount.totalAmount)
        .eq(afterUserTokenAccount.amount),
      true
    );
  });
});

async function wait(seconds) {
  while (seconds > 0) {
    console.log("countdown " + seconds--);
    await new Promise((a) => setTimeout(a, 1000));
  }
  console.log("wait over");
}
