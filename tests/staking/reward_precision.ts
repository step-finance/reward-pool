import * as anchor from "@project-serum/anchor";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { BN } from "bn.js";
import { Staking } from "../../target/types/staking";
import assert from "assert";
import { getClock } from "../clock";
import { sleep } from "@project-serum/common";

const { PublicKey, Keypair, LAMPORTS_PER_SOL } = anchor.web3;
type BN = anchor.BN;
type PublicKey = anchor.web3.PublicKey;
type Keypair = anchor.web3.Keypair;

const program = anchor.workspace.Staking as anchor.Program<Staking>;
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const adminKeypair = new Keypair();
const userKeypair = new Keypair();
const user2Keypair = new Keypair();

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

function mintToMultiple(token: Token, atas: PublicKey[]) {
  return Promise.all(
    atas.map((ata) =>
      token.mintTo(
        ata,
        adminKeypair.publicKey,
        [adminKeypair],
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

function updateUsers(users: PublicKey[], pool: PublicKey) {
  return Promise.all(
    users.map((u) =>
      program.methods
        .getUserInfo()
        .accounts({
          pool,
          user: u,
        })
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

function usersClaimXMER(
  users: { user: PublicKey; keypair: Keypair; stakingAccount: PublicKey }[],
  pool: PublicKey,
  stakingVault: PublicKey,
  xMerRewardVault: PublicKey
) {
  return Promise.all(
    users.map((u) => {
      return program.methods
        .claimXmer()
        .accounts({
          owner: u.keypair.publicKey,
          pool,
          xmerRewardAccount: u.stakingAccount,
          stakingVault,
          xmerRewardVault: xMerRewardVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          user: u.user,
        })
        .signers([u.keypair])
        .rpc();
    })
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

describe("staking reward precision", () => {
  let pool: PublicKey;
  let stakingVault: PublicKey;
  let stakingMint: PublicKey;
  let xMerRewardMint: PublicKey;
  let stakingToken: Token;
  let xMerRewardToken: Token;
  let xMerRewardVault: PublicKey;
  let userStakingToken: PublicKey;
  let user2StakingToken: PublicKey;
  let adminStakingToken: PublicKey;
  let jupRewardVault: PublicKey;
  let jupToken: Token;
  let userJupToken: PublicKey;
  let user2JupToken: PublicKey;
  let adminJupToken: PublicKey;
  let user: PublicKey;
  let user2: PublicKey;

  const jupReward = new BN(100_000_000);
  const xMerReward = jupReward;
  const jupRewardDuration = new BN(7);
  const xMerRewardDuration = new BN(7);
  const poolKeypair = Keypair.generate();

  before(async () => {
    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());

    await airDrops([adminKeypair, userKeypair, user2Keypair]);

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
    [user2] = findProgramAddressSync(
      [user2Keypair.publicKey.toBuffer(), pool.toBuffer()],
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

    jupToken = await Token.createMint(
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

    [userStakingToken, userJupToken] = await createAtas(
      [stakingToken, jupToken],
      userKeypair
    );

    [user2StakingToken, user2JupToken] = await createAtas(
      [stakingToken, jupToken],
      user2Keypair
    );

    [adminStakingToken, adminJupToken] = await createAtas(
      [stakingToken, jupToken],
      adminKeypair
    );

    await mintToMultiple(stakingToken, [
      userStakingToken,
      user2StakingToken,
      adminStakingToken,
    ]);

    await mintToMultiple(jupToken, [adminJupToken]);

    await program.methods
      .initializePool(jupRewardDuration, jupReward, xMerRewardDuration)
      .accounts({
        admin: adminKeypair.publicKey,
        pool,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        stakingMint,
        stakingVault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        xmerRewardMint: xMerRewardMint,
        xmerRewardVault: xMerRewardVault,
      })
      .signers([poolKeypair, adminKeypair])
      .rpc();
  });

  it("have reward remaining", async () => {
    const depositAmount = new BN(100_000_000);

    await createUsers(
      [
        { user, keypair: userKeypair },
        { user: user2, keypair: user2Keypair },
      ],
      pool
    );

    await usersStake(
      [
        { user, keypair: userKeypair, stakingAccount: userStakingToken },
        {
          user: user2,
          keypair: user2Keypair,
          stakingAccount: user2StakingToken,
        },
      ],
      pool,
      stakingVault,
      depositAmount
    );

    // Start xMer farming
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

    await program.methods
      .activateJupFarming()
      .accounts({
        admin: adminKeypair.publicKey,
        pool,
      })
      .signers([adminKeypair])
      .rpc();

    let poolState = await program.account.pool.fetch(pool);
    // Wait until Mer farming ended, and jup reward accumulation ended
    await Promise.all([
      waitUntilOnChainTime(
        provider.connection,
        poolState.xmerRewardEndTimestamp.toNumber()
      ),
      waitUntilOnChainTime(
        provider.connection,
        poolState.jupRewardEndTimestamp.toNumber()
      ),
    ]);

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

    // Fully fund jup
    await program.methods
      .fundJup(jupReward)
      .accounts({
        fromJup: adminJupToken,
        funder: adminKeypair.publicKey,
        jupRewardVault,
        pool,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();

    // Update user pending tokens
    await updateUsers([user, user2], pool);

    const [userState, user2State] = await Promise.all([
      program.account.user.fetch(user),
      program.account.user.fetch(user2),
    ]);

    // Total of all user claimable jup / mer is lesser than the funded amount
    const totalClaimableXMer = userState.xmerRewardPending.add(
      user2State.xmerRewardPending
    );
    const totalClaimableJup = userState.totalJupReward.add(
      user2State.totalJupReward
    );
    assert.deepStrictEqual(totalClaimableXMer.lt(xMerReward), true);
    assert.deepStrictEqual(totalClaimableJup.lt(jupReward), true);

    poolState = await program.account.pool.fetch(pool);

    assert.deepStrictEqual(
      totalClaimableJup.toNumber(),
      poolState.totalFundedJup.toNumber() - 1
    );
  });
});

describe("staking reward when no staker", () => {
  let pool: PublicKey;
  let stakingVault: PublicKey;
  let stakingMint: PublicKey;
  let xMerRewardMint: PublicKey;
  let stakingToken: Token;
  let xMerRewardToken: Token;
  let xMerRewardVault: PublicKey;
  let userStakingToken: PublicKey;
  let user2StakingToken: PublicKey;
  let adminStakingToken: PublicKey;
  let jupRewardVault: PublicKey;
  let jupToken: Token;
  let userJupToken: PublicKey;
  let user2JupToken: PublicKey;
  let adminJupToken: PublicKey;
  let user: PublicKey;
  let user2: PublicKey;

  const jupReward = new BN(100_000_000);
  const xMerReward = jupReward;
  const jupRewardDuration = new BN(7);
  const xMerRewardDuration = new BN(7);
  const poolKeypair = Keypair.generate();
  const depositAmount = new BN(100_000_000);
  let xMerClaimed = new BN(0);

  before(async () => {
    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());

    await airDrops([adminKeypair, userKeypair, user2Keypair]);

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
    [user2] = findProgramAddressSync(
      [user2Keypair.publicKey.toBuffer(), pool.toBuffer()],
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

    jupToken = await Token.createMint(
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

    [userStakingToken, userJupToken] = await createAtas(
      [stakingToken, jupToken],
      userKeypair
    );

    [user2StakingToken, user2JupToken] = await createAtas(
      [stakingToken, jupToken],
      user2Keypair
    );

    [adminStakingToken, adminJupToken] = await createAtas(
      [stakingToken, jupToken],
      adminKeypair
    );

    await mintToMultiple(stakingToken, [
      userStakingToken,
      user2StakingToken,
      adminStakingToken,
    ]);

    await mintToMultiple(jupToken, [adminJupToken]);

    await program.methods
      .initializePool(jupRewardDuration, jupReward, xMerRewardDuration)
      .accounts({
        admin: adminKeypair.publicKey,
        pool,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        stakingMint,
        stakingVault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        xmerRewardMint: xMerRewardMint,
        xmerRewardVault: xMerRewardVault,
      })
      .signers([poolKeypair, adminKeypair])
      .rpc();
  });

  it("start farm without stakers", async () => {
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

    await program.methods
      .activateJupFarming()
      .accounts({
        admin: adminKeypair.publicKey,
        pool,
      })
      .signers([adminKeypair])
      .rpc();

    const poolState = await program.account.pool.fetch(pool);
    assert.strictEqual(poolState.totalStaked.toNumber(), 0);
  });

  it("stake after the farm started for 1 seconds", async () => {
    await sleep(1000);
    await createUsers(
      [
        { user, keypair: userKeypair },
        { user: user2, keypair: user2Keypair },
      ],
      pool
    );

    await usersStake(
      [
        { user, keypair: userKeypair, stakingAccount: userStakingToken },
        {
          user: user2,
          keypair: user2Keypair,
          stakingAccount: user2StakingToken,
        },
      ],
      pool,
      stakingVault,
      depositAmount
    );

    const [userState, userState2, poolState] = await Promise.all([
      program.account.user.fetch(user),
      program.account.user.fetch(user2),
      program.account.pool.fetch(pool),
    ]);

    assert.strictEqual(userState.balanceStaked.eq(depositAmount), true);
    assert.strictEqual(userState2.balanceStaked.eq(depositAmount), true);
    assert.strictEqual(
      poolState.totalStaked.eq(depositAmount.mul(new BN(2))),
      true
    );
  });

  it("claim xMER when no stakers", async () => {
    await sleep(1000);
    const users = [
      { user, keypair: userKeypair, stakingAccount: userStakingToken },
      {
        user: user2,
        keypair: user2Keypair,
        stakingAccount: user2StakingToken,
      },
    ];
    await usersWithdraw(users, pool, stakingVault);

    const stakingVaultBalance = await program.provider.connection
      .getTokenAccountBalance(stakingVault)
      .then((t) => new BN(t.value.amount));
    const [userState, userState2, poolState] = await Promise.all([
      program.account.user.fetch(user),
      program.account.user.fetch(user2),
      program.account.pool.fetch(pool),
    ]);

    assert.strictEqual(stakingVaultBalance.toNumber(), 0);
    assert.strictEqual(userState.balanceStaked.toNumber(), 0);
    assert.strictEqual(userState2.balanceStaked.toNumber(), 0);
    assert.strictEqual(poolState.totalStaked.toNumber(), 0);

    // Able to claim xMer
    const [bUserStakingBalance, bUser2StakingBalance] = await Promise.all([
      program.provider.connection.getTokenAccountBalance(userStakingToken),
      program.provider.connection.getTokenAccountBalance(user2StakingToken),
    ]).then((bals) => bals.map((bal) => new BN(bal.value.amount)));

    await usersClaimXMER(users, pool, stakingVault, xMerRewardVault);

    const [aUserStakingBalance, aUser2StakingBalance] = await Promise.all([
      program.provider.connection.getTokenAccountBalance(userStakingToken),
      program.provider.connection.getTokenAccountBalance(user2StakingToken),
    ]).then((bals) => bals.map((bal) => new BN(bal.value.amount)));

    assert.strictEqual(aUserStakingBalance.gt(bUserStakingBalance), true);
    assert.strictEqual(aUser2StakingBalance.gt(bUser2StakingBalance), true);

    xMerClaimed = xMerClaimed.add(aUserStakingBalance.sub(bUserStakingBalance));
    xMerClaimed = xMerClaimed.add(
      aUser2StakingBalance.sub(bUser2StakingBalance)
    );
  });

  it("no rewards when no stakers", async () => {
    const users = [
      { user, keypair: userKeypair, stakingAccount: userStakingToken },
      {
        user: user2,
        keypair: user2Keypair,
        stakingAccount: user2StakingToken,
      },
    ];
    const [bUserState, bUserState2, bPoolState] = await Promise.all([
      program.account.user.fetch(user),
      program.account.user.fetch(user2),
      program.account.pool.fetch(pool),
    ]);

    await sleep(1000);
    await updateUsers(
      users.map((u) => u.user),
      pool
    );

    const [aUserState, aUserState2, aPoolState] = await Promise.all([
      program.account.user.fetch(user),
      program.account.user.fetch(user2),
      program.account.pool.fetch(pool),
    ]);

    assert.strictEqual(
      aUserState.totalJupReward.eq(bUserState.totalJupReward),
      true
    );
    assert.strictEqual(
      aUserState2.totalJupReward.eq(bUserState2.totalJupReward),
      true
    );
    assert.strictEqual(
      aUserState.xmerRewardPending.eq(bUserState.xmerRewardPending),
      true
    );
    assert.strictEqual(
      aUserState2.xmerRewardPending.eq(bUserState2.xmerRewardPending),
      true
    );
    assert.strictEqual(
      aPoolState.xmerRewardPerTokenStored.eq(
        bPoolState.xmerRewardPerTokenStored
      ),
      true
    );
    assert.strictEqual(
      aPoolState.jupRewardPerTokenStored.eq(bPoolState.jupRewardPerTokenStored),
      true
    );
  });

  it("fund XMER when no stakers", async () => {
    const bPoolState = await program.account.pool.fetch(pool);

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
    const aPoolState = await program.account.pool.fetch(pool);
    assert.strictEqual(
      aPoolState.xmerRewardEndTimestamp.gt(bPoolState.xmerRewardEndTimestamp),
      true
    );
    assert.strictEqual(
      aPoolState.xmerRewardRate.gt(bPoolState.xmerRewardRate),
      true
    );
    assert.strictEqual(
      aPoolState.jupRewardEndTimestamp.eq(bPoolState.jupRewardEndTimestamp),
      true
    );
  });

  it("stake when no stakers", async () => {
    const users = [
      { user, keypair: userKeypair, stakingAccount: userStakingToken },
      {
        user: user2,
        keypair: user2Keypair,
        stakingAccount: user2StakingToken,
      },
    ];
    await usersStake(users, pool, stakingVault, depositAmount);

    const [userState, userState2, poolState] = await Promise.all([
      program.account.user.fetch(user),
      program.account.user.fetch(user2),
      program.account.pool.fetch(pool),
    ]);

    assert.strictEqual(userState.balanceStaked.eq(depositAmount), true);
    assert.strictEqual(userState2.balanceStaked.eq(depositAmount), true);
    assert.strictEqual(
      poolState.totalStaked.eq(depositAmount.mul(new BN(2))),
      true
    );
  });

  it("rewards during the period of no stakers will remain in the vault", async () => {
    let poolState = await program.account.pool.fetch(pool);
    // Wait until Mer farming ended, and jup reward accumulation ended
    await Promise.all([
      waitUntilOnChainTime(
        provider.connection,
        poolState.xmerRewardEndTimestamp.toNumber()
      ),
      waitUntilOnChainTime(
        provider.connection,
        poolState.jupRewardEndTimestamp.toNumber()
      ),
    ]);

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

    // Fully fund jup
    await program.methods
      .fundJup(jupReward)
      .accounts({
        fromJup: adminJupToken,
        funder: adminKeypair.publicKey,
        jupRewardVault,
        pool,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();

    // Update user pending tokens
    await updateUsers([user, user2], pool);

    poolState = await program.account.pool.fetch(pool);
    const [userState, user2State] = await Promise.all([
      program.account.user.fetch(user),
      program.account.user.fetch(user2),
    ]);

    const totalClaimableXMer = userState.xmerRewardPending.add(
      user2State.xmerRewardPending
    );
    const totalClaimableJup = userState.totalJupReward.add(
      user2State.totalJupReward
    );

    const totalJupReward = jupReward;
    // Funding MER 2 times, and users claimed MER when no stakers
    const totalXMerReward = xMerReward.mul(new BN(2)).sub(xMerClaimed);

    const jupRemainingAmount = totalJupReward.sub(totalClaimableJup);
    const xMerRemainingAmount = totalXMerReward.sub(totalClaimableXMer);

    const jupRemainingPercentage =
      (jupRemainingAmount.toNumber() / totalJupReward.toNumber()) * 100;
    const xMerRemainingPercentage =
      (xMerRemainingAmount.toNumber() / totalXMerReward.toNumber()) * 100;

    console.log("Percentage of JUP reward remains", jupRemainingPercentage);
    console.log("Percentage of xMER reward remains", xMerRemainingPercentage);
  });
});
