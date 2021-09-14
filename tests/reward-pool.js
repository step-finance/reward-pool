const assert = require("assert");
const anchor = require('@project-serum/anchor');
const serumCmn = require("@project-serum/common");
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const utils = require("./utils");
const { User, claimForUsers } = require("./user");

let program = anchor.workspace.RewardPool;

//Read the provider from the configured environmnet.
//represents an outside actor
//owns mints out of any other actors control, provides initial $$ to others
const envProvider = anchor.Provider.env();

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

  const rewardDuration = new anchor.BN(10);

  let users;
  let funders;
  let mintA;
  let mintB;
  let stakingMint;
  let poolCreationAuthorityMint;
  let poolKeypair = anchor.web3.Keypair.generate();

  it("Initialize mints", async () => {
    setProvider(envProvider);
    //these mints are ecosystem mints not owned
    //by funder or user
    mintA = await utils.createMint(provider, 9);
    mintB = await utils.createMint(provider, 9);
    stakingMint = await utils.createMint(provider, 9);
    poolCreationAuthorityMint = await utils.createMint(provider, 0);
  });

  it("Initialize program", async () => {
    setProvider(envProvider);
    //by funder or user
    await utils.initializeProgram(program, provider, poolCreationAuthorityMint.publicKey);
  });

  it("Initialize users", async () => {
    users = [1, 2, 3, 4, 5].map(a => new User(a));
    await Promise.all(
      users.map(a => a.init(10_000_000_000, poolCreationAuthorityMint.publicKey, false, stakingMint.publicKey, 5_000_000_000, mintA.publicKey, 0, mintB.publicKey, 0))
    );
  })

  it("Initialize funders", async () => {
    funders = [1, 2].map(a => new User(a));
    await Promise.all(
      funders.map(a => a.init(10_000_000_000, poolCreationAuthorityMint.publicKey, true, stakingMint.publicKey, 0, mintA.publicKey, 100_000_000_000, mintB.publicKey, 200_000_000_000))
    );
  });

  it("Creates a pool", async () => {
    await funders[0].initializePool(poolKeypair, rewardDuration);

    //second funder tries to create with same pubkey
    try {
      await funders[1].initializePool(poolKeypair, rewardDuration);
      assert.fail("did not fail to create dupe pool");
    } catch (e) { }
  });

  it('Users create staking accounts', async () => {
    let pool = funders[0].poolPubkey;

    await Promise.all(
      users.map(a => a.createUserStakingAccount(pool))
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

  //these are all good, commenting just to get to the bottom faster

  it('User tries to stake more tokens than they have', async () => {
    try {
      await users[4].stakeTokens(5_000_000_001)
      assert.fail("did not fail on user stake too much");
    } catch (e) { }
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
      await funders[0].pausePool(true, null);
  });

  it('Funder pauses the paused pool', async () => {
      await funders[0].pausePool(true, null);
  });

  it('User tries to stake some tokens in paused pool', async () => {
    try {
      await users[3].stakeTokens(100_000);
      assert.fail("did not fail on user staking in paused pool");
    } catch (e) { }
  });

  it('User tries to unpause the pool using own pubkey', async () => {
    try {
      await users[0].pausePool(false, null);
      assert.fail("did not fail on user pause pool");
    } catch (e) { }
  });

  it('User tries to unpause the pool using funder pubkey but unsigned', async () => {
    try {
      await users[0].pausePool(false, funders[0].provider.wallet.publicKey);
      assert.fail("did not fail on user pause pool");
    } catch (e) { }
  });

  it('User unstakes some tokens in paused pool', async () => {
      await users[2].unstakeTokens(250_000_000);
  });

  it('Funder unpauses the pool', async () => {
      await funders[0].pausePool(false, null);
  });

  it('Funder unpauses the unpaused pool', async () => {
      await funders[0].pausePool(false, null);
  });

  it('User stakes some tokens in unpaused pool', async () => {
      await users[2].stakeTokens(250_000_000);
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

  //now is still users stakes: 2_000_000_000, 2_000_000_000, 500_000_000, 0, 0
  it('Funder funds the pool', async () => {
      await funders[0].fund(1_000_000_000, 2_000_000_000);
  });

  it('waits', async () => {
    await wait(5);
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

  it('waits', async () => {
    await wait(6);
  });

  it('Users claim at end of fund', async () => {
    await claimForUsers(users);

    assert.strictEqual(0, parseFloat((await provider.connection.getTokenAccountBalance(funders[0].admin.mintAVault)).value.uiAmount.toFixed(6)));
    assert.strictEqual(0, parseFloat((await provider.connection.getTokenAccountBalance(funders[0].admin.mintBVault)).value.uiAmount.toFixed(6)));

    assert.strictEqual(0.444444, parseFloat((await provider.connection.getTokenAccountBalance(users[0].mintAPubkey)).value.uiAmount.toFixed(6)));
    assert.strictEqual(0.888889, parseFloat((await provider.connection.getTokenAccountBalance(users[0].mintBPubkey)).value.uiAmount.toFixed(6)));
    assert.strictEqual(0.444444, parseFloat((await provider.connection.getTokenAccountBalance(users[1].mintAPubkey)).value.uiAmount.toFixed(6)));
    assert.strictEqual(0.888889, parseFloat((await provider.connection.getTokenAccountBalance(users[1].mintBPubkey)).value.uiAmount.toFixed(6)));
    assert.strictEqual(0.111111, parseFloat((await provider.connection.getTokenAccountBalance(users[2].mintAPubkey)).value.uiAmount.toFixed(6)));
    assert.strictEqual(0.222222, parseFloat((await provider.connection.getTokenAccountBalance(users[2].mintBPubkey)).value.uiAmount.toFixed(6)));
  });

  it('waits', async () => {
    await wait(2);
  });

  it('Users tries to close staking account', async () => {
    try {
      await users[0].closeUser();
      assert.fail("did not fail closing active staking account");
    } catch (e) { }
  });

  it('Users claim after end of fund', async () => {
    await claimForUsers(users);
    assert.strictEqual(0.444444, parseFloat((await provider.connection.getTokenAccountBalance(users[0].mintAPubkey)).value.uiAmount.toFixed(6)));
    assert.strictEqual(0.888889, parseFloat((await provider.connection.getTokenAccountBalance(users[0].mintBPubkey)).value.uiAmount.toFixed(6)));
    assert.strictEqual(0.444444, parseFloat((await provider.connection.getTokenAccountBalance(users[1].mintAPubkey)).value.uiAmount.toFixed(6)));
    assert.strictEqual(0.888889, parseFloat((await provider.connection.getTokenAccountBalance(users[1].mintBPubkey)).value.uiAmount.toFixed(6)));
    assert.strictEqual(0.111111, parseFloat((await provider.connection.getTokenAccountBalance(users[2].mintAPubkey)).value.uiAmount.toFixed(6)));
    assert.strictEqual(0.222222, parseFloat((await provider.connection.getTokenAccountBalance(users[2].mintBPubkey)).value.uiAmount.toFixed(6)));
  });

  it('Funder funds the pool again', async () => {
      await funders[0].fund(1_000_000_000, 1_000_000_000);
  });

  it('waits', async () => {
    await wait(5);
  });

  it('Funder funds the pool during emissions', async () => {
      await funders[0].fund(30_000_000_000, 50_000_000_000);
  });

  it('waits', async () => {
    await wait(6);
  });

  let oldValA;
  let oldValB;

  it('Users claim at original end of fund', async () => {
    await claimForUsers(users);
    //rewards remain
    assert(0 < parseFloat((await provider.connection.getTokenAccountBalance(funders[0].admin.mintAVault)).value.uiAmount.toFixed(6)));
    assert(0 < parseFloat((await provider.connection.getTokenAccountBalance(funders[0].admin.mintBVault)).value.uiAmount.toFixed(6)));

    oldValA = parseFloat((await provider.connection.getTokenAccountBalance(users[0].mintAPubkey)).value.uiAmount.toFixed(6));
    oldValB = parseFloat((await provider.connection.getTokenAccountBalance(users[0].mintBPubkey)).value.uiAmount.toFixed(6));
  });

  it('waits', async () => {
    await wait(5);
  });

  let newValA;
  let newValB;

  it('Users claim at proper new end of fund', async () => {
    await claimForUsers(users);
    //no rewards remain
    assert.strictEqual(0, parseFloat((await provider.connection.getTokenAccountBalance(funders[0].admin.mintAVault)).value.uiAmount.toFixed(6)));
    assert.strictEqual(0, parseFloat((await provider.connection.getTokenAccountBalance(funders[0].admin.mintBVault)).value.uiAmount.toFixed(6)));

    newValA = parseFloat((await provider.connection.getTokenAccountBalance(users[0].mintAPubkey)).value.uiAmount.toFixed(6));
    newValB = parseFloat((await provider.connection.getTokenAccountBalance(users[0].mintBPubkey)).value.uiAmount.toFixed(6));
    assert(oldValA < newValA);
    assert(oldValB < newValB);
  });

  it('Funder funds the pool again', async () => {
      await funders[0].fund(1_000_000_000, 1_000_000_000);
  });

  it('waits', async () => {
    await wait(7);
  });

  it('Welcome user 4 to the pool in last 3 seconds', async () => {
      await users[3].stakeTokens(2_000_000_000);
  });

  it('waits', async () => {
    await wait(4);
  });

  it('Users claim, new user should have small amount', async () => {
    await claimForUsers(users);
    //users got a smidge less than they would have had user 4 not spoiled the fun
    assert(0.43 > parseFloat((await provider.connection.getTokenAccountBalance(users[0].mintAPubkey)).value.uiAmount.toFixed(6))
                      - newValA); //newValA was what they had after last round of payments; 0.4444 is what would have been if user 4 didnt join
    let user4Amount = parseFloat((await provider.connection.getTokenAccountBalance(users[3].mintAPubkey)).value.uiAmount.toFixed(6));                      
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

});  

async function wait(seconds) {
  while(seconds > 0) {
    console.log("countdown " + seconds--);
    await new Promise(a=>setTimeout(a, 1000));
  }
  console.log("wait over");
}