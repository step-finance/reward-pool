import * as anchor from "@project-serum/anchor";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { BN } from "bn.js";
import { Staking } from "../../target/types/staking";
import assert from "assert";
import { AnchorError } from "@project-serum/anchor";
import { sleep } from "@project-serum/common";
import {
  isAssertEntry,
  isExpressionStatement,
  isRegularExpressionLiteral,
} from "typescript";
import { getClock } from "../clock";

const { PublicKey, Keypair, LAMPORTS_PER_SOL } = anchor.web3;
type BN = anchor.BN;
type PublicKey = anchor.web3.PublicKey;
type Keypair = anchor.web3.Keypair;

const program = anchor.workspace.Staking as anchor.Program<Staking>;
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const adminKeypair = new Keypair();
const userKeypair = new Keypair();

function computeRewardRate(rewardAmount: BN, rewardDuration: BN) {
  const annualMultiplier = new BN(86400 * 365).div(rewardDuration);
  return annualMultiplier.mul(rewardAmount);
}

async function assertAnchorError(result: Promise<string>, errorCode: string) {
  try {
    await result;
  } catch (error) {
    assert.strictEqual(error instanceof AnchorError, true);
    let anchorError = error as AnchorError;
    assert.strictEqual(anchorError.error.errorCode.code, errorCode);
  }
}

async function waitUntilOnChainTime(
  connection: anchor.web3.Connection,
  time: number
) {
  let onChainTime = 0;
  do {
    const clock = await getClock(connection);
    onChainTime = clock.info.unixTimestamp;
  } while (onChainTime <= time);
}

describe("staking", () => {
  let pool: PublicKey;
  let stakingVault: PublicKey;
  let stakingMint: PublicKey;
  let xMerRewardMint: PublicKey;
  let stakingToken: Token;
  let xMerRewardToken: Token;
  let xMerRewardVault: PublicKey;
  let userStakingToken: PublicKey;
  let adminStakingToken: PublicKey;
  let jupRewardVault: PublicKey;
  let jupToken: Token;
  let userJupToken: PublicKey;
  let adminJupToken: PublicKey;
  let user: PublicKey;

  const jupReward = new BN(100_000_000);
  const jupRewardDuration = new BN(10);
  const xMerRewardDuration = new BN(5);
  const poolKeypair = Keypair.generate();
  const jupRewardRate = computeRewardRate(jupReward, jupRewardDuration);

  before(async () => {
    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        userKeypair.publicKey,
        10 * LAMPORTS_PER_SOL
      ),
      "confirmed"
    );

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        adminKeypair.publicKey,
        10 * LAMPORTS_PER_SOL
      ),
      "confirmed"
    );

    pool = poolKeypair.publicKey;

    [stakingVault] = findProgramAddressSync(
      [Buffer.from("staking_vault"), pool.toBuffer()],
      program.programId
    );
    [xMerRewardVault] = findProgramAddressSync(
      [Buffer.from("xmer_reward_vault"), pool.toBuffer()],
      program.programId
    );
    [jupRewardVault] = findProgramAddressSync(
      [Buffer.from("jup_reward_vault"), pool.toBuffer()],
      program.programId
    );
    [user] = findProgramAddressSync(
      [userKeypair.publicKey.toBuffer(), pool.toBuffer()],
      program.programId
    );

    stakingToken = await Token.createMint(
      provider.connection,
      adminKeypair,
      adminKeypair.publicKey,
      null,
      6,
      TOKEN_PROGRAM_ID
    );
    xMerRewardToken = stakingToken;
    stakingMint = stakingToken.publicKey;
    xMerRewardMint = xMerRewardToken.publicKey;

    const userStakingAta = await stakingToken.getOrCreateAssociatedAccountInfo(
      userKeypair.publicKey
    );
    userStakingToken = userStakingAta.address;

    const adminStakingAta = await stakingToken.getOrCreateAssociatedAccountInfo(
      adminKeypair.publicKey
    );
    adminStakingToken = adminStakingAta.address;

    await stakingToken.mintTo(
      userStakingToken,
      adminKeypair.publicKey,
      [adminKeypair],
      new u64(1_000_000_000_000)
    );

    await stakingToken.mintTo(
      adminStakingToken,
      adminKeypair.publicKey,
      [adminKeypair],
      new u64(1_000_000_000_000)
    );

    jupToken = await Token.createMint(
      provider.connection,
      adminKeypair,
      adminKeypair.publicKey,
      null,
      6,
      TOKEN_PROGRAM_ID
    );

    const userJupAta = await jupToken.getOrCreateAssociatedAccountInfo(
      userKeypair.publicKey
    );
    userJupToken = userJupAta.address;

    const adminJupAta = await jupToken.getOrCreateAssociatedAccountInfo(
      adminKeypair.publicKey
    );
    adminJupToken = adminJupAta.address;

    jupToken.mintTo(
      adminJupToken,
      adminKeypair.publicKey,
      [adminKeypair],
      new u64(1_000_000_000_000)
    );
  });

  it("initialize pool", async () => {
    await program.methods
      .initializePool(jupRewardDuration, jupReward, xMerRewardDuration)
      .accounts({
        admin: adminKeypair.publicKey,
        pool,
        stakingMint,
        xmerRewardMint: xMerRewardMint,
        xmerRewardVault: xMerRewardVault,
        systemProgram: anchor.web3.SystemProgram.programId,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([poolKeypair, adminKeypair])
      .rpc();

    const poolState = await program.account.pool.fetch(pool);
    // General info
    assert.strictEqual(
      poolState.stakingMint.toBase58(),
      stakingMint.toBase58()
    );
    assert.strictEqual(
      poolState.stakingVault.toBase58(),
      stakingVault.toBase58()
    );
    assert.strictEqual(
      poolState.jupRewardDuration.toNumber(),
      jupRewardDuration.toNumber()
    );
    assert.strictEqual(poolState.totalStaked.toNumber(), 0);
    assert.strictEqual(
      poolState.admin.toBase58(),
      adminKeypair.publicKey.toBase58()
    );
    // xMer
    assert.strictEqual(
      poolState.xmerRewardMint.toBase58(),
      xMerRewardMint.toBase58()
    );
    assert.strictEqual(
      poolState.xmerRewardVault.toBase58(),
      xMerRewardVault.toBase58()
    );
    assert.strictEqual(poolState.xmerRewardRate.toNumber(), 0);
    assert.strictEqual(poolState.xmerRewardEndTimestamp.toNumber(), 0);
    assert.strictEqual(poolState.xmerRewardPerTokenStored.toNumber(), 0);
    assert.strictEqual(poolState.xmerLastUpdateTime.toNumber(), 0);
    // Jup
    assert.strictEqual(
      poolState.jupRewardMint.toBase58(),
      PublicKey.default.toBase58()
    );
    assert.strictEqual(
      poolState.jupRewardVault.toBase58(),
      PublicKey.default.toBase58()
    );
    assert.strictEqual(
      poolState.jupRewardDuration.toNumber(),
      jupRewardDuration.toNumber()
    );
    assert.strictEqual(poolState.jupLastUpdateTime.toNumber(), 0);
    assert.strictEqual(poolState.jupRewardEndTimestamp.toNumber(), 0);
    assert.strictEqual(poolState.isJupInfoEnable, 0);
    assert.strictEqual(poolState.jupRewardPerTokenStored.toNumber(), 0);
    assert.strictEqual(
      poolState.jupRewardRate.toNumber(),
      jupRewardRate.toNumber()
    );
    assert.strictEqual(poolState.totalFundedJup.toNumber(), 0);
  });

  it("create user", async () => {
    await program.methods
      .createUser()
      .accounts({
        owner: userKeypair.publicKey,
        pool,
        systemProgram: anchor.web3.SystemProgram.programId,
        user,
      })
      .signers([userKeypair])
      .rpc();

    const userState = await program.account.user.fetch(user);
    assert.strictEqual(userState.pool.toBase58(), pool.toBase58());
    assert.strictEqual(
      userState.owner.toBase58(),
      userKeypair.publicKey.toBase58()
    );
    assert.strictEqual(userState.jupRewardPerTokenComplete.toNumber(), 0);
    assert.strictEqual(userState.totalJupReward.toNumber(), 0);
    assert.strictEqual(userState.jupRewardHarvested.toNumber(), 0);
    assert.strictEqual(userState.xmerRewardPerTokenComplete.toNumber(), 0);
    assert.strictEqual(userState.xmerRewardPending.toNumber(), 0);
    assert.strictEqual(userState.balanceStaked.toNumber(), 0);
  });

  it("deposit before xMer and Jup farming start", async () => {
    const depositAmount = new BN(110_000_000);
    await program.methods
      .deposit(depositAmount)
      .accounts({
        owner: userKeypair.publicKey,
        pool,
        stakeFromAccount: userStakingToken,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user,
      })
      .signers([userKeypair])
      .rpc();
    const userState = await program.account.user.fetch(user);
    assert.strictEqual(
      userState.balanceStaked.toNumber(),
      depositAmount.toNumber()
    );
    assert.strictEqual(userState.jupRewardPerTokenComplete.toNumber(), 0);
    assert.strictEqual(userState.totalJupReward.toNumber(), 0);
    assert.strictEqual(userState.jupRewardHarvested.toNumber(), 0);
    assert.strictEqual(userState.xmerRewardPending.toNumber(), 0);
    assert.strictEqual(userState.xmerRewardPerTokenComplete.toNumber(), 0);

    const poolState = await program.account.pool.fetch(pool);
    assert.strictEqual(
      poolState.totalStaked.toNumber(),
      depositAmount.toNumber()
    );
    assert.strictEqual(poolState.jupRewardPerTokenStored.toNumber(), 0);
    assert.strictEqual(poolState.jupLastUpdateTime.toNumber(), 0);
    assert.strictEqual(poolState.jupRewardEndTimestamp.toNumber(), 0);
    assert.strictEqual(poolState.xmerRewardPerTokenStored.toNumber(), 0);
    assert.strictEqual(poolState.xmerLastUpdateTime.toNumber(), 0);
    assert.strictEqual(poolState.xmerRewardEndTimestamp.toNumber(), 0);

    const stakingVaultBalance =
      await provider.connection.getTokenAccountBalance(stakingVault);
    assert.strictEqual(
      stakingVaultBalance.value.amount,
      depositAmount.toString()
    );
  });

  it("withdraw before xMer and Jup farming start", async () => {
    const withdrawAmount = new BN(10_000_000);
    const expectedAmount = new BN(100_000_000);
    await program.methods
      .withdraw(withdrawAmount)
      .accounts({
        owner: userKeypair.publicKey,
        pool,
        stakeFromAccount: userStakingToken,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user,
      })
      .signers([userKeypair])
      .rpc();

    const userState = await program.account.user.fetch(user);
    assert.strictEqual(
      userState.balanceStaked.toNumber(),
      expectedAmount.toNumber()
    );
    assert.strictEqual(userState.jupRewardPerTokenComplete.toNumber(), 0);
    assert.strictEqual(userState.totalJupReward.toNumber(), 0);
    assert.strictEqual(userState.jupRewardHarvested.toNumber(), 0);
    assert.strictEqual(userState.xmerRewardPending.toNumber(), 0);
    assert.strictEqual(userState.xmerRewardPerTokenComplete.toNumber(), 0);

    const poolState = await program.account.pool.fetch(pool);
    assert.strictEqual(
      poolState.totalStaked.toNumber(),
      expectedAmount.toNumber()
    );
    assert.strictEqual(poolState.jupRewardPerTokenStored.toNumber(), 0);
    assert.strictEqual(poolState.jupLastUpdateTime.toNumber(), 0);
    assert.strictEqual(poolState.jupRewardEndTimestamp.toNumber(), 0);
    assert.strictEqual(poolState.xmerRewardPerTokenStored.toNumber(), 0);
    assert.strictEqual(poolState.xmerLastUpdateTime.toNumber(), 0);
    assert.strictEqual(poolState.xmerRewardEndTimestamp.toNumber(), 0);

    const stakingVaultBalance =
      await provider.connection.getTokenAccountBalance(stakingVault);
    assert.strictEqual(
      stakingVaultBalance.value.amount,
      expectedAmount.toString()
    );
  });

  it("full staking", async () => {
    const beforeStakingBalance =
      await provider.connection.getTokenAccountBalance(userStakingToken);
    await program.methods
      .depositFull()
      .accounts({
        owner: userKeypair.publicKey,
        pool,
        stakeFromAccount: userStakingToken,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user,
      })
      .signers([userKeypair])
      .rpc();
    const afterStakingBalance =
      await provider.connection.getTokenAccountBalance(userStakingToken);
    assert.deepStrictEqual(afterStakingBalance.value.uiAmount, 0);

    // Withdraw out exact amount, small amount make life easier
    await program.methods
      .withdraw(new BN(beforeStakingBalance.value.amount))
      .accounts({
        owner: userKeypair.publicKey,
        pool,
        stakeFromAccount: userStakingToken,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user,
      })
      .signers([userKeypair])
      .rpc();
  });

  it("unauthorized couldn't activate xMer farming by funding", async () => {
    const fundAmount = new BN(100_000_000);
    const fundXMer = program.methods
      .fundXmer(fundAmount)
      .accounts({
        fromXmer: userStakingToken,
        funder: userKeypair.publicKey,
        pool,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        xmerRewardVault: xMerRewardVault,
      })
      .signers([userKeypair])
      .rpc();
    assert.rejects(fundXMer);
  });

  it("admin activate xMer farming by funding", async () => {
    const fundAmount = new BN(100_000_000);
    await program.methods
      .fundXmer(fundAmount)
      .accounts({
        fromXmer: adminStakingToken,
        funder: adminKeypair.publicKey,
        pool,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        xmerRewardVault: xMerRewardVault,
      })
      .signers([adminKeypair])
      .rpc();
    const poolState = await program.account.pool.fetch(pool);

    assert.strictEqual(poolState.jupRewardPerTokenStored.toNumber(), 0);
    assert.strictEqual(poolState.jupLastUpdateTime.toNumber(), 0);
    assert.strictEqual(poolState.jupRewardEndTimestamp.toNumber(), 0);
    assert.strictEqual(poolState.xmerRewardPerTokenStored.toNumber(), 0);

    assert.notStrictEqual(poolState.xmerLastUpdateTime.toNumber(), 0);
    assert.notStrictEqual(poolState.xmerRewardEndTimestamp.toNumber(), 0);

    const xMerRewardVaultBalance =
      await provider.connection.getTokenAccountBalance(xMerRewardVault);
    assert.notStrictEqual(xMerRewardVaultBalance.value.amount, "0");
  });

  it("deposit after xMer farm started", async () => {
    await sleep(1000); // Sleep for 1 seconds, when user deposit, the program will calculate the reward for 0 -> 1 seconds
    const depositAmount = new BN(100_000_000);
    await program.methods
      .deposit(depositAmount)
      .accounts({
        owner: userKeypair.publicKey,
        pool,
        stakeFromAccount: userStakingToken,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user,
      })
      .signers([userKeypair])
      .rpc();

    const totalStaked = new BN(200_000_000);
    const userState = await program.account.user.fetch(user);
    assert.strictEqual(
      userState.balanceStaked.toNumber(),
      totalStaked.toNumber()
    );
    assert.strictEqual(userState.jupRewardPerTokenComplete.toNumber(), 0);
    assert.strictEqual(userState.totalJupReward.toNumber(), 0);
    assert.strictEqual(userState.jupRewardHarvested.toNumber(), 0);
    assert.notStrictEqual(userState.xmerRewardPending.toNumber(), 0);
    assert.notStrictEqual(userState.xmerRewardPerTokenComplete.toNumber(), 0);

    const poolState = await program.account.pool.fetch(pool);
    assert.strictEqual(
      poolState.totalStaked.toNumber(),
      totalStaked.toNumber()
    );
    assert.strictEqual(poolState.jupRewardPerTokenStored.toNumber(), 0);
    assert.strictEqual(poolState.jupLastUpdateTime.toNumber(), 0);
    assert.strictEqual(poolState.jupRewardEndTimestamp.toNumber(), 0);

    assert.notStrictEqual(poolState.xmerRewardPerTokenStored.toNumber(), 0);
    assert.notStrictEqual(poolState.xmerLastUpdateTime.toNumber(), 0);
    assert.notStrictEqual(poolState.xmerRewardEndTimestamp.toNumber(), 0);
  });

  it("able to claim xMer before farm expire", async () => {
    const beforeUserXMerBalance =
      await provider.connection.getTokenAccountBalance(userStakingToken);
    await program.methods
      .claimXmer()
      .accounts({
        owner: userKeypair.publicKey,
        pool,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user,
        xmerRewardAccount: userStakingToken,
        xmerRewardVault: xMerRewardVault,
      })
      .signers([userKeypair])
      .rpc();
    const afterUserXMerBalance =
      await provider.connection.getTokenAccountBalance(userStakingToken);
    assert.strictEqual(
      afterUserXMerBalance.value.uiAmount >
        beforeUserXMerBalance.value.uiAmount,
      true
    );

    const userState = await program.account.user.fetch(user);
    assert.strictEqual(userState.jupRewardPerTokenComplete.toNumber(), 0);
    assert.strictEqual(userState.totalJupReward.toNumber(), 0);
    assert.strictEqual(userState.jupRewardHarvested.toNumber(), 0);
    assert.strictEqual(userState.xmerRewardPending.toNumber(), 0);
  });

  it("unauthorized unable to activate jup farming", async () => {
    const activateJupFarming = program.methods
      .activateJupFarming()
      .accounts({
        admin: userKeypair.publicKey,
        pool,
      })
      .signers([userKeypair])
      .rpc();
    assert.rejects(activateJupFarming);
  });

  it("activate jup farming", async () => {
    await program.methods
      .activateJupFarming()
      .accounts({
        admin: adminKeypair.publicKey,
        pool,
      })
      .signers([adminKeypair])
      .rpc();
    const poolState = await program.account.pool.fetch(pool);
    assert.notStrictEqual(poolState.jupLastUpdateTime.toNumber(), 0);
    assert.notStrictEqual(poolState.jupRewardEndTimestamp.toNumber(), 0);
  });

  it("start accumulate jup reward", async () => {
    await sleep(1000);
    // User claim xMer, which will trigger the program to compute the reward from 1 seconds -> 2 seconds time window
    await program.methods
      .claimXmer()
      .accounts({
        owner: userKeypair.publicKey,
        pool,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user,
        xmerRewardAccount: userStakingToken,
        xmerRewardVault: xMerRewardVault,
      })
      .signers([userKeypair])
      .rpc();

    const userState = await program.account.user.fetch(user);
    assert.notStrictEqual(userState.jupRewardPerTokenComplete.toNumber(), 0);
    // Accumulated some JUP
    assert.notStrictEqual(userState.totalJupReward.toNumber(), 0);

    assert.strictEqual(userState.jupRewardHarvested.toNumber(), 0);
    assert.strictEqual(userState.xmerRewardPending.toNumber(), 0);
  });

  it("unable to set jup info until jup reward accumulation end", async () => {
    const setJupInformation = program.methods
      .setJupInformation()
      .accounts({
        admin: adminKeypair.publicKey,
        jupRewardMint: jupToken.publicKey,
        jupRewardVault,
        pool,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        stakingVault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();
    await assertAnchorError(setJupInformation, "ConstraintRaw");
  });

  it("unable to fund jup until jup reward accumulation end", async () => {
    const fundAmount = new BN(100_000_000);
    const fundJup = program.methods
      .fundJup(fundAmount)
      .accounts({
        fromJup: adminJupToken,
        funder: adminKeypair.publicKey,
        jupRewardVault,
        pool,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();
    assert.rejects(fundJup);
  });

  it("unable to claim jup until jup reward accumulation end", async () => {
    const claimJup = program.methods
      .claimJup()
      .accounts({
        jupRewardAccount: userJupToken,
        jupRewardVault,
        owner: userKeypair.publicKey,
        pool,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user,
      })
      .signers([userKeypair])
      .rpc();
    assert.rejects(claimJup);
  });

  it("able to claim xMer after xMer farming expire", async () => {
    const poolState = await program.account.pool.fetch(pool);
    await waitUntilOnChainTime(
      provider.connection,
      poolState.xmerRewardEndTimestamp.toNumber()
    );
    const beforeUserXMerBalance =
      await provider.connection.getTokenAccountBalance(userStakingToken);
    await program.methods
      .claimXmer()
      .accounts({
        owner: userKeypair.publicKey,
        pool,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user,
        xmerRewardAccount: userStakingToken,
        xmerRewardVault: xMerRewardVault,
      })
      .signers([userKeypair])
      .rpc();

    const afterUserXMerBalance =
      await provider.connection.getTokenAccountBalance(userStakingToken);
    assert.strictEqual(
      afterUserXMerBalance.value.uiAmount >
        beforeUserXMerBalance.value.uiAmount,
      true
    );

    const xMerRewardVaultBalance =
      await provider.connection.getTokenAccountBalance(xMerRewardVault);
    assert.strictEqual(xMerRewardVaultBalance.value.uiAmount, 0);

    const userState = await program.account.user.fetch(user);
    assert.strictEqual(userState.xmerRewardPending.toNumber(), 0);
  });

  it("continue accumulate jup even xmer farm expired", async () => {
    await sleep(1000);
    const beforeUserState = await program.account.user.fetch(user);
    // To trigger reward update
    await program.methods
      .claimXmer()
      .accounts({
        owner: userKeypair.publicKey,
        pool,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user,
        xmerRewardAccount: userStakingToken,
        xmerRewardVault: xMerRewardVault,
      })
      .signers([userKeypair])
      .rpc();
    const afterUserState = await program.account.user.fetch(user);
    assert.strictEqual(
      afterUserState.totalJupReward.toNumber() >
        beforeUserState.totalJupReward.toNumber(),
      true
    );
  });

  it("able to set jup info after jup reward accumulation end", async () => {
    const poolState = await program.account.pool.fetch(pool);
    await waitUntilOnChainTime(
      provider.connection,
      poolState.jupRewardEndTimestamp.toNumber()
    );
    await program.methods
      .setJupInformation()
      .accounts({
        admin: adminKeypair.publicKey,
        jupRewardMint: jupToken.publicKey,
        jupRewardVault,
        pool,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        stakingVault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();
  });

  it("able to fund jup after jup info was set", async () => {
    const fundAmount = jupReward.div(new BN(10));
    await program.methods
      .fundJup(fundAmount)
      .accounts({
        fromJup: adminJupToken,
        funder: adminKeypair.publicKey,
        jupRewardVault,
        pool,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();
    const poolState = await program.account.pool.fetch(pool);
    assert.strictEqual(
      poolState.totalFundedJup.toNumber(),
      fundAmount.toNumber()
    );
  });

  it("able to claim jup", async () => {
    const beforeUserJupBalance =
      await provider.connection.getTokenAccountBalance(userJupToken);
    const beforeUserState = await program.account.user.fetch(user);

    await program.methods
      .claimJup()
      .accounts({
        jupRewardAccount: userJupToken,
        jupRewardVault,
        owner: userKeypair.publicKey,
        pool,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user,
      })
      .signers([userKeypair])
      .rpc();
    const afterUserJupBalance =
      await provider.connection.getTokenAccountBalance(userJupToken);
    const afterUserState = await program.account.user.fetch(user);

    assert.strictEqual(
      afterUserJupBalance.value.uiAmount > beforeUserJupBalance.value.uiAmount,
      true
    );

    assert.strictEqual(
      afterUserState.jupRewardHarvested.toNumber() >
        beforeUserState.jupRewardHarvested.toNumber(),
      true
    );
  });

  it("fund amount will be capped by jup_reward_amount", async () => {
    const adminJupBalance = await provider.connection.getTokenAccountBalance(
      adminJupToken
    );
    // This is a lot more than the jup_reward_amount
    const fundAmount = new BN(adminJupBalance.value.amount);
    await program.methods
      .fundJup(fundAmount)
      .accounts({
        fromJup: adminJupToken,
        funder: adminKeypair.publicKey,
        jupRewardVault,
        pool,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();
    const poolState = await program.account.pool.fetch(pool);
    assert.strictEqual(
      poolState.totalFundedJup.toNumber(),
      jupReward.toNumber()
    );
  });

  it("able to claim when admin fund it again", async () => {
    await program.methods
      .claimJup()
      .accounts({
        jupRewardAccount: userJupToken,
        jupRewardVault,
        owner: userKeypair.publicKey,
        pool,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user,
      })
      .signers([userKeypair])
      .rpc();
    const userState = await program.account.user.fetch(user);

    assert.strictEqual(
      userState.jupRewardHarvested.toNumber(),
      jupReward.toNumber()
    );
  });
});
