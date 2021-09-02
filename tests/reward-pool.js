const assert = require("assert");
const anchor = require('@project-serum/anchor');
const serumCmn = require("@project-serum/common");
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const utils = require("./utils");

const lastTimeRewardApplicable = (pool) => {
  return new anchor.BN(Math.min(Date.now() / 1000, pool.rewardDurationEnd));
}

const rewardPerToken = (pool, rewardXPerTokenStored, rewardXRate, totalStaked, rewardDecimals) => {
  if (totalStaked === 0) {
    return rewardPerTokenAStored;
  }

  /*console.log("rewardXPerTokenStored", rewardXPerTokenStored.toNumber())
  console.log("rewardXRate", rewardXRate.toNumber())
  console.log("totalStaked", totalStaked.toNumber())
  console.log("lastUpdateTime", pool.lastUpdateTime.toNumber())
  console.log("lastTimeRewardApplicable", lastTimeRewardApplicable(pool).toNumber())
  console.log("decimals", new anchor.BN(10).pow(rewardDecimals).toNumber())
  console.log("time since updated", (Date.now() / 1000) - pool.lastUpdateTime.toNumber())*/

  return rewardXPerTokenStored.add(
    (lastTimeRewardApplicable(pool)
        .sub(pool.lastUpdateTime))
        .mul(rewardXRate)
        .mul(new anchor.BN(10).pow(rewardDecimals))
        .div(totalStaked)
  );
}

const earned = (stakedBalance, rewardPerToken, userRewardPerTokenXPaid, rewardXEarned, rewardDecimals) => {
  
  // console.log("stakedBalance", stakedBalance.toString());
  // console.log("rewardPerToken", rewardPerToken.toString());
  // console.log("userRewardPerTokenXPaid", userRewardPerTokenXPaid);
  // console.log("rewardXEarned", rewardXEarned);
  // console.log("rewardDecimals", rewardDecimals);

  return stakedBalance
    .mul(rewardPerToken.sub(userRewardPerTokenXPaid))
    .div(new anchor.BN(10).pow(rewardDecimals))
    .add(rewardXEarned);
}

program = anchor.workspace.RewardPool;

//Read the provider from the configured environmnet.
//represents an outside actor
//owns mints out of any other actors control, provides initial $$ to others
const envProvider = anchor.Provider.env();

// represents our admin who is setting up a reward pool
const adminKp = new anchor.web3.Keypair();
const adminProvider = new anchor.Provider(envProvider.connection, new anchor.Wallet(adminKp), envProvider.opts);

// represents our user who has come to reap rewards
const userKp = new anchor.web3.Keypair();
const userProvider = new anchor.Provider(envProvider.connection, new anchor.Wallet(userKp), envProvider.opts);

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

describe('Reward Pool', () => {
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
    await utils.sendLamports(provider, adminProvider.wallet.publicKey, 3_000_000_000);
    await utils.sendLamports(provider, userProvider.wallet.publicKey, 3_000_000_000);

    //these mints are ecosystem mints not owned
    //by admin or user
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
    setProvider(adminProvider);

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
    setProvider(adminProvider);

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
    //switch to admin context to create token accounts
    setProvider(adminProvider);

    const amountA = new anchor.BN(1000000000);
    const amountB = new anchor.BN(1000000000);

    funderMintAAccount = await mintA.createAccount(provider.wallet.publicKey);
    funderMintBAccount = await mintB.createAccount(provider.wallet.publicKey);

    //switch to env context to mint (admin doesn't own these)
    setProvider(envProvider);
    // Create some rewards to fund contract with
    await mintA.mintTo(funderMintAAccount, provider.wallet.publicKey, [], amountA.toNumber());
    await mintB.mintTo(funderMintBAccount, provider.wallet.publicKey, [], amountB.toNumber());

    //back to admin to properly test
    setProvider(adminProvider);
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

  it("Can pause/unpause", async () => {
    // TODO
  });
});
