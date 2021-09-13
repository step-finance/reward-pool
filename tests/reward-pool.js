const assert = require("assert");
const anchor = require('@project-serum/anchor');
const serumCmn = require("@project-serum/common");
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const utils = require("./utils");
const { User, claimForUsers } = require("./user");

const lastTimeRewardApplicable = (pool) => {
  return new anchor.BN(Math.min(Date.now() / 1000, pool.rewardDurationEnd));
}

const rewardPerToken = (pool, rewardXPerTokenStored, rewardXRate, totalStaked, rewardDecimals) => {
  if (totalStaked === 0) {
    return rewardPerTokenAStored;
  }

  return rewardXPerTokenStored.add(
    (lastTimeRewardApplicable(pool)
      .sub(pool.lastUpdateTime))
      .mul(rewardXRate)
      .mul(new anchor.BN(10).pow(rewardDecimals))
      .div(totalStaked)
  );
}

const earned = (stakedBalance, rewardPerToken, userRewardPerTokenXPaid, rewardXEarned, rewardDecimals) => {
  return stakedBalance
    .mul(rewardPerToken.sub(userRewardPerTokenXPaid))
    .div(new anchor.BN(10).pow(rewardDecimals))
    .add(rewardXEarned);
}

async function wait(seconds) {
  while(seconds > 0) {
    console.log("countdown " + seconds--);
    await new Promise(a=>setTimeout(a, 1000));
  }
  console.log("wait over");
}

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

  it('Some users stake some tokens', async () => {

    await Promise.all([
      users[0].stakeTokens(2_000_000_000),
      users[1].stakeTokens(2_000_000_000),
      users[2].stakeTokens(500_000_000),
    ]);
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
  it('Funder funds the pools', async () => {
      await funders[0].fund(1_000_000_000, 2_000_000_000);
  });

  it('User 5 snipes', async () => {
    //user 5 is a bitch and immediately hops in, claims, and leaves
    await users[4].snipe(2_000_000_000);
  });

  it('waits', async () => {
    await wait(5);
  });

  it('User 2 claims halfway through', async () => {
    //user 2 claims
    await claimForUsers(users.slice(1, 2));
  });

  it('waits', async () => {
    await wait(5);
  });

  it('Users claim', async () => {
    await claimForUsers(users);
  });

  it('waits', async () => {
    await wait(10);
  });

  it('Users claim', async () => {
    await claimForUsers(users);
  });

});

/*

    at this point, the pool is exhausted:
    
1 amtA 0.297435894 amtB 0.594871788
2 amtA 0.035897448 amtB 0.071794894
3 amtA 0 amtB 0
4 amtA 0 amtB 0

(not here, but below)
5 amtA 0.666666658 amtB 1.333333318
    */


  

  //now is still users stakes: 2_000_000_000, 2_000_000_000, 500_000_000, 0, 0
/*
  it('user 2 unstakes, waits, and restakes', async () => {
    await users[1].unstakeTokens(2_000_000_000);

    await wait(6);

    await users[1].stakeTokens(2_000_000_000);
    await claimForUsers(users);
  });

  it('user 5 stakes', async () => {
    await wait(6);

    await claimForUsers(users);
  });

});
*/
/*
describe('Simple Reward Pool', () => {

  // represents our funder who is setting up a reward pool
  const funderKp = new anchor.web3.Keypair();
  const funderProvider = new anchor.Provider(envProvider.connection, new anchor.Wallet(funderKp), envProvider.opts);

  // represents our user who has come to reap rewards
  const userKp = new anchor.web3.Keypair();
  const userProvider = new anchor.Provider(envProvider.connection, new anchor.Wallet(userKp), envProvider.opts);

  let stakingMint = null;
  let stakingMintVault = null;
  let mintA = null;
  let mintAVault = null;
  let mintB = null;
  let mintBVault = null;

  const pool = new anchor.web3.Account();;
  const rewardDuration = new anchor.BN(30);
  let poolSigner = null;
  let nonce = null;
  let rewardPoolMint = null;

  let userStakeToken = null;

  it("Initialize actors", async () => {
    setProvider(envProvider);
    await utils.sendLamports(provider, funderProvider.wallet.publicKey, 3_000_000_000);
    await utils.sendLamports(provider, userProvider.wallet.publicKey, 3_000_000_000);

    //these mints are ecosystem mints not owned
    //by funder or user
    mintA = await utils.createMint(provider, 9);
    mintB = await utils.createMint(provider, 9);
    stakingMint = await utils.createMint(provider, 9);

    //give our user some of the token to stake
    userStakeToken = await stakingMint.createAccount(userProvider.wallet.publicKey);
    stakingMint.mintTo(
      userStakeToken,
      provider.wallet.publicKey,
      [],
      1_000_000_000
    );

  });
  it("Create pool accounts", async () => {
    setProvider(funderProvider);

    const [
      _poolSigner,
      _nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
      [pool.publicKey.toBuffer()],
      program.programId
    );
    poolSigner = _poolSigner;
    nonce = _nonce;
    rewardPoolMint = await Token.createMint(
      provider.connection,
      provider.wallet.payer,
      poolSigner,
      null,
      9,
      TOKEN_PROGRAM_ID
    );

    stakingMintVault = await stakingMint.createAccount(poolSigner);
    mintAVault = await mintA.createAccount(poolSigner);
    mintBVault = await mintB.createAccount(poolSigner);
  });

  it("Initializes the pool", async () => {
    setProvider(funderProvider);

    let tx = await program.rpc.initialize(
      provider.wallet.publicKey,
      nonce,
      stakingMint.publicKey,
      stakingMintVault,
      mintA.publicKey,
      mintAVault,
      mintB.publicKey,
      mintBVault,
      rewardDuration,
      {
        accounts: {
          pool: pool.publicKey,
          rewardPoolMint: rewardPoolMint.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [pool],
        instructions: [
          await program.account.pool.createInstruction(pool),
        ],
      }
    );

    poolAccount = await program.account.pool.fetch(pool.publicKey);

    assert.ok(poolAccount.authority.equals(provider.wallet.publicKey));
    assert.equal(poolAccount.nonce, nonce);
    assert.ok(poolAccount.stakingMint.equals(stakingMint.publicKey));
    assert.ok(poolAccount.rewardAMint.equals(mintA.publicKey));
    assert.ok(poolAccount.rewardBMint.equals(mintB.publicKey));
    assert.ok(poolAccount.rewardPoolMint.equals(rewardPoolMint.publicKey));
    assert.ok(poolAccount.rewardDuration.eq(rewardDuration));
  });

  let userAccount = null;
  let userAccountMeta = null;
  let userNonce = null;
  let rewardPoolTokenAccount = null;

  it("Creates a user", async () => {
    setProvider(userProvider);

    const [
      _userAccount,
      _userNonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
      [provider.wallet.publicKey.toBuffer(), pool.publicKey.toBuffer()],
      program.programId
    );
    userAccount = _userAccount;
    userNonce = _userNonce;

    rewardPoolTokenAccount = await rewardPoolMint.createAccount(userAccount);

    const tx = program.transaction.createUser(userNonce, {
      accounts: {
        pool: pool.publicKey,
        user: userAccount,
        owner: provider.wallet.publicKey,
        rewardPoolToken: rewardPoolTokenAccount,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      }
    });

    await provider.send(tx);

    userAccountMeta = await program.account.user.fetch(userAccount);

    assert.ok(userAccountMeta.pool.equals(pool.publicKey));
    assert.ok(userAccountMeta.owner.equals(provider.wallet.publicKey));
    assert.ok(userAccountMeta.rewardPoolToken.equals(rewardPoolTokenAccount));
  });

  it("Stake tokens in the pool", async () => {
    setProvider(userProvider);

    const stakeAmount = new anchor.BN(1_000_000_000);
    await program.rpc.stake(
      stakeAmount,
      {
      accounts: {
        // Stake instance.
        pool: pool.publicKey,
        rewardPoolMint: rewardPoolMint.publicKey,
        rewardAMint: mintA.publicKey,
        rewardBMint: mintB.publicKey,
        stakingVault: stakingMintVault,
        // User.
        user: userAccount,
        owner: provider.wallet.publicKey,
        rewardPoolToken: rewardPoolTokenAccount,
        stakeFromAccount: userStakeToken,
        // Program signers.
        poolSigner,
        // Misc.
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });

    const userTokenMeta = await serumCmn.getTokenAccount(
      provider,
      userStakeToken
    );
    const vault = await serumCmn.getTokenAccount(
      provider,
      stakingMintVault
    );

    assert.ok(userTokenMeta.amount.eq(new anchor.BN(0)));
    assert.ok(vault.amount.eq(new anchor.BN(1_000_000_000)));
  });

  let funderMintAAccount = null;
  let funderMintBAccount = null;

  it("Fund the pool", async () => {
    //switch to funder context to create token accounts
    setProvider(funderProvider);

    const amountA = new anchor.BN(1000000000);
    const amountB = new anchor.BN(1000000000);

    funderMintAAccount = await mintA.createAccount(provider.wallet.publicKey);
    funderMintBAccount = await mintB.createAccount(provider.wallet.publicKey);

    //switch to env context to mint (funder doesn't own these)
    setProvider(envProvider);
    // Create some rewards to fund contract with
    await mintA.mintTo(funderMintAAccount, provider.wallet.publicKey, [], amountA.toNumber());
    await mintB.mintTo(funderMintBAccount, provider.wallet.publicKey, [], amountB.toNumber());

    //back to funder to properly test
    setProvider(funderProvider);
    await program.rpc.fund(amountA, amountB, {
      accounts: {
        // Stake instance.
        pool: pool.publicKey,
        rewardPoolMint: rewardPoolMint.publicKey,
        rewardAMint: mintA.publicKey,
        rewardBMint: mintB.publicKey,
        stakingVault: stakingMintVault,
        rewardAVault: mintAVault,
        rewardBVault: mintBVault,
        funder: provider.wallet.publicKey,
        fromA: funderMintAAccount,
        fromB: funderMintBAccount,
        // Program signers.
        poolSigner,
        // Misc.
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });

    const mintAAccount = await serumCmn.getTokenAccount(
      provider,
      mintAVault
    );
    const mintBAccount = await serumCmn.getTokenAccount(
      provider,
      mintBVault
    );

    poolAccount = await program.account.pool.fetch(pool.publicKey);

    assert.ok(mintAAccount.amount.eq(amountA));
    assert.ok(mintBAccount.amount.eq(amountB));

    assert.ok(poolAccount.rewardARate.gt(new anchor.BN(0)));
    assert.ok(poolAccount.rewardBRate.gt(new anchor.BN(0)));
    assert.ok(poolAccount.lastUpdateTime.gt(new anchor.BN(0)));
    assert.ok(poolAccount.rewardDurationEnd.gt(new anchor.BN(0)));
  });

  it("Wait to accrue rewards", async () => {
    await serumCmn.sleep(32 * 1000);
  });

  let claimerMintAAccount = null;
  let claimerMintBAccount = null;

  it("User has accrued rewards", async () => {
    setProvider(envProvider);

    poolAccountMeta = await program.account.pool.fetch(pool.publicKey);
    userAccountMeta = await program.account.user.fetch(userAccount);

    claimerMintAAccount = await mintA.createAccount(userProvider.wallet.publicKey);
    claimerMintBAccount = await mintB.createAccount(userProvider.wallet.publicKey);

    setProvider(userProvider);

    const stakingVaultAccount = await serumCmn.getTokenAccount(
      provider,
      stakingMintVault
    );

    const rewardPoolTokenMeta = await serumCmn.getTokenAccount(
      provider,
      userAccountMeta.rewardPoolToken
    );

    const rewardPoolMintMeta = await serumCmn.getMintInfo(
      provider,
      rewardPoolMint.publicKey
    );

    const stakedBalance = rewardPoolTokenMeta.amount
      .mul(stakingVaultAccount.amount)
      .div(rewardPoolMintMeta.supply)

    const mintAInfo = await serumCmn.getMintInfo(
      provider,
      mintA.publicKey
    );

    const mintBInfo = await serumCmn.getMintInfo(
      provider,
      mintB.publicKey
    );

    const _rewardPerToken = rewardPerToken(
      poolAccount,
      poolAccount.rewardAPerTokenStored,
      poolAccount.rewardARate,
      stakingVaultAccount.amount,
      new anchor.BN(mintAInfo.decimals)
    );


    const earnedAmt = earned(
      stakedBalance,
      _rewardPerToken,
      userAccountMeta.rewardPerTokenAPaid,
      userAccountMeta.rewardAEarned,
      new anchor.BN(mintAInfo.decimals)
    );

    //console.log("rewardPerToken", _rewardPerToken.toNumber())
    //console.log("earnedAmt", earnedAmt.toNumber())

    assert.ok(earnedAmt.eq(new anchor.BN(999999990)));

    await program.rpc.claim({
      accounts: {
        // Stake instance.
        pool: pool.publicKey,
        rewardPoolMint: rewardPoolMint.publicKey,
        rewardAMint: mintA.publicKey,
        rewardBMint: mintB.publicKey,
        stakingVault: stakingMintVault,
        rewardAVault: mintAVault,
        rewardBVault: mintBVault,
        // User.
        user: userAccount,
        owner: provider.wallet.publicKey,
        rewardPoolToken: rewardPoolTokenAccount,
        rewardAAccount: claimerMintAAccount,
        rewardBAccount: claimerMintBAccount,
        // Program signers.
        poolSigner,
        // Misc.
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });

    const rewardAAccount = await serumCmn.getTokenAccount(
      provider,
      claimerMintAAccount
    );

    const rewardBAccount = await serumCmn.getTokenAccount(
      provider,
      claimerMintBAccount
    );

    assert.ok(rewardAAccount.amount.eq(new anchor.BN(999999990)));
    assert.ok(rewardBAccount.amount.eq(new anchor.BN(999999990)));
  });

  it("Unstake tokens from pool", async () => {
    setProvider(userProvider);

    userAccountMeta = await program.account.user.fetch(userAccount);

    let rewardPoolTokenMeta = await serumCmn.getTokenAccount(
      provider,
      userAccountMeta.rewardPoolToken
    );

    await program.rpc.unstake(rewardPoolTokenMeta.amount, {
      accounts: {
        // Stake instance.
        pool: pool.publicKey,
        rewardPoolMint: rewardPoolMint.publicKey,
        rewardAMint: mintA.publicKey,
        rewardBMint: mintB.publicKey,
        stakingVault: stakingMintVault,
        // User.
        user: userAccount,
        owner: provider.wallet.publicKey,
        rewardPoolToken: userAccountMeta.rewardPoolToken,
        stakeFromAccount: userStakeToken,
        // Program signers.
        poolSigner,
        // Misc.
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });

    const userTokenMeta = await serumCmn.getTokenAccount(
      provider,
      userStakeToken
    );
    const vault = await serumCmn.getTokenAccount(
      provider,
      stakingMintVault
    );

    assert.ok(userTokenMeta.amount.eq(new anchor.BN(1000000000)));
    assert.ok(vault.amount.eq(new anchor.BN(0)));
  });
});
*/