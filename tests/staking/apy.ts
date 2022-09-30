import * as anchor from "@project-serum/anchor";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { BN } from "bn.js";
import { Staking } from "../../target/types/staking";
import assert from "assert";
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

async function computeApy(program: anchor.Program<Staking>, pool: PublicKey) {
  const poolState = await program.account.pool.fetch(pool);
  const clock = await getClock(program.provider.connection);
  const lockedToken = poolState.totalStaked.toNumber();
  if (lockedToken == 0) {
    return 0;
  }
  // Farm expired
  if (poolState.xmerRewardEndTimestamp.toNumber() < clock.info.unixTimestamp) {
    return 0;
  }
  const rewardPerDay = poolState.xmerRewardRate.div(new BN(365));
  const rewardPerTokenPerDay = rewardPerDay.toNumber() / lockedToken;
  return ((1 + rewardPerTokenPerDay) ** 365 - 1) * 100;
}

describe("staking apy", () => {
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

  const jupReward = new BN(1_000_000);
  const jupRewardDuration = new BN(10);
  const xMerRewardDuration = new BN(10);
  const xMerReward = new BN(1_000_000);
  const poolKeypair = Keypair.generate();

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
  });

  it("APY = 0, when farm is not started", async () => {
    const apy = await computeApy(program, pool);
    assert.strictEqual(apy, 0);
  });

  describe("when farm is started", () => {
    let beforeApy = 0;
    it("APY > 0", async () => {
      await program.methods
        .deposit(new BN(100_000_000_000))
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

      await program.methods
        .fundXmer(xMerReward)
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

      const apy = await computeApy(program, pool);
      assert.strictEqual(apy > 0, true);
      beforeApy = apy;
    });

    it("APY decreases when more people stake", async () => {
      await program.methods
        .deposit(new BN(100_000_000_000))
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

      const apy = await computeApy(program, pool);
      assert.strictEqual(apy < beforeApy, true);
      beforeApy = apy;
    });

    it("APY remain the same if no people stake / fund", async () => {
      const apy = await computeApy(program, pool);
      assert.strictEqual(apy, beforeApy);
    });
  });

  describe("when farm is expired", () => {
    it("APY = 0", async () => {
      const poolState = await program.account.pool.fetch(pool);
      await waitUntilOnChainTime(
        program.provider.connection,
        poolState.xmerRewardEndTimestamp.toNumber()
      );

      const apy = await computeApy(program, pool);
      assert.strictEqual(apy, 0);
    });
  });
});
