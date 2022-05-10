const assert = require("assert");
const anchor = require('@project-serum/anchor');
const serumCmn = require("@project-serum/common");
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const utils = require("./utils");
const { User, claimForUsers } = require("./user");
const fs = require('fs');

let program = anchor.workspace.SingleFarming;

//Read the provider from the configured environmnet.
//represents an outside actor
//owns mints out of any other actors control, provides initial $$ to others
const envProvider = anchor.AnchorProvider.env();

//we allow this convenience var to change between default env and mock user(s)
//initially we are the outside actor
let provider = envProvider;
//convenience method to set in anchor AND above convenience var
//setting in anchor allows the rpc and accounts namespaces access
//to a different wallet from env
function setProvider(p) {
  provider = p;
  anchor.setProvider(p);
  program = new anchor.Program(program.idl, program.programId, p);
};
setProvider(provider);

describe('Multiuser Reward Pool', () => {

  let EXPECTED_POOL_CREATE_COST = 12_546_920;

  const rewardDuration = new anchor.BN(10);
  const rewardDuration2 = new anchor.BN(30);
  const rewardDuration3 = new anchor.BN(5);

  let xMintKey;
  let xMintObject;
  let xMintPubkey;
  let users;
  let users2;
  let funders;
  let mintA;
  let mintB;
  let mintC;
  let stakingMint;
  let stakingMint2;
  let poolKeypair = anchor.web3.Keypair.generate();
  let poolKeypair2 = anchor.web3.Keypair.generate();
  let poolKeypair3 = anchor.web3.Keypair.generate();

  it("Initialize mints", async () => {
    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());
    //this is the xstep token
    //test xstep token hardcoded in program, mint authority is itself
    rawdata = fs.readFileSync('tests/keys/xstep-tEsTL8G8drugWztoCKrPpEAXV21qEajfHg4q45KYs6s.json');
    keyData = JSON.parse(rawdata);
    xMintKey = anchor.web3.Keypair.fromSecretKey(new Uint8Array(keyData));
    xMintPubkey = xMintKey.publicKey;
    xMintObject = await utils.createMintFromPriv(xMintKey, provider, provider.wallet.publicKey, null, 9, TOKEN_PROGRAM_ID);
    setProvider(envProvider);
    //these mints are ecosystem mints not owned
    //by funder or user
    mintA = await utils.createMint(provider, 9);
    mintB = await utils.createMint(provider, 9);
    mintC = await utils.createMint(provider, 3);
    stakingMint = await utils.createMint(provider, 9);
    stakingMint2 = await utils.createMint(provider, 5);
    stakingMint3 = await utils.createMint(provider, 2);
  });

  it("Initialize users", async () => {
    users = [1, 2, 3, 4, 5].map(a => new User(a));
    users2 = [11, 12].map(a => new User(a));
    await Promise.all(
      users.map(a => a.init(10_000_000_000, xMintPubkey, 0, stakingMint.publicKey, 5_000_000_000, mintA.publicKey, 0, mintB.publicKey, 0))
        .concat(
          users2.map(a => a.init(10_000_000_000, xMintPubkey, 0, stakingMint2.publicKey, 500_000, mintB.publicKey, 0, mintC.publicKey, 0))
        )
    );
  })

  it("Initialize funders", async () => {
    funders = [0, 10, 20].map(a => new User(a));
    await Promise.all([
      funders[0].init(10_000_000_000, xMintPubkey, 9_999_999_999_999, stakingMint.publicKey, 0, mintA.publicKey, 100_000_000_000, mintB.publicKey, 200_000_000_000),
      funders[1].init(10_000_000_000, xMintPubkey, 10_000_000_000_000, stakingMint2.publicKey, 0, mintB.publicKey, 10_000_000_000, mintC.publicKey, 10_000),
      funders[2].init(10_000_000_000, xMintPubkey, 10_000_000_000_000, stakingMint3.publicKey, 0, mintB.publicKey, 10_000_000_000, mintB.publicKey, 0),
    ]);
  });

  //to track cost to create pool, and compare to refund at teardown
  let costInLamports;

  it("Creates a pool", async () => {
    try {
      await funders[0].initializePool(poolKeypair, rewardDuration, false);
      assert.fail("did not fail for lack of xSTEP");
    } catch (e) { }

    //give just ONE more xSTEP
    xMintObject.mintTo(funders[0].xTokenPubkey, envProvider.wallet.payer, [], 1);

    await funders[0].initializePool(poolKeypair, rewardDuration, false);

    //second funder tries to create with same pubkey
    try {
      await funders[1].initializePool(poolKeypair, rewardDuration2, false);
      assert.fail("did not fail to create dupe pool");
    } catch (e) { }

    //track cost of creating a pool
    let startLamports = (await provider.connection.getBalance(funders[1].pubkey));

    await funders[1].initializePool(poolKeypair2, rewardDuration2, false);

    //validate cost
    let endLamports = (await provider.connection.getBalance(funders[1].pubkey));
    costInLamports = startLamports - endLamports;
    console.log("Cost of creating a pool", (costInLamports / 1_000_000_000));
    assert.equal(costInLamports, EXPECTED_POOL_CREATE_COST + 5_000); //5k tx fee

    await funders[2].initializePool(poolKeypair3, rewardDuration3, true);
  });

  it('User does some single staking', async () => {

    //we test all this in greater detail later, but this is a flow for single reward staking

    let pool = funders[2].poolPubkey;
    let user = new User(99);
    await user.init(10_000_000_000, xMintPubkey, 0, stakingMint3.publicKey, 500_000, mintB.publicKey, 0, mintB.publicKey, 0);
    await user.createUserStakingAccount(pool);
    await user.stakeTokens(100_000);

    try {
      await funders[2].fund(1_000_000_000, 1);
      assert.fail("single stake pool should fail if funded token b");
    } catch (e) { }

    try {
      var expected = (await user.getUserPendingRewardsFunction())();
      console.log("Expected", expected[0], expected[1]);
    } catch (e) {
      console.log(e);
      process.exit();
    }

    //fund with < 1 lamport per second
    await funders[2].fund(4, 0);

    expected = await user.getUserPendingRewardsFunction();
    var e = expected()
    console.log("Expected", e[0], e[1]);
    await wait(1);
    e = expected()
    console.log("Expected", e[0], e[1]);
    await wait(1);
    e = expected()
    console.log("Expected", e[0], e[1]);
    await wait(1);
    e = expected()
    console.log("Expected", e[0], e[1]);
    await wait(1);
    e = expected()
    console.log("Expected", e[0], e[1]);
    await wait(1);
    e = expected()
    console.log("Expected", e[0], e[1]);

    let [ra, rb, a, b] = await user.claim();

    console.log('ra', ra, 'rb', rb, 'a', a.toString(), 'b', b.toString());

    assert.equal(ra, .000000003); //actually 3.99999999999 but floor kills this
    assert.equal(rb, 0);
    assert.equal(a.toString(), 25228800);
    assert.equal(b.toString(), 0);

    await user.unstakeTokens(100_000);
    await user.closeUser();
    await funders[2].pausePool();
    await funders[2].closePool();
  });

  it('Users create staking accounts', async () => {
    let pool = funders[0].poolPubkey;
    let pool2 = funders[1].poolPubkey;

    await Promise.all(
      users.map(a => a.createUserStakingAccount(pool))
        .concat(
          users2.map(a => a.createUserStakingAccount(pool2))
        )
    );

    //user tries to create a dupe account
    try {
      await users[0].createUserStakingAccount(pool);
      assert.fail("did not fail to create dupe user");
    } catch (e) { }
  });

  it('Users closes staking account', async () => {
    await users[0].closeUser();
  });

  it('Users reopens staking account', async () => {
    let pool = funders[0].poolPubkey;
    await users[0].createUserStakingAccount(pool);
  });

  it('Some users stake some tokens', async () => {

    await Promise.all([
      users[0].stakeTokens(2_000_000_000),
      users[1].stakeTokens(2_000_000_000),
      users[2].stakeTokens(500_000_000),
    ]);
  });

  it('Users tries to close staking account', async () => {
    try {
      await users[0].closeUser();
      assert.fail("did not fail closing active staking account");
    } catch (e) { }
  });

  it('User tries to stake more tokens than they have', async () => {
    try {
      await users[4].stakeTokens(5_000_000_001)
      assert.fail("did not fail on user stake too much");
    } catch (e) { }
  });

  it('Users try to unstake when they have none', async () => {
    try {
      await users[3].unstakeTokens(1);
      assert.fail("did not fail on user unstaking when no balance");
    } catch (e) { }
  });

  it('Users try to unstake more than they have', async () => {
    try {
      await users[2].unstakeTokens(500_000_001);
      assert.fail("did not fail on user unstaking when more than they have");
    } catch (e) { }
  });

  it('Pool 2 has one initial staker', async () => {
    await users2[0].stakeTokens(250_000);
  });

  it('Fails to authorize 5th funder', async () => {
    await funders[1].authorizeFunder(anchor.web3.Keypair.generate().publicKey);
    await funders[1].authorizeFunder(anchor.web3.Keypair.generate().publicKey);
    let tmpAuth = anchor.web3.Keypair.generate().publicKey;
    await funders[1].authorizeFunder(tmpAuth);
    await funders[1].authorizeFunder(anchor.web3.Keypair.generate().publicKey);
    try {
      await funders[1].authorizeFunder(anchor.web3.Keypair.generate().publicKey);
      assert.fail("did not fail on authorizing 5th funder");
    } catch (e) { }
    //deauth a funder in the middle of the array
    await funders[1].deauthorizeFunder(tmpAuth);
  });

  it('Funder funds pool with a delegated funder', async () => {
    //funder 1 authorize funder 2 to fund its pool
    await funders[1].authorizeFunder(funders[2].provider.wallet.publicKey);

    //validate the pool's contents. This funder should be in position 3, since 1,2 and 4,5 are filled
    let acct = await program.account.pool.fetch(funders[1].poolPubkey);
    assert.equal(acct.funders[2].toString(), funders[2].provider.wallet.publicKey.toString());

    //funder 2 fund funder 1's pool
    await funders[2].fund(1, 0, funders[1].poolPubkey);
    //remove the funding permission
    await funders[1].deauthorizeFunder(funders[2].provider.wallet.publicKey);
    //funder 2 fail to fund funder 1's pool
    try {
      await funders[2].fund(1, 0, funders[1].poolPubkey);
      assert.fail("did not fail on funder unauthorized funding");
    } catch (e) { }

    //validate the pool's contents. Position 3 should be empty
    acct = await program.account.pool.fetch(funders[1].poolPubkey);
    assert.equal(acct.funders[2].toString(), anchor.web3.PublicKey.default.toString());
  });

  //now is pool 1 users stakes: 2_000_000_000, 2_000_000_000, 500_000_000, 0, 0
  //now is pool 2 users stakes: 250_000, 0
  it('Funder funds the pool', async () => {
    //10 second duration
    await funders[0].fund(1_000_000_000, 2_000_000_000);
    //30 second duration
    await funders[1].fund(1_000_000_000, 1_000); //with decimals, this is 1 of each
  });

  it('waits', async () => {
    await wait(5); //pool 1 @ 5, pool 2 @ 25
  });

  it('User 5 snipes', async () => {
    setProvider(envProvider);
    //user 5 is a bitch and immediately hops in, claims, and leaves in one tx
    //should get 0
    await users[4].snipe(2_000_000_000);

    assert.strictEqual(0, (await provider.connection.getTokenAccountBalance(users[4].mintAPubkey)).value.uiAmount);
    assert.strictEqual(0, (await provider.connection.getTokenAccountBalance(users[4].mintBPubkey)).value.uiAmount);
  });

  it('User 2 claims halfway through', async () => {
    //user 2 claims
    await users[1].claim();
    assert(0 < (await provider.connection.getTokenAccountBalance(users[1].mintAPubkey)).value.uiAmount);
    assert(0 < (await provider.connection.getTokenAccountBalance(users[1].mintBPubkey)).value.uiAmount);
  });

  it('waits and watches', async () => {
    var expectedFn = await users[0].getUserPendingRewardsFunction();
    await wait(1);
    var expected = expectedFn();
    console.log('user 1 estimated A', expected[0], 'estimated B', expected[1]);
    await wait(1);
    expected = expectedFn();
    console.log('user 1 estimated A', expected[0], 'estimated B', expected[1]);
    await wait(1);
    expected = expectedFn();
    console.log('user 1 estimated A', expected[0], 'estimated B', expected[1]);
    await wait(1);
    expected = expectedFn();
    console.log('user 1 estimated A', expected[0], 'estimated B', expected[1]);
    await wait(1);
    expected = expectedFn();
    console.log('user 1 estimated A', expected[0], 'estimated B', expected[1]);
    await wait(1); //pool 1 @ -1, pool 2 @ 19
    expected = expectedFn();
    console.log('user 1 estimated A', expected[0], 'estimated B', expected[1]);
  });

  it('Users claim at end of fund', async () => {
    await claimForUsers(users);

    assert.strictEqual(0, await getTokenBalance(funders[0].admin.mintAVault));
    assert.strictEqual(0, await getTokenBalance(funders[0].admin.mintBVault));

    assert.strictEqual(0.444444, await getTokenBalance(users[0].mintAPubkey));
    assert.strictEqual(0.888889, await getTokenBalance(users[0].mintBPubkey));
    assert.strictEqual(0.444444, await getTokenBalance(users[1].mintAPubkey));
    assert.strictEqual(0.888889, await getTokenBalance(users[1].mintBPubkey));
    assert.strictEqual(0.111111, await getTokenBalance(users[2].mintAPubkey));
    assert.strictEqual(0.222222, await getTokenBalance(users[2].mintBPubkey));
  });

  it('waits', async () => {
    await wait(3); //pool 1 @ -4, pool 2 @ 16
  });

  //now is pool 2 users stakes: 500_000, 250_000
  it('Pool 2 users stake ~halfway through duration', async () => {
    await Promise.all(users2.map(a => a.stakeTokens(250_000)));
  });

  it('Users tries to close staking account', async () => {
    try {
      await users[0].closeUser();
      assert.fail("did not fail closing active staking account");
    } catch (e) { }
  });

  it('Funder funds the pool again', async () => {
    await funders[0].fund(1_000_000_000, 1_000_000_000);
  });

  it('waits', async () => {
    await wait(4); //pool 1 @ 6, pool 2 @ 12
  });

  it('Funder funds the pool during emissions', async () => {
    await funders[0].fund(30_000_000_000, 50_000_000_000);
  });

  it('waits', async () => {
    await wait(5); //pool 1 @ 5, pool 2 @ 7
  });

  let oldValA;
  let oldValB;

  it('Users claim at original end of fund', async () => {
    await claimForUsers(users);
    //rewards remain
    assert(0 < await getTokenBalance(funders[0].admin.mintAVault));
    assert(0 < await getTokenBalance(funders[0].admin.mintBVault));

    oldValA = await getTokenBalance(users[0].mintAPubkey);
    oldValB = await getTokenBalance(users[0].mintBPubkey);
  });

  it('waits', async () => {
    await wait(7); //pool 1 @ -2, pool 2 @ 0
  });

  let newValA;
  let newValB;

  it('Users claim at proper new end of fund', async () => {
    await claimForUsers(users);
    //no rewards remain
    assert.strictEqual(0, await getTokenBalance(funders[0].admin.mintAVault));
    assert.strictEqual(0, await getTokenBalance(funders[0].admin.mintBVault));

    newValA = await getTokenBalance(users[0].mintAPubkey);
    newValB = await getTokenBalance(users[0].mintBPubkey);
    assert(oldValA < newValA);
    assert(oldValB < newValB);
  });

  it('Funder funds the pool again', async () => {
    await funders[0].fund(1_000_000_000, 1_000_000_000);
  });

  it('waits', async () => {
    await wait(7); //pool 1 @ 3, pool 2 done
  });

  it('Welcome user 4 to the pool in last 3 seconds', async () => {
    await users[3].stakeTokens(2_000_000_000);
  });

  it('waits', async () => {
    await wait(4); //pool 1 @ -1, pool 2 done
  });

  it('Users claim, new user should have small amount', async () => {
    await claimForUsers(users);
    //users got a smidge less than they would have had user 4 not spoiled the fun
    assert(0.43 > await getTokenBalance(users[0].mintAPubkey)
      - newValA); //newValA was what they had after last round of payments; 0.4444 is what would have been if user 4 didnt join
    let user4Amount = await getTokenBalance(users[3].mintAPubkey);
    assert(0 < user4Amount);
    assert(0.11 > user4Amount);
  });

  it('Users tries to close staking account', async () => {
    try {
      await users[0].closeUser();
      assert.fail("did not fail closing active staking account");
    } catch (e) { }
  });

  it('User unstakes all tokens in pool', async () => {
    await users[0].unstakeTokens(2_000_000_000);
  });

  it('Users closes staking account', async () => {
    await users[0].closeUser();
  });

  it('Users tries to close staking account', async () => {
    try {
      await users[1].closeUser();
      assert.fail("did not fail closing active staking account");
    } catch (e) { }
  });

  //pool2 ending

  it('Pool 2 users claim', async () => {
    await claimForUsers(users2);

    //assert everything distributed, 
    //user 1 has 100% of 1/2 and 2/3 of other 1/2 = 3/6 + 2/6 = 5/6
    //user 2 has 0% of 1/2 and 1/3 of other 1/2 = 0/6 + 1/6 = 1/6

    //possible dust remaining - but not too much
    let remain1 = await getTokenBalance(funders[1].admin.mintAVault);
    console.log(remain1);
    assert(.02 > remain1);

    let remain2 = await getTokenBalance(funders[1].admin.mintBVault);
    console.log(remain2);
    assert(.02 > remain2);

    let u1A = await getTokenBalance(users2[0].mintAPubkey);
    let u1B = await getTokenBalance(users2[0].mintBPubkey);
    let u2A = await getTokenBalance(users2[1].mintAPubkey);
    let u2B = await getTokenBalance(users2[1].mintBPubkey);

    console.log(u1A);
    console.log(u1B);
    console.log(u2A);
    console.log(u2B);

    //user balances plus remainder = 1 (initial rewards total) 
    assert.strictEqual(remain1 + u1A + u2A, 1);
    assert.strictEqual(remain2 + u1B + u2B, 1);

    //probably 0.833333323 and 0.166666664, or 5/6 vs 1/6, or 5x difference
    assert(u2A < u1A / 4);
    assert(u2A > u1A / 6);

    //probably 0.823 and 0.164, or 5/6 vs 1/6, or 5x difference
    assert(u2B < u1B / 4);
    assert(u2B > u1B / 6);
  });

  it('User tries to pause the pool using own pubkey', async () => {
    try {
      await users[0].pausePool(true, null);
      assert.fail("did not fail on user pause pool");
    } catch (e) { }
  });

  it('User tries to pause the pool using funder pubkey but unsigned', async () => {
    try {
      await users[0].pausePool(true, funders[0].provider.wallet.publicKey);
      assert.fail("did not fail on user pause pool");
    } catch (e) { }
  });

  it('Funder pauses the pool', async () => {
    assert.strictEqual(0, await getTokenBalance(funders[0].xTokenPubkey));
    await funders[0].pausePool(null);
    //assert xtoken refunded
    assert.strictEqual(10_000, await getTokenBalance(funders[0].xTokenPubkey));
  });

  it('Funder pauses the paused pool', async () => {
    try {
      await funders[0].pausePool(null);
      assert.fail("did not fail on pausing paused pool");
    } catch (e) { }
  });

  it('User tries to stake some tokens in paused pool', async () => {
    try {
      await users[3].stakeTokens(100_000);
      assert.fail("did not fail on user staking in paused pool");
    } catch (e) { }
  });

  it('User tries to unpause the pool using own pubkey', async () => {
    try {
      await users[0].unpausePool(null);
      assert.fail("did not fail on user pause pool");
    } catch (e) { }
  });

  it('User tries to unpause the pool using funder pubkey but unsigned', async () => {
    try {
      await users[0].unpausePool(funders[0].provider.wallet.publicKey);
      assert.fail("did not fail on user pause pool");
    } catch (e) { }
  });

  it('User unstakes some tokens in paused pool', async () => {
    await users[2].unstakeTokens(250_000_000);
  });

  it('Funder unpauses the pool', async () => {
    assert.strictEqual(10_000, await getTokenBalance(funders[0].xTokenPubkey));
    await funders[0].unpausePool(null);
    //assert xtoken spent
    assert.strictEqual(0, await getTokenBalance(funders[0].xTokenPubkey));
  });

  it('Funder unpauses the unpaused pool', async () => {
    try {
      await funders[0].unpausePool(null);
      assert.fail("did not fail on pausing paused pool");
    } catch (e) { }
  });

  it('User stakes some tokens in unpaused pool', async () => {
    await users[2].stakeTokens(250_000_000);
  });

  it("Tries to close a pool with active user", async () => {
    try {
      await funders[1].closePool();
      assert.fail("should have failed closing active pool")
    } catch {
    }
  });

  it('Pool 2 users unstake all, all close', async () => {
    await Promise.all(users2.map(a => a.unstakeTokens(250_000)));
    //this dude had another 250k staked
    await users2[0].unstakeTokens(250_000);
    await Promise.all(users2.map(a => a.closeUser()));
  });

  it("Pool 2 closes", async () => {
    try {
      await funders[1].closePool();
      assert.fail("funder was able to close pool without pausing first?!");
    } catch { }

    //track refund on teardown
    let startLamports = (await provider.connection.getBalance(funders[1].pubkey));

    await funders[1].pausePool();
    await funders[1].closePool();

    //validate cost
    let endLamports = (await provider.connection.getBalance(funders[1].pubkey));
    let refundInLamports = endLamports - startLamports;
    console.log("Refund when destroying a pool", (refundInLamports / 1_000_000_000));
    assert.equal(refundInLamports, EXPECTED_POOL_CREATE_COST - 15_000); //15k in tx fees during close, unclear why not 10k


    let pool = await provider.connection.getAccountInfo(funders[1].admin.poolKeypair.publicKey);
    let sv = await provider.connection.getAccountInfo(funders[1].admin.stakingMintVault);
    let av = await provider.connection.getAccountInfo(funders[1].admin.mintAVault);
    let bv = await provider.connection.getAccountInfo(funders[1].admin.mintBVault);

    assert.strictEqual(pool, null);
    assert.strictEqual(sv, null);
    assert.strictEqual(av, null);
    assert.strictEqual(bv, null);
  });

});

async function getTokenBalance(pubkey) {
  return parseFloat((await provider.connection.getTokenAccountBalance(pubkey)).value.uiAmount.toFixed(6))
}

async function wait(seconds) {
  while (seconds > 0) {
    console.log("countdown " + seconds--);
    await new Promise(a => setTimeout(a, 1000));
  }
  console.log("wait over");
}