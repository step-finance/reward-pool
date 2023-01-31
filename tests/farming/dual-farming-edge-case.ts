import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  LAMPORTS_PER_SOL,
  SYSVAR_CLOCK_PUBKEY,
  ParsedAccountData,
} from "@solana/web3.js";
import { Farming } from "../../target/types/farming";
import {
  getPoolPda,
  getRewardAVaultPda,
  getRewardBVaultPda,
  getStakingVaultPda,
  getUserPda,
  REWARD_DURATION,
} from "./utils";
import assert from "assert";
import { ParsedClockState } from "../clock";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.Farming as Program<Farming>;
const BASE_KEYPAIR = anchor.web3.Keypair.generate();
const ADMIN_KEYPAIR = anchor.web3.Keypair.generate();
const USER_KEYPAIR = anchor.web3.Keypair.generate();
const FUNDER_KEYPAIR = anchor.web3.Keypair.generate();

const TOKEN_DECIMAL = 3;
const TOKEN_MULTIPLIER = new anchor.BN(10 ** TOKEN_DECIMAL);
const MINT_AMOUNT = new anchor.BN(100_000).mul(TOKEN_MULTIPLIER);
const FUND_AMOUNT = new anchor.BN(10_000).mul(TOKEN_MULTIPLIER);
const DEPOSIT_AMOUNT = new anchor.BN(500).mul(TOKEN_MULTIPLIER);
const UNSTAKE_AMOUNT = new anchor.BN(500).mul(TOKEN_MULTIPLIER);

let totalFundAmount = new anchor.BN(0);
let nonOwnerRewardAPhaseOne = new anchor.BN(0);
let nonOwnerRewardBPhaseOne = new anchor.BN(0);
let nonOwnerRewardAPhaseTwo = new anchor.BN(0);
let nonOwnerRewardBPhaseTwo = new anchor.BN(0);

function sleep(ms: number) {
  return new Promise((res) => {
    setTimeout(res, ms);
  });
}

describe("dual-farming-edge-case", () => {
  let stakingMint: anchor.web3.PublicKey = null;
  let rewardAMint: anchor.web3.PublicKey = null;
  let rewardBMint: anchor.web3.PublicKey = null;

  let stakingToken: Token = null;
  let rewardAToken: Token = null;
  let rewardBToken: Token = null;

  let userStakingATA: anchor.web3.PublicKey = null;
  let userRewardAATA: anchor.web3.PublicKey = null;
  let userRewardBATA: anchor.web3.PublicKey = null;

  let adminStakingATA: anchor.web3.PublicKey = null;
  let adminRewardAATA: anchor.web3.PublicKey = null;
  let adminRewardBATA: anchor.web3.PublicKey = null;

  let funderRewardAATA: anchor.web3.PublicKey = null;
  let funderRewardBATA: anchor.web3.PublicKey = null;

  before(async () => {
    let sig = await program.provider.connection.requestAirdrop(
      ADMIN_KEYPAIR.publicKey,
      100 * LAMPORTS_PER_SOL
    );
    await program.provider.connection.confirmTransaction(sig);

    sig = await program.provider.connection.requestAirdrop(
      USER_KEYPAIR.publicKey,
      100 * LAMPORTS_PER_SOL
    );
    await program.provider.connection.confirmTransaction(sig);

    sig = await program.provider.connection.requestAirdrop(
      FUNDER_KEYPAIR.publicKey,
      100 * LAMPORTS_PER_SOL
    );
    await program.provider.connection.confirmTransaction(sig);

    stakingToken = await Token.createMint(
      program.provider.connection,
      ADMIN_KEYPAIR,
      ADMIN_KEYPAIR.publicKey,
      null,
      TOKEN_DECIMAL,
      TOKEN_PROGRAM_ID
    );
    stakingMint = stakingToken.publicKey;
    userStakingATA = await stakingToken.createAssociatedTokenAccount(
      USER_KEYPAIR.publicKey
    );
    adminStakingATA = await stakingToken.createAssociatedTokenAccount(
      ADMIN_KEYPAIR.publicKey
    );

    rewardAToken = await Token.createMint(
      program.provider.connection,
      ADMIN_KEYPAIR,
      ADMIN_KEYPAIR.publicKey,
      null,
      TOKEN_DECIMAL,
      TOKEN_PROGRAM_ID
    );
    rewardAMint = rewardAToken.publicKey;
    userRewardAATA = await rewardAToken.createAssociatedTokenAccount(
      USER_KEYPAIR.publicKey
    );
    adminRewardAATA = await rewardAToken.createAssociatedTokenAccount(
      ADMIN_KEYPAIR.publicKey
    );
    funderRewardAATA = await rewardAToken.createAssociatedTokenAccount(
      FUNDER_KEYPAIR.publicKey
    );

    rewardBToken = await Token.createMint(
      program.provider.connection,
      ADMIN_KEYPAIR,
      ADMIN_KEYPAIR.publicKey,
      null,
      TOKEN_DECIMAL,
      TOKEN_PROGRAM_ID
    );
    rewardBMint = rewardBToken.publicKey;
    userRewardBATA = await rewardBToken.createAssociatedTokenAccount(
      USER_KEYPAIR.publicKey
    );
    adminRewardBATA = await rewardBToken.createAssociatedTokenAccount(
      ADMIN_KEYPAIR.publicKey
    );
    funderRewardBATA = await rewardBToken.createAssociatedTokenAccount(
      FUNDER_KEYPAIR.publicKey
    );

    await stakingToken.mintTo(
      userStakingATA,
      ADMIN_KEYPAIR,
      [],
      MINT_AMOUNT.toNumber()
    );
    await rewardAToken.mintTo(
      adminRewardAATA,
      ADMIN_KEYPAIR,
      [],
      MINT_AMOUNT.toNumber()
    );
    await rewardBToken.mintTo(
      adminRewardBATA,
      ADMIN_KEYPAIR,
      [],
      MINT_AMOUNT.toNumber()
    );
    await rewardAToken.mintTo(
      funderRewardAATA,
      ADMIN_KEYPAIR,
      [],
      MINT_AMOUNT.toNumber()
    );
    await rewardBToken.mintTo(
      funderRewardBATA,
      ADMIN_KEYPAIR,
      [],
      MINT_AMOUNT.toNumber()
    );

    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());
  });

  it("initialize dual-farming pool", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey
    );
    const [stakingVaultAddress, _stakingVaultBump] = await getStakingVaultPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey
    );
    const [rewardAVaultAddress, _rewardAVaultBump] = await getRewardAVaultPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey
    );
    const [rewardBVaultAddress, _rewardBVaultBump] = await getRewardBVaultPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey
    );
    await program.methods
      .initializePool(REWARD_DURATION)
      .accounts({
        authority: ADMIN_KEYPAIR.publicKey,
        base: BASE_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        rewardAMint,
        rewardBMint,
        rewardAVault: rewardAVaultAddress,
        rewardBVault: rewardBVaultAddress,
        stakingMint,
        stakingVault: stakingVaultAddress,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([BASE_KEYPAIR, ADMIN_KEYPAIR])
      .rpc();

    const poolState = await program.account.pool.fetch(farmingPoolAddress);
    assert.deepStrictEqual(
      poolState.authority.toBase58(),
      ADMIN_KEYPAIR.publicKey.toBase58()
    );
    assert.deepStrictEqual(
      poolState.baseKey.toBase58(),
      BASE_KEYPAIR.publicKey.toBase58()
    );
    for (const funder of poolState.funders) {
      assert.deepStrictEqual(
        funder.toBase58(),
        anchor.web3.PublicKey.default.toBase58()
      );
    }
    assert.deepStrictEqual(poolState.lastUpdateTime.toString(), "0");
    assert.deepStrictEqual(poolState.rewardDurationEnd.toString(), "0");
    assert.deepStrictEqual(poolState.rewardARate.toString(), "0");
    assert.deepStrictEqual(poolState.rewardBRate.toString(), "0");
    assert.deepStrictEqual(poolState.rewardAPerTokenStored.toString(), "0");
    assert.deepStrictEqual(poolState.rewardBPerTokenStored.toString(), "0");
    assert.deepStrictEqual(
      poolState.rewardDuration.toString(),
      REWARD_DURATION.toString()
    );
    assert.deepStrictEqual(poolState.paused, false);
    assert.deepStrictEqual(
      poolState.rewardAMint.toBase58(),
      rewardAMint.toBase58()
    );
    assert.deepStrictEqual(
      poolState.rewardBMint.toBase58(),
      rewardBMint.toBase58()
    );
    assert.deepStrictEqual(
      poolState.stakingMint.toBase58(),
      stakingMint.toBase58()
    );
    assert.deepStrictEqual(
      poolState.stakingVault.toBase58(),
      stakingVaultAddress.toBase58()
    );
    assert.deepStrictEqual(
      poolState.rewardAVault.toBase58(),
      rewardAVaultAddress.toBase58()
    );
    assert.deepStrictEqual(
      poolState.rewardBVault.toBase58(),
      rewardBVaultAddress.toBase58()
    );
  });

  it("create new user", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey
    );
    const [userStakingAddress, userStakingAddressBump] = await getUserPda(
      program,
      farmingPoolAddress,
      USER_KEYPAIR.publicKey
    );

    await program.methods
      .createUser()
      .accounts({
        owner: USER_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        systemProgram: anchor.web3.SystemProgram.programId,
        user: userStakingAddress,
      })
      .signers([USER_KEYPAIR])
      .rpc();

    const [userState, poolState] = await Promise.all([
      program.account.user.fetch(userStakingAddress),
      program.account.pool.fetch(farmingPoolAddress),
    ]);

    assert.deepStrictEqual(poolState.userStakeCount.toString(), "1");
    assert.deepStrictEqual(
      userState.pool.toBase58(),
      farmingPoolAddress.toBase58()
    );
    assert.deepStrictEqual(
      userState.owner.toBase58(),
      USER_KEYPAIR.publicKey.toBase58()
    );
    assert.deepStrictEqual(userState.rewardAPerTokenComplete.toString(), "0");
    assert.deepStrictEqual(userState.rewardBPerTokenComplete.toString(), "0");
    assert.deepStrictEqual(userState.rewardAPerTokenPending.toString(), "0");
    assert.deepStrictEqual(userState.rewardBPerTokenPending.toString(), "0");
    assert.deepStrictEqual(userState.balanceStaked.toString(), "0");
    assert.deepStrictEqual(
      userState.nonce.toString(),
      userStakingAddressBump.toString()
    );
  });

  it("fund the pool, and farming start", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey
    );

    let poolState = await program.account.pool.fetch(farmingPoolAddress);
    const [beforeRewardAVaultBalance, beforeRewardBVaultBalance] =
      await Promise.all([
        program.provider.connection.getTokenAccountBalance(
          poolState.rewardAVault
        ),
        program.provider.connection.getTokenAccountBalance(
          poolState.rewardBVault
        ),
      ]);

    await program.methods
      .fund(FUND_AMOUNT, FUND_AMOUNT)
      .accounts({
        fromA: adminRewardAATA,
        fromB: adminRewardBATA,
        funder: ADMIN_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        rewardAVault: poolState.rewardAVault,
        rewardBVault: poolState.rewardBVault,
        stakingVault: poolState.stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([ADMIN_KEYPAIR])
      .rpc();

    totalFundAmount = totalFundAmount.add(FUND_AMOUNT);

    poolState = await program.account.pool.fetch(farmingPoolAddress);

    const expectedRewardDurationEnd =
      poolState.lastUpdateTime.add(REWARD_DURATION);
    assert.deepStrictEqual(
      poolState.rewardDurationEnd.toString(),
      expectedRewardDurationEnd.toString()
    );

    const [afterRewardAVaultBalance, afterRewardBVaultBalance] =
      await Promise.all([
        program.provider.connection.getTokenAccountBalance(
          poolState.rewardAVault
        ),
        program.provider.connection.getTokenAccountBalance(
          poolState.rewardBVault
        ),
      ]);

    const rewardAVaultBalanceIncreased = new anchor.BN(
      afterRewardAVaultBalance.value.amount
    ).gt(new anchor.BN(beforeRewardAVaultBalance.value.amount));
    const rewardBVaultBalanceIncreased = new anchor.BN(
      afterRewardBVaultBalance.value.amount
    ).gt(new anchor.BN(beforeRewardBVaultBalance.value.amount));

    assert.deepStrictEqual(rewardAVaultBalanceIncreased, true);
    assert.deepStrictEqual(rewardBVaultBalanceIncreased, true);
  });

  it("stake to a started farm, with 0 total stake amount", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey
    );

    const [userStakingAddress, _userStakingAddressBump] = await getUserPda(
      program,
      farmingPoolAddress,
      USER_KEYPAIR.publicKey
    );

    let poolState = await program.account.pool.fetch(farmingPoolAddress);

    assert.deepStrictEqual(poolState.lastUpdateTime.toString() != "0", true);
    assert.deepStrictEqual(poolState.rewardDurationEnd.toString() != "0", true);
    assert.deepStrictEqual(poolState.totalStaked.toString(), "0");

    let parsedClock = await program.provider.connection.getParsedAccountInfo(
      SYSVAR_CLOCK_PUBKEY
    );
    let startClockState = (parsedClock.value!.data as ParsedAccountData)
      .parsed as ParsedClockState;

    console.log("Wait for 5 seconds before deposit");

    while (true) {
      await sleep(1000);
      let parsedClock = await program.provider.connection.getParsedAccountInfo(
        SYSVAR_CLOCK_PUBKEY
      );
      let currentClockState = (parsedClock.value!.data as ParsedAccountData)
        .parsed as ParsedClockState;
      if (
        currentClockState.info.unixTimestamp -
          startClockState.info.unixTimestamp >
        5
      ) {
        break;
      }
    }

    await program.methods
      .deposit(DEPOSIT_AMOUNT)
      .accounts({
        owner: USER_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        stakeFromAccount: userStakingATA,
        stakingVault: poolState.stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user: userStakingAddress,
      })
      .signers([USER_KEYPAIR])
      .rpc();

    const [userState, stakingVaultBalance] = await Promise.all([
      program.account.user.fetch(userStakingAddress),
      program.provider.connection.getTokenAccountBalance(
        poolState.stakingVault
      ),
    ]);

    assert.deepStrictEqual(
      userState.balanceStaked.toString(),
      DEPOSIT_AMOUNT.toString()
    );
    assert.deepStrictEqual(
      stakingVaultBalance.value.amount,
      DEPOSIT_AMOUNT.toString()
    );
  });

  it("user claim reward when pool reward end", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey
    );
    const [userStakingAddress, _userStakingAddressBump] = await getUserPda(
      program,
      farmingPoolAddress,
      USER_KEYPAIR.publicKey
    );

    const [poolState, beforeUserRewardABalance, beforeUserRewardBBalance] =
      await Promise.all([
        program.account.pool.fetch(farmingPoolAddress),
        program.provider.connection.getTokenAccountBalance(userRewardAATA),
        program.provider.connection.getTokenAccountBalance(userRewardBATA),
      ]);

    let clockState: ParsedClockState | null;

    console.log("Wait for reward end");
    do {
      let parsedClock = await program.provider.connection.getParsedAccountInfo(
        SYSVAR_CLOCK_PUBKEY
      );
      clockState = (parsedClock.value!.data as ParsedAccountData)
        .parsed as ParsedClockState;
      await sleep(1000);
    } while (
      clockState.info.unixTimestamp <= poolState.rewardDurationEnd.toNumber()
    );
    console.log("Reward ended");

    await program.methods
      .claim()
      .accounts({
        owner: USER_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        rewardAAccount: userRewardAATA,
        rewardBAccount: userRewardBATA,
        rewardAVault: poolState.rewardAVault,
        rewardBVault: poolState.rewardBVault,
        stakingVault: poolState.stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user: userStakingAddress,
      })
      .signers([USER_KEYPAIR])
      .rpc();

    const [
      afterUserRewardABalance,
      afterUserRewardBBalance,
      afterRewardAVaultBalance,
      afterRewardBVaultBalance,
    ] = await Promise.all([
      program.provider.connection.getTokenAccountBalance(userRewardAATA),
      program.provider.connection.getTokenAccountBalance(userRewardBATA),
      program.provider.connection.getTokenAccountBalance(
        poolState.rewardAVault
      ),
      program.provider.connection.getTokenAccountBalance(
        poolState.rewardBVault
      ),
    ]);

    const beforeUserRewardA = new anchor.BN(
      beforeUserRewardABalance.value.amount
    );
    const beforeUserRewardB = new anchor.BN(
      beforeUserRewardBBalance.value.amount
    );
    const afterUserRewardA = new anchor.BN(
      afterUserRewardABalance.value.amount
    );
    const afterUserRewardB = new anchor.BN(
      afterUserRewardBBalance.value.amount
    );

    const isUserReceivedRewardA = afterUserRewardA.gt(beforeUserRewardA);
    const isUserReceivedRewardB = afterUserRewardB.gt(beforeUserRewardB);

    assert.deepStrictEqual(isUserReceivedRewardA, true);
    assert.deepStrictEqual(isUserReceivedRewardB, true);

    // !!! user is not getting full reward because user didn't stake for the whole reward duration
    // therefore, there's remaining which doesn't belongs to stakers remain in the staking vault !!!
    const userReceivedRewardA = afterUserRewardA.sub(beforeUserRewardA);
    const userReceivedRewardB = afterUserRewardB.sub(beforeUserRewardB);

    const rewardAVaultBal = new anchor.BN(
      afterRewardAVaultBalance.value.amount
    );
    const rewardBVaultBal = new anchor.BN(
      afterRewardBVaultBalance.value.amount
    );

    nonOwnerRewardAPhaseOne = FUND_AMOUNT.sub(userReceivedRewardA);
    nonOwnerRewardBPhaseOne = FUND_AMOUNT.sub(userReceivedRewardB);

    assert.deepStrictEqual(rewardAVaultBal.gt(new anchor.BN(0)), true);
    assert.deepStrictEqual(rewardBVaultBal.gt(new anchor.BN(0)), true);
    assert.deepStrictEqual(rewardAVaultBal.eq(nonOwnerRewardAPhaseOne), true);
    assert.deepStrictEqual(rewardBVaultBal.eq(nonOwnerRewardBPhaseOne), true);
  });

  it("extend pool reward duration", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey
    );

    let beforePoolState = await program.account.pool.fetch(farmingPoolAddress);

    await program.methods
      .fund(FUND_AMOUNT, FUND_AMOUNT)
      .accounts({
        fromA: adminRewardAATA,
        fromB: adminRewardBATA,
        funder: ADMIN_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        rewardAVault: beforePoolState.rewardAVault,
        rewardBVault: beforePoolState.rewardBVault,
        stakingVault: beforePoolState.stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([ADMIN_KEYPAIR])
      .rpc();

    totalFundAmount = totalFundAmount.add(FUND_AMOUNT);

    let afterPoolState = await program.account.pool.fetch(farmingPoolAddress);

    const isRewardDurationExtended = afterPoolState.rewardDurationEnd.gt(
      beforePoolState.rewardDurationEnd
    );

    assert.deepStrictEqual(isRewardDurationExtended, true);
  });

  it("user unstake 5 seconds before pool ended, pool total stake = 0", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey
    );

    const [userStakingAddress, _userStakingAddressBump] = await getUserPda(
      program,
      farmingPoolAddress,
      USER_KEYPAIR.publicKey
    );

    let poolState = await program.account.pool.fetch(farmingPoolAddress);

    let clockState: ParsedClockState | null;
    console.log("Wait until 5 seconds before reward end");
    do {
      let parsedClock = await program.provider.connection.getParsedAccountInfo(
        SYSVAR_CLOCK_PUBKEY
      );
      clockState = (parsedClock.value!.data as ParsedAccountData)
        .parsed as ParsedClockState;
      await sleep(1000);
    } while (
      poolState.rewardDurationEnd.toNumber() - clockState.info.unixTimestamp >
      5
    );

    await program.methods
      .withdraw(DEPOSIT_AMOUNT)
      .accounts({
        owner: USER_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        stakeFromAccount: userStakingATA,
        stakingVault: poolState.stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user: userStakingAddress,
      })
      .signers([USER_KEYPAIR])
      .rpc();

    poolState = await program.account.pool.fetch(farmingPoolAddress);

    const [userState, stakingVaultBalance] = await Promise.all([
      program.account.user.fetch(userStakingAddress),
      program.provider.connection.getTokenAccountBalance(
        poolState.stakingVault
      ),
    ]);

    assert.deepStrictEqual(userState.balanceStaked.toString(), "0");
    assert.deepStrictEqual(stakingVaultBalance.value.amount, "0");
    assert.deepStrictEqual(poolState.totalStaked.toString(), "0");
  });

  it("user claim reward when pool total stake = 0, and reward ended", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey
    );
    const [userStakingAddress, _userStakingAddressBump] = await getUserPda(
      program,
      farmingPoolAddress,
      USER_KEYPAIR.publicKey
    );

    const [poolState, beforeUserRewardABalance, beforeUserRewardBBalance] =
      await Promise.all([
        program.account.pool.fetch(farmingPoolAddress),
        program.provider.connection.getTokenAccountBalance(userRewardAATA),
        program.provider.connection.getTokenAccountBalance(userRewardBATA),
      ]);

    assert.deepStrictEqual(poolState.totalStaked.toString(), "0");

    let clockState: ParsedClockState | null;

    console.log("Wait for reward end");
    do {
      let parsedClock = await program.provider.connection.getParsedAccountInfo(
        SYSVAR_CLOCK_PUBKEY
      );
      clockState = (parsedClock.value!.data as ParsedAccountData)
        .parsed as ParsedClockState;
      await sleep(1000);
    } while (
      clockState.info.unixTimestamp <= poolState.rewardDurationEnd.toNumber()
    );
    console.log("Reward ended");

    await program.methods
      .claim()
      .accounts({
        owner: USER_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        rewardAAccount: userRewardAATA,
        rewardBAccount: userRewardBATA,
        rewardAVault: poolState.rewardAVault,
        rewardBVault: poolState.rewardBVault,
        stakingVault: poolState.stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user: userStakingAddress,
      })
      .signers([USER_KEYPAIR])
      .rpc();

    const [
      afterUserRewardABalance,
      afterUserRewardBBalance,
      afterRewardAVaultBalance,
      afterRewardBVaultBalance,
    ] = await Promise.all([
      program.provider.connection.getTokenAccountBalance(userRewardAATA),
      program.provider.connection.getTokenAccountBalance(userRewardBATA),
      program.provider.connection.getTokenAccountBalance(
        poolState.rewardAVault
      ),
      program.provider.connection.getTokenAccountBalance(
        poolState.rewardBVault
      ),
    ]);

    const beforeUserRewardA = new anchor.BN(
      beforeUserRewardABalance.value.amount
    );
    const beforeUserRewardB = new anchor.BN(
      beforeUserRewardBBalance.value.amount
    );
    const afterUserRewardA = new anchor.BN(
      afterUserRewardABalance.value.amount
    );
    const afterUserRewardB = new anchor.BN(
      afterUserRewardBBalance.value.amount
    );

    const isUserReceivedRewardA = afterUserRewardA.gt(beforeUserRewardA);
    const isUserReceivedRewardB = afterUserRewardB.gt(beforeUserRewardB);

    assert.deepStrictEqual(isUserReceivedRewardA, true);
    assert.deepStrictEqual(isUserReceivedRewardB, true);

    // !!! user is not getting full reward because user didn't stake for the whole reward duration
    // therefore, there's remaining which doesn't belongs to stakers remain in the staking vault !!!
    const userReceivedRewardA = afterUserRewardA.sub(beforeUserRewardA);
    const userReceivedRewardB = afterUserRewardB.sub(beforeUserRewardB);

    const rewardAVaultBal = new anchor.BN(
      afterRewardAVaultBalance.value.amount
    );
    const rewardBVaultBal = new anchor.BN(
      afterRewardBVaultBalance.value.amount
    );

    nonOwnerRewardAPhaseTwo = FUND_AMOUNT.sub(userReceivedRewardA);
    nonOwnerRewardBPhaseTwo = FUND_AMOUNT.sub(userReceivedRewardB);

    assert.deepStrictEqual(rewardAVaultBal.gt(new anchor.BN(0)), true);
    assert.deepStrictEqual(rewardBVaultBal.gt(new anchor.BN(0)), true);
    assert.deepStrictEqual(
      rewardAVaultBal.eq(nonOwnerRewardAPhaseOne.add(nonOwnerRewardAPhaseTwo)),
      true
    );
    assert.deepStrictEqual(
      rewardBVaultBal.eq(nonOwnerRewardBPhaseOne.add(nonOwnerRewardBPhaseTwo)),
      true
    );
  });
});
