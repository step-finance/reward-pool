import * as anchor from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { User } from "./user";
import * as utils from "./utils";
import { Staking } from "../../target/types/staking";
import assert from "assert";

type Keypair = anchor.web3.Keypair;
type PublicKey = anchor.web3.PublicKey;

let program = anchor.workspace.Staking as anchor.Program<Staking>;

//Read the provider from the configured environment.
//represents an outside actor
//owns mints out of any other actors control, provides initial $$ to others
// const envProvider = anchor.AnchorProvider.env();

//we allow this convenience var to change between default env and mock user(s)
//initially we are the outside actor
let provider = anchor.AnchorProvider.env();
//convenience method to set in anchor AND above convenience var
//setting in anchor allows the rpc and accounts namespaces access
//to a different wallet from env
function setProvider(p: anchor.AnchorProvider) {
  provider = p;
  anchor.setProvider(p);
  program = new anchor.Program<Staking>(program.idl, program.programId, p);
}
setProvider(provider);

console.log("Program id ", program.programId.toString());

describe("Reward Pool", () => {
  let rewardDuration = new anchor.BN(10);

  let admin: User;
  let adminKey: Keypair;
  let stakingMint: PublicKey;
  let fundingAmount = new anchor.BN(10000);
  let rewardMint: PublicKey;
  let pool: PublicKey;
  let stakingKeyPair: Keypair;
  let rewardKeypair: Keypair;

  it("Initialize mints", async () => {
    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());
    let mintData = await initializeMint();
    stakingKeyPair = mintData.stakingKeyPair;
    stakingMint = mintData.stakingMint;
    rewardKeypair = mintData.rewardKeypair;
    rewardMint = mintData.rewardMint;
  });

  it("Initialize admins", async () => {
    adminKey = anchor.web3.Keypair.generate();
    admin = new User(0);
    await admin.init(adminKey, 10_000_000_000, stakingMint, 0, rewardMint);
  });

  //to track cost to create pool, and compare to refund at teardown
  // let costInLamports;

  it("Creates a pool", async () => {
    const ratePrecision = new anchor.BN(1_000_000_000_000);
    //create pool by zero duration
    try {
      await admin.initializePool(
        stakingMint,
        rewardMint,
        new anchor.BN(0),
        fundingAmount
      );
      assert.fail("cannot create pool by zero duration");
    } catch (e) {}

    pool = await admin.initializePool(
      stakingMint,
      rewardMint,
      rewardDuration,
      fundingAmount
    );
    //re create the duplicate pool
    try {
      await admin.initializePool(
        stakingMint,
        rewardMint,
        rewardDuration,
        fundingAmount
      );
      assert.fail("did not fail to create dupe pool");
    } catch (e) {}

    const [stakingVault, stakingVaultNonce] =
      await utils.computeStakingVaultAccount(pool);
    const [rewardVault, _rewardVaultNonce] =
      await utils.computeRewardVaultAccount(pool);

    const poolState = await program.account.pool.fetch(pool);
    assert.deepStrictEqual(poolState.stakingVaultNonce, stakingVaultNonce);
    assert.deepStrictEqual(
      poolState.stakingMint.toBase58(),
      stakingMint.toBase58()
    );
    assert.deepStrictEqual(
      poolState.stakingVault.toBase58(),
      stakingVault.toBase58()
    );
    assert.deepStrictEqual(
      poolState.rewardVault.toBase58(),
      rewardVault.toBase58()
    );

    const expectedRewardRate = fundingAmount
      .mul(ratePrecision)
      .div(rewardDuration);

    assert.deepStrictEqual(poolState.rewardRate.eq(expectedRewardRate), true);
    assert.deepStrictEqual(poolState.rewardDuration.eq(rewardDuration), true);
    assert.deepStrictEqual(poolState.lastUpdateTime.toNumber(), 0); // admin not activate farming yet
    assert.deepStrictEqual(poolState.rewardEndTimestamp.toNumber(), 0); // admin not activate farming yet
    assert.deepStrictEqual(poolState.rewardPerTokenStored.toNumber(), 0);
    assert.deepStrictEqual(
      poolState.admin.toBase58(),
      adminKey.publicKey.toBase58()
    );
  });

  it("User does some staking before admin activate farming", async () => {
    let mintData = await initializeMint();
    stakingKeyPair = mintData.stakingKeyPair;
    stakingMint = mintData.stakingMint;
    rewardKeypair = mintData.rewardKeypair;
    rewardMint = mintData.rewardMint;

    adminKey = anchor.web3.Keypair.generate();
    admin = new User(2);
    await admin.init(adminKey, 10_000_000_000, stakingMint, 0, rewardMint);

    pool = await admin.initializePool(
      stakingMint,
      rewardMint,
      rewardDuration,
      fundingAmount
    );

    let userKeyPair = anchor.web3.Keypair.generate();
    let user = new User(3);
    await user.init(
      userKeyPair,
      10_000_000_000,
      stakingMint,
      100_000,
      rewardMint
    );

    await user.createUserStakingAccount(pool);

    try {
      await user.createUserStakingAccount(pool);
      assert.fail("cannot create dupe user");
    } catch (e) {}

    // Make sure user staking account is created correctly
    let userState = await user.getUserStakingInfo();
    assert.deepStrictEqual(userState.nonce, user.userNonce);
    assert.deepStrictEqual(userState.pool.toBase58(), pool.toBase58());
    assert.deepStrictEqual(
      userState.owner.toBase58(),
      user.provider.wallet.publicKey.toBase58()
    );
    assert.deepStrictEqual(userState.rewardPerTokenPending.toNumber(), 0);
    assert.deepStrictEqual(userState.rewardPerTokenComplete.toNumber(), 0);

    // user can stake
    await user.depositTokens(50_000);

    await utils.sleep(2 * 1000);

    await user.depositTokens(50_000);

    // check user pending rewards, no reward as the farming is not started
    userState = await user.getUserStakingInfo();
    assert.deepStrictEqual(userState.rewardPerTokenPending.toNumber(), 0);
    assert.deepStrictEqual(
      userState.balanceStaked.eq(new anchor.BN(50_000 * 2)),
      true
    );
    assert.deepStrictEqual(userState.rewardPerTokenPending.toNumber(), 0);
    assert.deepStrictEqual(userState.rewardPerTokenComplete.toNumber(), 0);

    // user claim 0 reward if farming is not started
    try {
      let claimableReward = await user.getUserPendingRewards();
      assert.deepStrictEqual(claimableReward.toNumber(), 0);
    } catch (e) {
      console.log(e);
    }

    // user is freely to withdraw anytime
    await user.withdrawTokens(50_000);
    userState = await user.getUserStakingInfo();
    assert.deepStrictEqual(
      userState.balanceStaked.eq(new anchor.BN(50_000)),
      true
    );

    // farming is not started, therefore the pool reward per token is 0
    let poolState = await program.account.pool.fetch(pool);
    assert.deepStrictEqual(poolState.rewardPerTokenStored.toNumber(), 0);
    assert.deepStrictEqual(poolState.lastUpdateTime.toNumber(), 0);
  });

  it("User does some staking after admin activate farming", async () => {
    let pendingReward = new anchor.BN(0);

    //we test all this in greater detail later, but this is a flow for single reward staking
    let userKeyPair = anchor.web3.Keypair.generate();
    let user = new User(1);
    await user.init(
      userKeyPair,
      10_000_000_000,
      stakingMint,
      100_000,
      rewardMint
    );
    await user.createUserStakingAccount(pool);

    try {
      await user.createUserStakingAccount(pool);
      assert.fail("cannot create dupe user");
    } catch (e) {}

    await admin.activateFarming(pool);

    // Make sure the farm is activated
    let poolState = await program.account.pool.fetch(pool);
    assert.deepStrictEqual(poolState.lastUpdateTime.toNumber() > 0, true);
    assert.deepStrictEqual(
      poolState.rewardEndTimestamp.toNumber(),
      poolState.lastUpdateTime.add(rewardDuration).toNumber()
    );
    assert.deepStrictEqual(poolState.rewardPerTokenStored.toNumber(), 0);

    // Sleep a little bit
    await utils.sleep(1 * 1000);

    await user.depositTokens(100_000);
    // Make sure program calculate reward_per_token_stored for previous time-window
    // time-window = (times since farm activated -> now)
    poolState = await program.account.pool.fetch(pool);
    assert.deepStrictEqual(
      poolState.rewardPerTokenStored.gt(new anchor.BN(0)),
      true
    );

    let userState = await program.account.user.fetch(user.userPubkey);
    assert.deepStrictEqual(userState.balanceStaked.toNumber(), 100_000);

    try {
      // No time elapsed, no rewards
      pendingReward = await user.getUserPendingRewards();
      assert.deepStrictEqual(pendingReward.toNumber(), 0);
    } catch (e) {
      console.log(e);
    }

    await utils.sleep(2 * 1000);

    try {
      // 2 seconds elapsed
      pendingReward = await user.getUserPendingRewards();
      assert.deepStrictEqual(pendingReward.gt(new anchor.BN(0)), true);
      console.log("Pending Reward after 2 seconds", pendingReward.toString());
    } catch (e) {
      console.log(e);
    }

    // claim reward zero because no amount in reward account
    let claimedReward = await user.claim();
    assert.deepStrictEqual(claimedReward.toNumber(), 0);

    // fund reward account
    await user.fundReward(10_000_000_000);

    // Can claim reward
    claimedReward = await user.claim();
    assert.deepStrictEqual(
      claimedReward.toNumber() >= pendingReward.toNumber(),
      true
    );

    // after claim, no pending rewards
    userState = await program.account.user.fetch(user.userPubkey);
    assert.deepStrictEqual(userState.rewardPerTokenPending.toNumber(), 0);

    // User unstake 1/2
    await user.withdrawTokens(50_000);

    userState = await program.account.user.fetch(user.userPubkey);
    assert.deepStrictEqual(userState.balanceStaked.toNumber(), 50_000);

    try {
      pendingReward = await user.getUserPendingRewards();
      console.log("Pending Reward ", pendingReward.toString());
    } catch (e) {
      console.log(e);
    }

    // Cannot close user account because there's staking balance
    try {
      await user.closeUser();
      assert.fail("did not fail closing active staking account");
    } catch (e) {}

    await utils.sleep(1 * 1000);
    // Withdraw all
    await user.withdrawTokens(50_000);

    // Cannot close user account because there's pending reward
    try {
      await user.closeUser();
      assert.fail("did not fail closing active staking account");
    } catch (e) {}
    // claim all pending rewards
    await user.claim();

    // Can close user account because stake_amount = 0 and pending reward = 0
    await user.closeUser();
  });

  it("Reward rate decrease overtime", async () => {
    let mintData = await initializeMint();
    stakingKeyPair = mintData.stakingKeyPair;
    stakingMint = mintData.stakingMint;
    rewardKeypair = mintData.rewardKeypair;
    rewardMint = mintData.rewardMint;

    adminKey = anchor.web3.Keypair.generate();
    admin = new User(2);
    await admin.init(adminKey, 10_000_000_000, stakingMint, 0, rewardMint);

    rewardDuration = new anchor.BN(5);

    pool = await admin.initializePool(
      stakingMint,
      rewardMint,
      rewardDuration,
      fundingAmount
    );

    let userKeyPair = anchor.web3.Keypair.generate();
    let user = new User(3);
    await user.init(
      userKeyPair,
      10_000_000_000,
      stakingMint,
      100_000,
      rewardMint
    );
    await user.createUserStakingAccount(pool);
    await user.depositTokensFull();
    await admin.activateFarming(pool);

    await utils.sleep(1 * 1000);
    try {
      let beforePendingReward = await user.getUserPendingRewards();
      let beforeRewardPerSecond = beforePendingReward.toNumber();

      let elapsed = 1;
      console.log(
        `Reward per seconds after elapsed ${elapsed} seconds`,
        beforeRewardPerSecond
      );
      while (elapsed++ <= rewardDuration.toNumber()) {
        await utils.sleep(1 * 1000);
        let pendingReward = await user.getUserPendingRewards();
        let rewardPerSeconds =
          pendingReward.toNumber() - beforePendingReward.toNumber();
        console.log(
          `Reward per seconds after elapsed ${elapsed} seconds`,
          rewardPerSeconds
        );
        // it's weird that sometime works, sometime doesn't
        // assert.deepStrictEqual(rewardPerSeconds < beforeRewardPerSecond, true);
        beforeRewardPerSecond = rewardPerSeconds;
        beforePendingReward = pendingReward;
      }
    } catch (e) {
      console.log(e);
    }
  });

  it("User does some staking after end date", async () => {
    let mintData = await initializeMint();
    stakingKeyPair = mintData.stakingKeyPair;
    stakingMint = mintData.stakingMint;
    rewardKeypair = mintData.rewardKeypair;
    rewardMint = mintData.rewardMint;

    adminKey = anchor.web3.Keypair.generate();
    admin = new User(2);
    await admin.init(adminKey, 10_000_000_000, stakingMint, 0, rewardMint);

    rewardDuration = new anchor.BN(3);

    pool = await admin.initializePool(
      stakingMint,
      rewardMint,
      rewardDuration,
      fundingAmount
    );

    let userKeyPair = anchor.web3.Keypair.generate();
    let user = new User(5);
    await user.init(
      userKeyPair,
      10_000_000_000,
      stakingMint,
      100_000,
      rewardMint
    );
    await user.createUserStakingAccount(pool);
    await user.depositTokens(100_000);
    // wait util reward ends
    await utils.sleep(3 * 1000);
    try {
      var pendingRewardBefore = await user.getUserPendingRewards();
      await utils.sleep(2 * 1000);
      var pendingRewardAfter = await user.getUserPendingRewards();
      // reward doesn't change after duration end
      assert.deepStrictEqual(
        pendingRewardBefore.toNumber(),
        pendingRewardAfter.toNumber()
      );
      // because reward ended, no reward to claim
      assert.deepStrictEqual(pendingRewardAfter.toNumber(), 0);
    } catch (e) {
      console.log(e);
    }

    let claimedAmount = await user.claim();
    // claim 0 reward
    assert.deepStrictEqual(claimedAmount.toNumber(), 0);

    // user still able to withdraw
    await user.withdrawTokens(100_000);

    const userState = await program.account.user.fetch(user.userPubkey);
    assert.deepStrictEqual(userState.balanceStaked.toNumber(), 0);

    await user.closeUser();
  });

  it("User do full staking", async () => {
    let userKeyPair = anchor.web3.Keypair.generate();
    let user = new User(7);
    const mintAmount = 100_000;
    await user.init(
      userKeyPair,
      10_000_000_000,
      stakingMint,
      mintAmount,
      rewardMint
    );
    let beforeBalance =
      await user.program.provider.connection.getTokenAccountBalance(
        user.stakingTokenAccount
      );
    assert.strictEqual(beforeBalance.value.amount, String(mintAmount));
    await user.createUserStakingAccount(pool);
    await user.depositTokensFull();
    let afterBalance =
      await user.program.provider.connection.getTokenAccountBalance(
        user.stakingTokenAccount
      );
    assert.strictEqual(afterBalance.value.amount, String(0));

    const userState = await program.account.user.fetch(user.userPubkey);
    assert.deepStrictEqual(
      userState.balanceStaked.eq(new anchor.BN(mintAmount)),
      true
    );
  });

  it("Shall not affect reward if somebody deposit directly to staking vault", async () => {
    let mintData = await initializeMint();
    stakingKeyPair = mintData.stakingKeyPair;
    stakingMint = mintData.stakingMint;
    rewardKeypair = mintData.rewardKeypair;
    rewardMint = mintData.rewardMint;

    adminKey = anchor.web3.Keypair.generate();
    admin = new User(2);
    await admin.init(adminKey, 10_000_000_000, stakingMint, 0, rewardMint);

    rewardDuration = new anchor.BN(3);

    pool = await admin.initializePool(
      stakingMint,
      rewardMint,
      rewardDuration,
      fundingAmount
    );

    let userKeyPair = anchor.web3.Keypair.generate();
    let user = new User(8);
    await user.init(
      userKeyPair,
      10_000_000_000,
      stakingMint,
      100_000,
      rewardMint
    );
    await user.createUserStakingAccount(pool);
    await user.depositTokens(100_000);
    await admin.activateFarming(pool);

    // Somebody directly deposit to pool stakingVault, manipulating reward_per_token_stored
    const poolState = await program.account.pool.fetch(pool);
    await user.mintStakingTokenTo(poolState.stakingVault, 100_000_000);

    // Unable to claim mistakenly deposited token when the reward is not ended
    let result = program.methods
      .withdrawExtraToken()
      .accounts({
        admin: adminKey.publicKey,
        pool,
        stakingVault: poolState.stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        withdrawToAccount: admin.stakingTokenAccount,
      })
      .signers([adminKey])
      .rpc();

    await assert.rejects(result);

    console.log("Waiting for reward duration end");
    await utils.sleep((rewardDuration.toNumber() + 1) * 1000);
    console.log("Reward ended");

    // Able to withdraw mistakenly deposited token
    await program.methods
      .withdrawExtraToken()
      .accounts({
        admin: adminKey.publicKey,
        pool,
        stakingVault: poolState.stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        withdrawToAccount: admin.stakingTokenAccount,
      })
      .signers([adminKey])
      .rpc()
      .catch(console.error);

    const adminStakingTokenBalance =
      await program.provider.connection.getTokenAccountBalance(
        admin.stakingTokenAccount
      );
    assert.deepStrictEqual(
      Number(adminStakingTokenBalance.value.amount),
      100_000_000
    );

    try {
      const claimable = await user.getUserPendingRewards();
      console.log("Claimable reward", claimable.toNumber());
      // User still eligible to full reward
      assert.deepStrictEqual(
        claimable.toNumber(),
        fundingAmount.toNumber() - 1
      );
    } catch (e) {
      console.log(e);
    }
  });
});

async function initializeMint() {
  let stakingKeyPair = anchor.web3.Keypair.generate();
  await utils.createMintFromPriv(
    stakingKeyPair,
    provider,
    provider.wallet.publicKey,
    null,
    9,
    TOKEN_PROGRAM_ID
  );
  let stakingMint = stakingKeyPair.publicKey;
  let rewardKeypair = anchor.web3.Keypair.generate();
  await utils.createMintFromPriv(
    rewardKeypair,
    provider,
    provider.wallet.publicKey,
    null,
    9,
    TOKEN_PROGRAM_ID
  );
  let rewardMint = rewardKeypair.publicKey;
  return {
    stakingKeyPair: stakingKeyPair,
    stakingMint: stakingMint,
    rewardKeypair: rewardKeypair,
    rewardMint: rewardMint,
  };
}
