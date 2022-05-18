import assert from "assert";

import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DualFarming } from "../../target/types/dual_farming";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.DualFarming as Program<DualFarming>;
const BASE_KEYPAIR = anchor.web3.Keypair.generate();
const ADMIN_KEYPAIR = anchor.web3.Keypair.generate();
const USER_KEYPAIR = anchor.web3.Keypair.generate();
const FUNDER_KEYPAIR = anchor.web3.Keypair.generate();
const REWARD_DURATION = new anchor.BN(5);
const TOKEN_DECIMAL = 3;
const TOKEN_MULTIPLIER = 10 ** TOKEN_DECIMAL;

async function getPoolPda(stakingMint: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddress(
    [BASE_KEYPAIR.publicKey.toBuffer(), stakingMint.toBuffer()],
    program.programId
  );
}

async function getStakingVaultPda(stakingMint: anchor.web3.PublicKey) {
  const [poolAddress, _] = await getPoolPda(stakingMint);
  return anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("staking"), poolAddress.toBuffer()],
    program.programId
  );
}

async function getRewardAVaultPda(stakingMint: anchor.web3.PublicKey) {
  const [poolAddress, _] = await getPoolPda(stakingMint);
  return anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("reward_a"), poolAddress.toBuffer()],
    program.programId
  );
}

async function getRewardBVaultPda(stakingMint: anchor.web3.PublicKey) {
  const [poolAddress, _] = await getPoolPda(stakingMint);
  return anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("reward_b"), poolAddress.toBuffer()],
    program.programId
  );
}

async function getUserPda(
  poolAddress: anchor.web3.PublicKey,
  userAddress: anchor.web3.PublicKey
) {
  return anchor.web3.PublicKey.findProgramAddress(
    [userAddress.toBuffer(), poolAddress.toBuffer()],
    program.programId
  );
}

function sleep(ms: number) {
  return new Promise((res) => {
    setTimeout(res, ms);
  });
}

describe("dual-farming", () => {
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

    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());
  });

  it("should initialize dual-farming pool", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      stakingMint
    );
    const [stakingVaultAddress, _stakingVaultBump] = await getStakingVaultPda(
      stakingMint
    );
    const [rewardAVaultAddress, _rewardAVaultBump] = await getRewardAVaultPda(
      stakingMint
    );
    const [rewardBVaultAddress, _rewardBVaultBump] = await getRewardBVaultPda(
      stakingMint
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
  });

  it("should create new user", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      stakingMint
    );
    const [userStakingAddress, _userStakingAddressBump] = await getUserPda(
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
  });

  it("should stake to the pool", async () => {
    const STAKE_AMOUNT = new anchor.BN(500 * TOKEN_MULTIPLIER);

    await stakingToken.mintTo(
      userStakingATA,
      ADMIN_KEYPAIR,
      [],
      1000 * TOKEN_MULTIPLIER
    );

    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      stakingMint
    );

    const [userStakingAddress, _userStakingAddressBump] = await getUserPda(
      farmingPoolAddress,
      USER_KEYPAIR.publicKey
    );

    const poolAccount = await program.account.pool.fetch(farmingPoolAddress);

    await program.methods
      .stake(STAKE_AMOUNT)
      .accounts({
        owner: USER_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        stakeFromAccount: userStakingATA,
        stakingVault: poolAccount.stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user: userStakingAddress,
      })
      .signers([USER_KEYPAIR])
      .rpc();
  });

  it("should fund the pool", async () => {
    const FUND_AMOUNT = new anchor.BN(10_000 * TOKEN_MULTIPLIER);

    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      stakingMint
    );

    const poolAccount = await program.account.pool.fetch(farmingPoolAddress);

    await rewardAToken.mintTo(
      adminRewardAATA,
      ADMIN_KEYPAIR,
      [],
      100_000 * TOKEN_MULTIPLIER
    );

    await rewardBToken.mintTo(
      adminRewardBATA,
      ADMIN_KEYPAIR,
      [],
      100_000 * TOKEN_MULTIPLIER
    );

    await program.methods
      .fund(FUND_AMOUNT, FUND_AMOUNT)
      .accounts({
        fromA: adminRewardAATA,
        fromB: adminRewardBATA,
        funder: ADMIN_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        rewardAVault: poolAccount.rewardAVault,
        rewardBVault: poolAccount.rewardBVault,
        stakingVault: poolAccount.stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([ADMIN_KEYPAIR])
      .rpc()
      .catch(console.log);
  });

  it("should pause the pool", async () => {
    // Wait pool reward period end
    await sleep(10_000);
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      stakingMint
    );

    await program.methods
      .pause()
      .accounts({
        authority: ADMIN_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
      })
      .signers([ADMIN_KEYPAIR])
      .rpc();
  });

  it("should un-pause the pool", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      stakingMint
    );

    await program.methods
      .unpause()
      .accounts({
        authority: ADMIN_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
      })
      .signers([ADMIN_KEYPAIR])
      .rpc();
  });

  it("should claim reward from the pool", async () => {
    await sleep(1000);
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      stakingMint
    );

    const [userStakingAddress, _userStakingAddressBump] = await getUserPda(
      farmingPoolAddress,
      USER_KEYPAIR.publicKey
    );

    const poolAccount = await program.account.pool.fetch(farmingPoolAddress);

    await program.methods
      .claim()
      .accounts({
        owner: USER_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        rewardAAccount: userRewardAATA,
        rewardBAccount: userRewardBATA,
        rewardAVault: poolAccount.rewardAVault,
        rewardBVault: poolAccount.rewardBVault,
        stakingVault: poolAccount.stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user: userStakingAddress,
      })
      .signers([USER_KEYPAIR])
      .rpc();
  });

  it("should unstake from the pool", async () => {
    const UNSTAKE_AMOUNT = new anchor.BN(500 * TOKEN_MULTIPLIER);

    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      stakingMint
    );

    const [userStakingAddress, _userStakingAddressBump] = await getUserPda(
      farmingPoolAddress,
      USER_KEYPAIR.publicKey
    );

    const poolAccount = await program.account.pool.fetch(farmingPoolAddress);

    await program.methods
      .unstake(UNSTAKE_AMOUNT)
      .accounts({
        owner: USER_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        stakeFromAccount: userStakingATA,
        stakingVault: poolAccount.stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user: userStakingAddress,
      })
      .signers([USER_KEYPAIR])
      .rpc();
  });

  it("should close user account", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      stakingMint
    );

    const [userStakingAddress, _userStakingAddressBump] = await getUserPda(
      farmingPoolAddress,
      USER_KEYPAIR.publicKey
    );

    await program.methods
      .closeUser()
      .accounts({
        owner: USER_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        user: userStakingAddress,
      })
      .signers([USER_KEYPAIR])
      .rpc();
  });

  it("should authorize funder", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      stakingMint
    );

    await program.methods
      .authorizeFunder(FUNDER_KEYPAIR.publicKey)
      .accounts({
        authority: ADMIN_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
      })
      .signers([ADMIN_KEYPAIR])
      .rpc();
  });

  it("should deauthorize funder", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      stakingMint
    );

    await program.methods
      .deauthorizeFunder(FUNDER_KEYPAIR.publicKey)
      .accounts({
        authority: ADMIN_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
      })
      .signers([ADMIN_KEYPAIR])
      .rpc();
  });

  it("should close pool", async () => {
    const [farmingPoolAddress, _farmingPoolBump] = await getPoolPda(
      stakingMint
    );

    // Pause before close
    await program.methods
      .pause()
      .accounts({
        authority: ADMIN_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
      })
      .signers([ADMIN_KEYPAIR])
      .rpc();

    const poolAccount = await program.account.pool.fetch(farmingPoolAddress);

    await program.methods
      .closePool()
      .accounts({
        authority: ADMIN_KEYPAIR.publicKey,
        pool: farmingPoolAddress,
        refundee: ADMIN_KEYPAIR.publicKey,
        rewardARefundee: adminRewardAATA,
        rewardBRefundee: adminRewardBATA,
        rewardAVault: poolAccount.rewardAVault,
        rewardBVault: poolAccount.rewardBVault,
        stakingRefundee: adminStakingATA,
        stakingVault: poolAccount.stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([ADMIN_KEYPAIR])
      .rpc();
  });
});
