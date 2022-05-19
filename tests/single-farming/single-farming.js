const assert = require("assert");
const anchor = require('@project-serum/anchor');
// const anchor = require('./browser');
const serumCmn = require("@project-serum/common");
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const utils = require("./utils");
const { User } = require("./user");
const fs = require('fs');

let program = anchor.workspace.SingleFarming;

//Read the provider from the configured environmnet.
//represents an outside actor
//owns mints out of any other actors control, provides initial $$ to others
// const envProvider = anchor.AnchorProvider.env();

//we allow this convenience var to change between default env and mock user(s)
//initially we are the outside actor
let provider = anchor.AnchorProvider.env();
//convenience method to set in anchor AND above convenience var
//setting in anchor allows the rpc and accounts namespaces access
//to a different wallet from env
function setProvider(p) {
  provider = p;
  anchor.setProvider(p);
  program = new anchor.Program(program.idl, program.programId, p);
};
setProvider(provider);


console.log("program id ", program.programId.toString());

describe('Reward Pool', () => {

  var rewardDuration = new anchor.BN(10);

  var admin;
  var stakingMint;
  var rewardStartTimestamp = new anchor.BN(0);
  var fundingAmount = new anchor.BN(10000);
  var rewardMint;
  var pool;

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
    //create pool by zero duration
    try {
      await admin.initializePool(stakingMint, rewardMint, rewardStartTimestamp, new anchor.BN(0), fundingAmount);
      assert.fail("cannot create pool by zero duration");
    } catch (e) { }

    try {
      await admin.initializePool(stakingMint, rewardMint, rewardStartTimestamp, rewardDuration, fundingAmount);
      assert.fail("cannot create pool if rewardStartTimestamp is smaller than the current time");
    } catch (e) { }
    rewardStartTimestamp = new anchor.BN(Math.floor(Date.now() / 1000))
    pool = await admin.initializePool(stakingMint, rewardMint, rewardStartTimestamp, rewardDuration, fundingAmount);
    //re create the duplicate pool 
    try {
      await admin.initializePool(stakingMint, rewardMint, rewardStartTimestamp, rewardDuration, fundingAmount);
      assert.fail("did not fail to create dupe pool");
    } catch (e) { }
  });

  it('User does some staking', async () => {
    //we test all this in greater detail later, but this is a flow for single reward staking
    let userKeyPair = anchor.web3.Keypair.generate();
    let user = new User(1);
    await user.init(userKeyPair, 10_000_000_000, stakingMint, 100_000, rewardMint);
    await user.createUserStakingAccount(pool);

    try {
      await user.createUserStakingAccount(pool);
      assert.fail("did not fail to create dupe user");
    } catch (e) { }

    await user.stakeTokens(100_000);

    try {
      var pendingReward = await user.getUserPendingRewardsFunction();
      assert.equal(pendingReward, 0);
    } catch (e) {
      console.log(e)
    }

    await utils.sleep(2 * 1000)

    var pendingReward = 0;
    try {
      pendingReward = await user.getUserPendingRewardsFunction();
      console.log("Pending Reward after 2 seconds", pendingReward.toString());
    } catch (e) {
      console.log(e)
    }


    // claim reward zero because no amount in reward account
    var claimedReward = await user.claim();
    assert.equal(claimedReward, 0);

    // fund reward account
    user.fundReward(10_000_000_000);


    // Can calaim reward
    var claimedReward = await user.claim();
    assert(claimedReward >= pendingReward.toString());

    // User unstake 1/2
    await user.unstakeTokens(50_000);
    try {
      var pendingReward = await user.getUserPendingRewardsFunction();
      console.log("Pending Reward ", pendingReward.toString());
    } catch (e) {
      console.log(e)
    }


    // Cannot close user account 
    try {
      await user.closeUser();
      assert.fail("did not fail closing active staking account");
    } catch (e) { }

    await utils.sleep(1 * 1000)
    await user.unstakeTokens(50_000);
    try {
      await user.closeUser();
      assert.fail("did not fail closing active staking account");
    } catch (e) { }
    // claim all pending rewards
    await user.claim();

    // Can close user account because stake_amount = 0 and pending reward = 0
    await user.closeUser();
  });

  it('User does some staking before start date', async () => {
    let mintData = await initializeMint();
    stakingKeyPair = mintData.stakingKeyPair;
    stakingMint = mintData.stakingMint;
    rewardKeypair = mintData.rewardKeypair;
    rewardMint = mintData.rewardMint;

    adminKey = anchor.web3.Keypair.generate();
    admin = new User(2);
    await admin.init(adminKey, 10_000_000_000, stakingMint, 0, rewardMint);

    rewardStartTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 5)
    pool = await admin.initializePool(stakingMint, rewardMint, rewardStartTimestamp, rewardDuration, fundingAmount);


    let userKeyPair = anchor.web3.Keypair.generate();
    let user = new User(3);
    await user.init(userKeyPair, 10_000_000_000, stakingMint, 100_000, rewardMint);
    await user.createUserStakingAccount(pool);


    try {
      await user.stakeTokens(100_000);
      assert.fail("fail because farming hasn't happened");
    } catch (e) { }

    await utils.sleep(5 * 1000);
    // can staking when time is over rewardStartTimestamp
    await user.stakeTokens(100_000);
  })

  it('User does some staking after end date', async () => {
    let mintData = await initializeMint();
    stakingKeyPair = mintData.stakingKeyPair;
    stakingMint = mintData.stakingMint;
    rewardKeypair = mintData.rewardKeypair;
    rewardMint = mintData.rewardMint;

    adminKey = anchor.web3.Keypair.generate();
    admin = new User(2);
    await admin.init(adminKey, 10_000_000_000, stakingMint, 0, rewardMint);

    rewardStartTimestamp = new anchor.BN(Math.floor(Date.now() / 1000))
    rewardDuration = new anchor.BN(3);

    pool = await admin.initializePool(stakingMint, rewardMint, rewardStartTimestamp, rewardDuration, fundingAmount);


    let userKeyPair = anchor.web3.Keypair.generate();
    let user = new User(5);
    await user.init(userKeyPair, 10_000_000_000, stakingMint, 100_000, rewardMint);
    await user.createUserStakingAccount(pool);
    await user.stakeTokens(100_000);
    // wait util reward ends 
    await utils.sleep(3 * 1000);
    try {
      var pendingRewardBefore = await user.getUserPendingRewardsFunction();
      await utils.sleep(2 * 1000);
      var pendingRewardAfter = await user.getUserPendingRewardsFunction();
      // reward doesn't change after duration end
      assert.equal(pendingRewardBefore.toString(), pendingRewardAfter.toString());
    } catch (e) {
      console.log(e)
    }


    let claimedAmount = await user.claim();
    console.log("Claim amount ", claimedAmount);
  })
});


async function initializeMint() {
  let stakingKeyPair = anchor.web3.Keypair.generate();
  await utils.createMintFromPriv(stakingKeyPair, provider, provider.wallet.publicKey, null, 9, TOKEN_PROGRAM_ID);
  let stakingMint = stakingKeyPair.publicKey;
  let rewardKeypair = anchor.web3.Keypair.generate();
  await utils.createMintFromPriv(rewardKeypair, provider, provider.wallet.publicKey, null, 9, TOKEN_PROGRAM_ID);
  let rewardMint = rewardKeypair.publicKey;
  return {
    stakingKeyPair: stakingKeyPair,
    stakingMint: stakingMint,
    rewardKeypair: rewardKeypair,
    rewardMint: rewardMint,
  }
}