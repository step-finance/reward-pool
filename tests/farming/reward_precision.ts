import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { BN } from "bn.js";
import assert from "assert";
import { Farming } from "../../target/types/farming";
import { getClock } from "../clock";
import {
  getPoolPda,
  getRewardAVaultPda,
  getRewardBVaultPda,
  getStakingVaultPda,
} from "./utils";
import { sleep } from "@project-serum/common";

const { PublicKey, Keypair, LAMPORTS_PER_SOL } = anchor.web3;
type BN = anchor.BN;
type PublicKey = anchor.web3.PublicKey;
type Keypair = anchor.web3.Keypair;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.Farming as Program<Farming>;
const BASE_KEYPAIR = Keypair.generate();
const ADMIN_KEYPAIR = Keypair.generate();
const USER_KEYPAIR = Keypair.generate();

const TOKEN_DECIMAL = 6;
const TOKEN_MULTIPLIER = new BN(10 ** TOKEN_DECIMAL);
const FUND_AMOUNT = new BN(100).mul(TOKEN_MULTIPLIER);
const DEPOSIT_AMOUNT = new BN(100).mul(TOKEN_MULTIPLIER);

const REWARD_DURATION = new BN(7); // This create precision loss in reward_rate, which lead to remaining reward

function airDrops(keypairs: Keypair[]) {
  return Promise.all(
    keypairs.map(async (k) => {
      const sig = await provider.connection.requestAirdrop(
        k.publicKey,
        10 * LAMPORTS_PER_SOL
      );
      return provider.connection.confirmTransaction(sig, "confirmed");
    })
  );
}

function createAtas(
  tokens: Token[],
  userKeypair: Keypair
): Promise<PublicKey[]> {
  return Promise.all(
    tokens.map((t) =>
      t
        .getOrCreateAssociatedAccountInfo(userKeypair.publicKey)
        .then((ata) => ata.address)
    )
  );
}

function mintToMultiple(token: Token, atas: PublicKey[]) {
  return Promise.all(
    atas.map((ata) =>
      token.mintTo(
        ata,
        ADMIN_KEYPAIR.publicKey,
        [ADMIN_KEYPAIR],
        new u64(1_000_000_000_000)
      )
    )
  );
}

function createUsers(
  users: { user: PublicKey; keypair: Keypair }[],
  pool: PublicKey
) {
  return Promise.all(
    users.map((u) =>
      program.methods
        .createUser()
        .accounts({
          owner: u.keypair.publicKey,
          pool,
          systemProgram: anchor.web3.SystemProgram.programId,
          user: u.user,
        })
        .signers([u.keypair])
        .rpc()
    )
  );
}

function usersStake(
  users: { user: PublicKey; keypair: Keypair; stakingAccount: PublicKey }[],
  pool: PublicKey,
  stakingVault: PublicKey,
  depositAmount: BN
) {
  return Promise.all(
    users.map((u) =>
      program.methods
        .deposit(depositAmount)
        .accounts({
          owner: u.keypair.publicKey,
          pool,
          stakeFromAccount: u.stakingAccount,
          stakingVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          user: u.user,
        })
        .signers([u.keypair])
        .rpc()
    )
  );
}

function usersWithdraw(
  users: { user: PublicKey; keypair: Keypair; stakingAccount: PublicKey }[],
  pool: PublicKey,
  stakingVault: PublicKey
) {
  return Promise.all(
    users.map(async (u) => {
      const userState = await program.account.user.fetch(u.user);
      return program.methods
        .withdraw(userState.balanceStaked)
        .accounts({
          owner: u.keypair.publicKey,
          pool,
          stakingVault,
          stakeFromAccount: u.stakingAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          user: u.user,
        })
        .signers([u.keypair])
        .rpc();
    })
  );
}

function usersClaim(
  users: {
    user: PublicKey;
    keypair: Keypair;
    rewardAAccount: PublicKey;
    rewardBAccount: PublicKey;
  }[],
  pool: PublicKey,
  stakingVault: PublicKey,
  rewardAVault: PublicKey,
  rewardBVault: PublicKey
) {
  return Promise.all(
    users.map((u) =>
      program.methods
        .claim()
        .accounts({
          owner: u.keypair.publicKey,
          pool,
          rewardAVault,
          rewardBVault,
          stakingVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          user: u.user,
          rewardAAccount: u.rewardAAccount,
          rewardBAccount: u.rewardBAccount,
        })
        .signers([u.keypair])
        .rpc()
    )
  );
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

describe("staking reward precision", () => {
  let stakingMint: PublicKey = null;
  let rewardAMint: PublicKey = null;
  let rewardBMint: PublicKey = null;

  let stakingToken: Token = null;
  let rewardAToken: Token = null;
  let rewardBToken: Token = null;

  let userStakingATA: PublicKey = null;
  let userRewardAATA: PublicKey = null;
  let userRewardBATA: PublicKey = null;

  let adminStakingATA: PublicKey = null;
  let adminRewardAATA: PublicKey = null;
  let adminRewardBATA: PublicKey = null;
  let pool: PublicKey = null;
  let stakingVault: PublicKey = null;
  let rewardAVault: PublicKey = null;
  let rewardBVault: PublicKey = null;

  let user: PublicKey = null;

  before(async () => {
    await airDrops([ADMIN_KEYPAIR, USER_KEYPAIR]);

    stakingToken = await Token.createMint(
      program.provider.connection,
      ADMIN_KEYPAIR,
      ADMIN_KEYPAIR.publicKey,
      null,
      TOKEN_DECIMAL,
      TOKEN_PROGRAM_ID
    );
    stakingMint = stakingToken.publicKey;

    rewardAToken = await Token.createMint(
      program.provider.connection,
      ADMIN_KEYPAIR,
      ADMIN_KEYPAIR.publicKey,
      null,
      TOKEN_DECIMAL,
      TOKEN_PROGRAM_ID
    );
    rewardAMint = rewardAToken.publicKey;

    rewardBToken = await Token.createMint(
      program.provider.connection,
      ADMIN_KEYPAIR,
      ADMIN_KEYPAIR.publicKey,
      null,
      TOKEN_DECIMAL,
      TOKEN_PROGRAM_ID
    );
    rewardBMint = rewardBToken.publicKey;

    [pool] = await getPoolPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey,
      REWARD_DURATION
    );

    [userStakingATA, userRewardAATA, userRewardBATA] = await createAtas(
      [stakingToken, rewardAToken, rewardBToken],
      USER_KEYPAIR
    );

    [adminStakingATA, adminRewardAATA, adminRewardBATA] = await createAtas(
      [stakingToken, rewardAToken, rewardBToken],
      ADMIN_KEYPAIR
    );

    await mintToMultiple(stakingToken, [userStakingATA, adminStakingATA]);
    await mintToMultiple(rewardAToken, [adminRewardAATA]);
    await mintToMultiple(rewardBToken, [adminRewardBATA]);

    [stakingVault] = await getStakingVaultPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey,
      REWARD_DURATION
    );
    [rewardAVault] = await getRewardAVaultPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey,
      REWARD_DURATION
    );
    [rewardBVault] = await getRewardBVaultPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey,
      REWARD_DURATION
    );

    [user] = findProgramAddressSync(
      [USER_KEYPAIR.publicKey.toBuffer(), pool.toBuffer()],
      program.programId
    );

    await program.methods
      .initializePool(REWARD_DURATION)
      .accounts({
        authority: ADMIN_KEYPAIR.publicKey,
        base: BASE_KEYPAIR.publicKey,
        pool,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        rewardAMint,
        rewardBMint,
        rewardAVault,
        rewardBVault,
        stakingMint,
        stakingVault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([BASE_KEYPAIR, ADMIN_KEYPAIR])
      .rpc();

    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());
  });

  it("have remaining reward", async () => {
    await createUsers(
      [
        {
          keypair: USER_KEYPAIR,
          user,
        },
      ],
      pool
    );
    await usersStake(
      [{ keypair: USER_KEYPAIR, stakingAccount: userStakingATA, user }],
      pool,
      stakingVault,
      DEPOSIT_AMOUNT
    );

    await program.methods
      .fund(FUND_AMOUNT, FUND_AMOUNT)
      .accounts({
        fromA: adminRewardAATA,
        fromB: adminRewardBATA,
        funder: ADMIN_KEYPAIR.publicKey,
        pool,
        rewardAVault,
        rewardBVault,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([ADMIN_KEYPAIR])
      .rpc();

    const poolState = await program.account.pool.fetch(pool);
    await waitUntilOnChainTime(
      program.provider.connection,
      poolState.rewardDurationEnd.toNumber()
    );

    await usersClaim(
      [
        {
          keypair: USER_KEYPAIR,
          user,
          rewardAAccount: userRewardAATA,
          rewardBAccount: userRewardBATA,
        },
      ],
      pool,
      stakingVault,
      rewardAVault,
      rewardBVault
    );

    const [userRewardABalance, userRewardBBalance] = await Promise.all([
      program.provider.connection.getTokenAccountBalance(userRewardAATA),
      program.provider.connection.getTokenAccountBalance(userRewardBATA),
    ]).then(([a, b]) => [new BN(a.value.amount), new BN(b.value.amount)]);

    assert.strictEqual(
      userRewardABalance.toNumber(),
      FUND_AMOUNT.toNumber() - 1
    );
    assert.strictEqual(
      userRewardBBalance.toNumber(),
      FUND_AMOUNT.toNumber() - 1
    );
  });
});

describe.only("staking reward when no staker", () => {
  let stakingMint: PublicKey = null;
  let rewardAMint: PublicKey = null;
  let rewardBMint: PublicKey = null;

  let stakingToken: Token = null;
  let rewardAToken: Token = null;
  let rewardBToken: Token = null;

  let userStakingATA: PublicKey = null;
  let userRewardAATA: PublicKey = null;
  let userRewardBATA: PublicKey = null;

  let adminStakingATA: PublicKey = null;
  let adminRewardAATA: PublicKey = null;
  let adminRewardBATA: PublicKey = null;
  let pool: PublicKey = null;
  let stakingVault: PublicKey = null;
  let rewardAVault: PublicKey = null;
  let rewardBVault: PublicKey = null;

  let user: PublicKey = null;
  let claimedRewardA = new BN(0);
  let claimedRewardB = new BN(0);

  before(async () => {
    await airDrops([ADMIN_KEYPAIR, USER_KEYPAIR]);

    stakingToken = await Token.createMint(
      program.provider.connection,
      ADMIN_KEYPAIR,
      ADMIN_KEYPAIR.publicKey,
      null,
      TOKEN_DECIMAL,
      TOKEN_PROGRAM_ID
    );
    stakingMint = stakingToken.publicKey;

    rewardAToken = await Token.createMint(
      program.provider.connection,
      ADMIN_KEYPAIR,
      ADMIN_KEYPAIR.publicKey,
      null,
      TOKEN_DECIMAL,
      TOKEN_PROGRAM_ID
    );
    rewardAMint = rewardAToken.publicKey;

    rewardBToken = await Token.createMint(
      program.provider.connection,
      ADMIN_KEYPAIR,
      ADMIN_KEYPAIR.publicKey,
      null,
      TOKEN_DECIMAL,
      TOKEN_PROGRAM_ID
    );
    rewardBMint = rewardBToken.publicKey;

    [pool] = await getPoolPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey,
      REWARD_DURATION
    );

    [userStakingATA, userRewardAATA, userRewardBATA] = await createAtas(
      [stakingToken, rewardAToken, rewardBToken],
      USER_KEYPAIR
    );

    [adminStakingATA, adminRewardAATA, adminRewardBATA] = await createAtas(
      [stakingToken, rewardAToken, rewardBToken],
      ADMIN_KEYPAIR
    );

    await mintToMultiple(stakingToken, [userStakingATA, adminStakingATA]);
    await mintToMultiple(rewardAToken, [adminRewardAATA]);
    await mintToMultiple(rewardBToken, [adminRewardBATA]);

    [stakingVault] = await getStakingVaultPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey,
      REWARD_DURATION
    );
    [rewardAVault] = await getRewardAVaultPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey,
      REWARD_DURATION
    );
    [rewardBVault] = await getRewardBVaultPda(
      program,
      stakingMint,
      rewardAMint,
      rewardBMint,
      BASE_KEYPAIR.publicKey,
      REWARD_DURATION
    );

    [user] = findProgramAddressSync(
      [USER_KEYPAIR.publicKey.toBuffer(), pool.toBuffer()],
      program.programId
    );

    await program.methods
      .initializePool(REWARD_DURATION)
      .accounts({
        authority: ADMIN_KEYPAIR.publicKey,
        base: BASE_KEYPAIR.publicKey,
        pool,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        rewardAMint,
        rewardBMint,
        rewardAVault,
        rewardBVault,
        stakingMint,
        stakingVault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([BASE_KEYPAIR, ADMIN_KEYPAIR])
      .rpc();

    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());
  });

  it("start farm without stakers", async () => {
    await program.methods
      .fund(FUND_AMOUNT, FUND_AMOUNT)
      .accounts({
        fromA: adminRewardAATA,
        fromB: adminRewardBATA,
        funder: ADMIN_KEYPAIR.publicKey,
        pool,
        rewardAVault,
        rewardBVault,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([ADMIN_KEYPAIR])
      .rpc();

    const poolState = await program.account.pool.fetch(pool);
    assert.strictEqual(poolState.totalStaked.toNumber(), 0);
    assert.strictEqual(poolState.rewardDurationEnd.toNumber() > 0, true);
  });

  it("stake after the farms started for 1 seconds", async () => {
    await sleep(1000);
    await createUsers(
      [
        {
          keypair: USER_KEYPAIR,
          user,
        },
      ],
      pool
    );
    await usersStake(
      [{ keypair: USER_KEYPAIR, stakingAccount: userStakingATA, user }],
      pool,
      stakingVault,
      DEPOSIT_AMOUNT
    );

    const [userState, poolState] = await Promise.all([
      program.account.user.fetch(user),
      program.account.pool.fetch(pool),
    ]);

    assert.strictEqual(userState.balanceStaked.eq(DEPOSIT_AMOUNT), true);
    assert.strictEqual(poolState.totalStaked.eq(DEPOSIT_AMOUNT), true);
  });

  it("claim rewards when no stakers", async () => {
    await sleep(1000);

    await usersWithdraw(
      [{ keypair: USER_KEYPAIR, stakingAccount: userStakingATA, user }],
      pool,
      stakingVault
    );

    const stakingVaultBalance = await program.provider.connection
      .getTokenAccountBalance(stakingVault)
      .then((t) => new BN(t.value.amount));
    const [userState, poolState] = await Promise.all([
      program.account.user.fetch(user),
      program.account.pool.fetch(pool),
    ]);

    assert.strictEqual(stakingVaultBalance.toNumber(), 0);
    assert.strictEqual(userState.balanceStaked.toNumber(), 0);
    assert.strictEqual(poolState.totalStaked.toNumber(), 0);

    // Claim reward A and B
    const [bUserTokenABal, bUserTokenBBal] = await Promise.all([
      program.provider.connection.getTokenAccountBalance(userRewardAATA),
      program.provider.connection.getTokenAccountBalance(userRewardBATA),
    ]).then((bals) => bals.map((bal) => new BN(bal.value.amount)));

    await usersClaim(
      [
        {
          keypair: USER_KEYPAIR,
          user,
          rewardAAccount: userRewardAATA,
          rewardBAccount: userRewardBATA,
        },
      ],
      pool,
      stakingVault,
      rewardAVault,
      rewardBVault
    );

    const [aUserTokenABal, aUserTokenBBal] = await Promise.all([
      program.provider.connection.getTokenAccountBalance(userRewardAATA),
      program.provider.connection.getTokenAccountBalance(userRewardBATA),
    ]).then((bals) => bals.map((bal) => new BN(bal.value.amount)));

    assert.strictEqual(aUserTokenABal.gt(bUserTokenABal), true);
    assert.strictEqual(aUserTokenBBal.gt(bUserTokenBBal), true);

    claimedRewardA = claimedRewardA.add(aUserTokenABal.sub(bUserTokenABal));
    claimedRewardB = claimedRewardB.add(aUserTokenBBal.sub(bUserTokenBBal));
  });

  it("no rewards when no stakers", async () => {
    await sleep(1000);
    const [bUserState, bPoolState] = await Promise.all([
      program.account.user.fetch(user),
      program.account.pool.fetch(pool),
    ]);

    const [bUserTokenABal, bUserTokenBBal] = await Promise.all([
      program.provider.connection.getTokenAccountBalance(userRewardAATA),
      program.provider.connection.getTokenAccountBalance(userRewardBATA),
    ]).then((bals) => bals.map((bal) => new BN(bal.value.amount)));

    // Trigger update of reward
    await usersClaim(
      [
        {
          keypair: USER_KEYPAIR,
          user,
          rewardAAccount: userRewardAATA,
          rewardBAccount: userRewardBATA,
        },
      ],
      pool,
      stakingVault,
      rewardAVault,
      rewardBVault
    );

    const [aUserState, aPoolState] = await Promise.all([
      program.account.user.fetch(user),
      program.account.pool.fetch(pool),
    ]);

    assert.strictEqual(
      aUserState.rewardAPerTokenPending.eq(bUserState.rewardAPerTokenPending),
      true
    );
    assert.strictEqual(
      aUserState.rewardBPerTokenPending.eq(bUserState.rewardBPerTokenPending),
      true
    );
    assert.strictEqual(
      aPoolState.rewardAPerTokenStored.eq(bPoolState.rewardAPerTokenStored),
      true
    );
    assert.strictEqual(
      aPoolState.rewardBPerTokenStored.eq(bPoolState.rewardBPerTokenStored),
      true
    );

    const [aUserTokenABal, aUserTokenBBal] = await Promise.all([
      program.provider.connection.getTokenAccountBalance(userRewardAATA),
      program.provider.connection.getTokenAccountBalance(userRewardBATA),
    ]).then((bals) => bals.map((bal) => new BN(bal.value.amount)));

    assert.strictEqual(aUserTokenABal.eq(bUserTokenABal), true);
    assert.strictEqual(aUserTokenBBal.eq(bUserTokenBBal), true);
  });

  it("fund reward A/B when no stakers", async () => {
    const bPoolState = await program.account.pool.fetch(pool);

    await program.methods
      .fund(FUND_AMOUNT, FUND_AMOUNT)
      .accounts({
        fromA: adminRewardAATA,
        fromB: adminRewardBATA,
        funder: ADMIN_KEYPAIR.publicKey,
        pool,
        rewardAVault,
        rewardBVault,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([ADMIN_KEYPAIR])
      .rpc();

    const aPoolState = await program.account.pool.fetch(pool);
    assert.strictEqual(
      aPoolState.rewardDurationEnd.gt(bPoolState.rewardDurationEnd),
      true
    );
    assert.strictEqual(aPoolState.rewardARate.gt(bPoolState.rewardARate), true);
    assert.strictEqual(aPoolState.rewardBRate.gt(bPoolState.rewardBRate), true);
  });

  it("stake when no stakers", async () => {
    await usersStake(
      [{ keypair: USER_KEYPAIR, stakingAccount: userStakingATA, user }],
      pool,
      stakingVault,
      DEPOSIT_AMOUNT
    );

    const [userState, poolState] = await Promise.all([
      program.account.user.fetch(user),
      program.account.pool.fetch(pool),
    ]);

    assert.strictEqual(userState.balanceStaked.eq(DEPOSIT_AMOUNT), true);
    assert.strictEqual(poolState.totalStaked.eq(DEPOSIT_AMOUNT), true);
  });

  it("rewards during the period of no stakers will remain in the vault", async () => {
    let poolState = await program.account.pool.fetch(pool);
    // Wait until reward duration end
    await waitUntilOnChainTime(
      provider.connection,
      poolState.rewardDurationEnd.toNumber()
    );

    // Claim reward A and B
    const [bUserTokenABal, bUserTokenBBal] = await Promise.all([
      program.provider.connection.getTokenAccountBalance(userRewardAATA),
      program.provider.connection.getTokenAccountBalance(userRewardBATA),
    ]).then((bals) => bals.map((bal) => new BN(bal.value.amount)));

    await usersClaim(
      [
        {
          keypair: USER_KEYPAIR,
          user,
          rewardAAccount: userRewardAATA,
          rewardBAccount: userRewardBATA,
        },
      ],
      pool,
      stakingVault,
      rewardAVault,
      rewardBVault
    );

    const [aUserTokenABal, aUserTokenBBal] = await Promise.all([
      program.provider.connection.getTokenAccountBalance(userRewardAATA),
      program.provider.connection.getTokenAccountBalance(userRewardBATA),
    ]).then((bals) => bals.map((bal) => new BN(bal.value.amount)));

    const totalClaimedTokenA = aUserTokenABal.sub(bUserTokenABal);
    const totalClaimedTokenB = aUserTokenBBal.sub(bUserTokenBBal);

    const totalRewardA = FUND_AMOUNT.mul(new BN(2)).sub(claimedRewardA);
    const totalRewardB = FUND_AMOUNT.mul(new BN(2)).sub(claimedRewardB);

    const rewardARemaining = totalRewardA.sub(totalClaimedTokenA);
    const rewardBRemaining = totalRewardB.sub(totalClaimedTokenB);

    const rewardARemainingPercentage =
      (rewardARemaining.toNumber() / totalRewardA.toNumber()) * 100;
    const rewardBRemainingPercentage =
      (rewardBRemaining.toNumber() / totalRewardB.toNumber()) * 100;

    console.log("Percentage of reward A remains", rewardARemainingPercentage);
    console.log("Percentage of reward B remains", rewardBRemainingPercentage);
  });
});
