import assert from "assert";

import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { sleep } from "@project-serum/common";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ParsedAccountData, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { Staking } from "../../target/types/staking";
import { ParsedClockState } from "../clock_state";
import { calculateApy, getUnlockedAmount } from "./utils";
import { Vault } from "./vault_state";

type Pubkey = anchor.web3.PublicKey;
const BN = anchor.BN;
type BN = anchor.BN;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.Staking as Program<Staking>;
const admin = new anchor.web3.Keypair();
const vaultKeypair = new anchor.web3.Keypair();
const base = new anchor.web3.Keypair();
const user = new anchor.web3.Keypair();
const user2 = new anchor.web3.Keypair();

let tokenVault: Pubkey | null;
let tokenMint: Token | null; // MER
let vault: Pubkey | null;
let lpMint: Pubkey | null; // xMER
let vaultLpToken: Token | null;
let userToken: Pubkey | null;
let user2Token: Pubkey | null;
let userLp: Pubkey | null;
let user2Lp: Pubkey | null;
let adminToken: Pubkey | null;

describe("staking apy", () => {
  before(async () => {
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

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(user2.publicKey, 10000000000),
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

    [tokenVault] = await anchor.web3.PublicKey.findProgramAddress(
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

    vaultLpToken = new Token(
      provider.connection,
      lpMint,
      TOKEN_PROGRAM_ID,
      admin
    );

    userToken = await tokenMint.createAssociatedTokenAccount(user.publicKey);
    userLp = await vaultLpToken.createAssociatedTokenAccount(user.publicKey);
    user2Token = await tokenMint.createAssociatedTokenAccount(user2.publicKey);
    user2Lp = await vaultLpToken.createAssociatedTokenAccount(user2.publicKey);
    adminToken = await tokenMint.createAssociatedTokenAccount(admin.publicKey);

    // mint some token to user 1 and 2, and admin firstly
    await tokenMint.mintTo(userToken, admin, [], 100_000_000);
    await tokenMint.mintTo(user2Token, admin, [], 100_000_000);
    await tokenMint.mintTo(adminToken, admin, [], 100_000_000);

    // profit fully dripped in 1 day
    await program.methods
      .updateLockedRewardDegradation(new anchor.BN(11574075))
      .accounts({
        admin: admin.publicKey,
        vault,
      })
      .signers([admin])
      .rpc();
  });

  it("user 1 stake, no reward deposited, 0 apy", async () => {
    await program.methods
      .stake(new anchor.BN(100_000_000))
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

    // elapsed 1 seconds
    await sleep(1 * 1000);

    // since no reward, apy = 0
    let apy = await calculateApy(vault, program);
    assert.deepStrictEqual(apy, 0);
  });

  it("admin deposit reward, apy > 0", async () => {
    await program.methods
      .reward(new anchor.BN(100_000))
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault,
        userToken: adminToken,
        userTransferAuthority: admin.publicKey,
        vault,
      })
      .signers([admin])
      .rpc();

    const apy = await calculateApy(vault, program);
    console.log("APY after admin deposit", apy);
    assert.deepStrictEqual(apy > 0, true);
  });

  it("APY decreases as profit drip", async () => {
    let beforeApy = await calculateApy(vault, program);
    let largestApyDelta = 0;

    let count = 0;
    while (count++ < 5) {
      await sleep(2 * 1000);
      let apy = await calculateApy(vault, program);
      console.log(apy);
      assert.deepStrictEqual(apy < beforeApy, true);

      const apyDelta = beforeApy - apy;
      if (largestApyDelta < apyDelta) {
        largestApyDelta = apyDelta;
      }

      beforeApy = apy;
    }
  });

  it("APY drop when more stake amount", async () => {
    // The higher the staked amount, the lower the APY
    const beforeApy = await calculateApy(vault, program);
    console.log("APY with 100_000_000 stake amount", beforeApy);
    await program.methods
      .stake(new anchor.BN(100_000_000))
      .accounts({
        lpMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault,
        userLp: user2Lp,
        userToken: user2Token,
        userTransferAuthority: user2.publicKey,
        vault,
      })
      .signers([user2])
      .rpc();
    const afterApy = await calculateApy(vault, program);
    console.log("APY with 200_000_000 stake amount", afterApy);
    assert.deepStrictEqual(afterApy < beforeApy, true);
  });

  it("APY increase when admin fund more reward", async () => {
    const beforeApy = await calculateApy(vault, program);
    console.log("APY before admin fund 100_000", beforeApy);
    await program.methods
      .reward(new anchor.BN(100_000))
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault,
        userToken: adminToken,
        userTransferAuthority: admin.publicKey,
        vault,
      })
      .signers([admin])
      .rpc();
    const afterApy = await calculateApy(vault, program);
    console.log("APY after admin fund 100_000", afterApy);
    assert.deepStrictEqual(afterApy > beforeApy, true);
  });

  it("Do not increase APY when directly deposit token to vault", async () => {
    const beforeApy = await calculateApy(vault, program);
    console.log("APY before direct deposit", beforeApy);
    await tokenMint.mintTo(tokenVault, admin, [], 100_000_000);
    const afterApy = await calculateApy(vault, program);
    console.log("APY after after direct deposit", afterApy);
    assert.deepStrictEqual(afterApy <= beforeApy, true);
  });

  it("Admin increase locked profit degradation will increase APY", async () => {
    const beforeApy = await calculateApy(vault, program);
    console.log("APY before increase locked profit degradation", beforeApy);
    // 10 seconds
    const newLockedProfitDegradation = new anchor.BN(100_000_000_000);
    await program.methods
      .updateLockedRewardDegradation(newLockedProfitDegradation)
      .accounts({
        admin: admin.publicKey,
        vault,
      })
      .signers([admin])
      .rpc();
    const afterApy = await calculateApy(vault, program);
    console.log("APY after increase locked profit degradation", afterApy);
    assert.deepStrictEqual(afterApy > beforeApy, true);
  });

  it("APY = 0, when profit is fully dripped", async () => {
    let profitFullyDripped = false;
    do {
      const [clock, vaultState] = await Promise.all([
        program.provider.connection.getParsedAccountInfo(SYSVAR_CLOCK_PUBKEY),
        program.account.vault.fetch(vault),
      ]);
      const clockState = (clock.value.data as ParsedAccountData)
        .parsed as ParsedClockState;
      const unlockedAmount = getUnlockedAmount(
        vaultState as unknown as Vault,
        clockState.info.unixTimestamp
      );
      profitFullyDripped = unlockedAmount.eq(vaultState.totalAmount);
    } while (!profitFullyDripped);

    const apy = await calculateApy(vault, program);
    console.log("APY after profit is fully dripped", apy);
    assert.deepStrictEqual(apy, 0);
  });
});
