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
  return stakedBalance
    .mul(rewardPerToken.sub(userRewardPerTokenXPaid))
    .div(new anchor.BN(10).pow(rewardDecimals))
    .add(rewardXEarned);
}

describe('Reward Pool', () => {
  // Read the provider from the configured environmnet.
  const provider = anchor.Provider.env();

  // Configure the client to use the provider.
  anchor.setProvider(provider);

  const program = anchor.workspace.RewardPool;

  let stakingMint = null;
  let stakingMintVault = null;
  let mintA = null;
  let mintAVault = null;
  let mintB = null;
  let mintBVault = null;

  const pool = new anchor.web3.Account();
  const rewardDuration = new anchor.BN(30);
  let poolAccount = null;
  let poolSigner = null;
  let nonce = null;
  let poolMint = null;

  it("Create pool accounts", async () => {
    const [
      _poolSigner,
      _nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
      [pool.publicKey.toBuffer()],
      program.programId
    );
    poolSigner = _poolSigner;
    nonce = _nonce;
    poolMint = await Token.createMint(
      provider.connection,
      provider.wallet.payer,
      poolSigner,
      null,
      9,
      TOKEN_PROGRAM_ID
    );

    const [_stakingMint, _stakingMintVault] = await utils.createMintAndVault(
      provider,
      poolSigner,
      9
    );
    stakingMint = _stakingMint;
    stakingMintVault = _stakingMintVault;

    const [_mintA, _mintAVault] = await utils.createMintAndVault(
      provider,
      poolSigner,
      9
    );
    mintA = _mintA;
    mintAVault = _mintAVault;

    const [_mintB, _mintBVault] = await utils.createMintAndVault(
      provider,
      poolSigner,
      9
    );
    mintB = _mintB;
    mintBVault = _mintBVault;
  });

  it("Initializes the pool", async () => {
    await program.rpc.initialize(
      provider.wallet.publicKey,
      nonce,
      stakingMint.publicKey,
      stakingMintVault.publicKey,
      mintA.publicKey,
      mintAVault,
      mintB.publicKey,
      mintBVault,
      rewardDuration,
      {
        accounts: {
          pool: pool.publicKey,
          poolMint: poolMint.publicKey,
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
    assert.ok(poolAccount.poolMint.equals(poolMint.publicKey));
    assert.ok(poolAccount.rewardDuration.eq(rewardDuration));
  });

  const user = new anchor.web3.Account();
  let userAccount = null;
  let userSigner = null;
  let balances = null;

  it("Creates a user", async () => {
    const [
      _userSigner,
      nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
      [pool.publicKey.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );
    userSigner = _userSigner;

    const _balances = await utils.createUserTokenAccounts(
      userSigner,
      poolMint,
      stakingMint
    );

    balances = _balances;

    const tx = program.transaction.createUser(nonce, {
      accounts: {
        pool: pool.publicKey,
        user: user.publicKey,
        owner: provider.wallet.publicKey,
        userSigner,
        lp: balances.spt,
        stakeFromAccount: balances.vault,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      instructions: [await program.account.user.createInstruction(user)],
    });

    // Give user some tokens to stake
    await stakingMint.mintTo(balances.vault, provider.wallet.publicKey, [], 1000000000);

    const signers = [user, provider.wallet.payer];
    const allTxs = [{ tx, signers }];
    let txSigs = await provider.sendAll(allTxs);

    userAccount = await program.account.user.fetch(user.publicKey);

    const userVault = await serumCmn.getTokenAccount(
      provider,
      balances.vault
    );

    assert.ok(userAccount.pool.equals(pool.publicKey));
    assert.ok(userAccount.owner.equals(provider.wallet.publicKey));
    assert.ok(userAccount.lp.equals(balances.spt));
    assert.ok(userAccount.stakeFromAccount.equals(balances.vault));
    assert.ok(userVault.amount.eq(new anchor.BN(1000000000)));
  });


  it("Stake tokens in the pool", async () => {
    const stakeAmount = new anchor.BN(1000000000);
    await program.rpc.stake(stakeAmount, {
      accounts: {
        // Stake instance.
        pool: pool.publicKey,
        poolMint: poolMint.publicKey,
        rewardAMint: mintA.publicKey,
        rewardBMint: mintB.publicKey,
        stakingVault: stakingMintVault,
        // User.
        user: user.publicKey,
        owner: provider.wallet.publicKey,
        lp: balances.spt,
        stakeFromAccount: balances.vault,
        // Program signers.
        userSigner,
        poolSigner,
        // Misc.
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });

    const vault = await serumCmn.getTokenAccount(
      provider,
      userAccount.stakeFromAccount
    );
    const spt = await serumCmn.getTokenAccount(
      provider,
      userAccount.lp
    );

    assert.ok(vault.amount.eq(new anchor.BN(0)));
    assert.ok(spt.amount.eq(new anchor.BN(1000000000)));
  });

  let funderMintAAccount = null;
  let funderMintBAccount = null;

  it("Fund the pool", async () => {
    const amountA = new anchor.BN(1000000000);
    const amountB = new anchor.BN(1000000000);

    funderMintAAccount = await mintA.createAccount(provider.wallet.publicKey);
    funderMintBAccount = await mintB.createAccount(provider.wallet.publicKey);

    // Create some rewards to fund contract with
    await mintA.mintTo(funderMintAAccount, provider.wallet.publicKey, [], amountA.toNumber());
    await mintB.mintTo(funderMintBAccount, provider.wallet.publicKey, [], amountB.toNumber());

    await program.rpc.fund(amountA, amountB, {
      accounts: {
        // Stake instance.
        pool: pool.publicKey,
        poolMint: poolMint.publicKey,
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
    poolAccount = await program.account.pool.fetch(pool.publicKey);
    userAccount = await program.account.user.fetch(user.publicKey);

    claimerMintAAccount = await mintA.createAccount(provider.wallet.publicKey);
    claimerMintBAccount = await mintB.createAccount(provider.wallet.publicKey);

    const stakingVaultAccount = await serumCmn.getTokenAccount(
      provider,
      stakingMintVault
    );

    const spt = await serumCmn.getTokenAccount(
      provider,
      userAccount.lp
    );

    const lp = await serumCmn.getMintInfo(
      provider,
      poolMint.publicKey
    );

    const stakedBalance = spt.amount
      .mul(stakingVaultAccount.amount)
      .div(lp.supply)

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
      userAccount.rewardPerTokenAPaid,
      userAccount.rewardAEarned,
      new anchor.BN(mintAInfo.decimals)
    );

    //console.log("rewardPerToken", _rewardPerToken.toNumber())
    //console.log("earnedAmt", earnedAmt.toNumber())

    assert.ok(earnedAmt.eq(new anchor.BN(999999990)));

    await program.rpc.claim({
      accounts: {
        // Stake instance.
        pool: pool.publicKey,
        poolMint: poolMint.publicKey,
        rewardAMint: mintA.publicKey,
        rewardBMint: mintB.publicKey,
        stakingVault: stakingMintVault,
        rewardAVault: mintAVault,
        rewardBVault: mintBVault,
        // User.
        user: user.publicKey,
        owner: provider.wallet.publicKey,
        lp: balances.spt,
        stakeFromAccount: balances.vault,
        rewardAAccount: claimerMintAAccount,
        rewardBAccount: claimerMintBAccount,
        // Program signers.
        userSigner,
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
    let spt = await serumCmn.getTokenAccount(
      provider,
      userAccount.lp
    );

    await program.rpc.unstake(spt.amount, {
      accounts: {
        // Stake instance.
        pool: pool.publicKey,
        poolMint: poolMint.publicKey,
        rewardAMint: mintA.publicKey,
        rewardBMint: mintB.publicKey,
        stakingVault: stakingMintVault,
        // User.
        user: user.publicKey,
        owner: provider.wallet.publicKey,
        lp: balances.spt,
        stakeFromAccount: balances.vault,
        // Program signers.
        userSigner,
        poolSigner,
        // Misc.
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });

    const vault = await serumCmn.getTokenAccount(
      provider,
      userAccount.stakeFromAccount
    );
    spt = await serumCmn.getTokenAccount(
      provider,
      userAccount.lp
    );

    assert.ok(vault.amount.eq(new anchor.BN(1000000000)));
    assert.ok(spt.amount.eq(new anchor.BN(0)));
  });

  it("Can pause/unpause", async () => {
    // TODO
  });

});
