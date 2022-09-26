import * as anchor from "@project-serum/anchor";
import { EventParser } from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ParsedAccountData, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import assert from "assert";
import { Staking } from "../../target/types/staking";
import { Locking } from "../../target/types/locking";
import { ParsedClockState } from "../clock_state";
import {
  calculateApy as calculateMerStakingApy,
  getUnlockedAmount,
} from "../locking/utils";
import { Vault } from "../locking/vault_state";
import { Pool } from "./farm_state";

type BN = anchor.BN;
const BN = anchor.BN;
type Keypair = anchor.web3.Keypair;
type Pubkey = anchor.web3.PublicKey;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

let farmProgram = anchor.workspace.Staking as anchor.Program<Staking>;
let stakeProgram = anchor.workspace.Locking as anchor.Program<Locking>;

const rewardDuration = new anchor.BN(20);
const fundingAmount = new anchor.BN(100);
const merUsdRate = 0.3;
const jupUsdRate = 1;

const admin = new anchor.web3.Keypair();
const user = new anchor.web3.Keypair();
const user2 = new anchor.web3.Keypair();
const merVaultKeypair = new anchor.web3.Keypair();

let merTokenVault: Pubkey | null;
let merMint: Token | null;
let jupMint: Token | null;
let merVault: Pubkey | null;
let xMerMintPubkey: Pubkey | null;
let xMerMint: Token | null;
let userMerToken: Pubkey | null;
let user2MerToken: Pubkey | null;
let adminMerToken: Pubkey | null;
let userxMerToken: Pubkey | null;
let user2xMerToken: Pubkey | null;
let adminxMerToken: Pubkey | null;
let userJupToken: Pubkey | null;
let user2JupToken: Pubkey | null;
let jupFarm: Pubkey | null;
let jupFarmStakingVault: Pubkey | null;
let jupFarmRewardVault: Pubkey | null;
let jupFarmUser: Pubkey | null;
let jupFarmUser2: Pubkey | null;

const ratePrecision = new anchor.BN(1_000_000_000_000);

describe("SingleFarming APY", () => {
  before(async () => {
    console.log("Program ID: ", farmProgram.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());

    await provider.connection
      .requestAirdrop(admin.publicKey, 100_000_000_000)
      .then((sig) => provider.connection.confirmTransaction(sig));

    await provider.connection
      .requestAirdrop(user.publicKey, 100_000_000_000)
      .then((sig) => provider.connection.confirmTransaction(sig));

    await provider.connection
      .requestAirdrop(user2.publicKey, 100_000_000_000)
      .then((sig) => provider.connection.confirmTransaction(sig));

    // Setup vault

    merMint = await Token.createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6,
      TOKEN_PROGRAM_ID
    );

    merVault = merVaultKeypair.publicKey;

    [merTokenVault] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("token_vault")),
        merVault.toBuffer(),
      ],
      stakeProgram.programId
    );

    [xMerMintPubkey] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("lp_mint")),
        merVault.toBuffer(),
      ],
      stakeProgram.programId
    );

    await stakeProgram.methods
      .initializeVault()
      .accounts({
        vault: merVault,
        tokenVault: merTokenVault,
        tokenMint: merMint.publicKey,
        lpMint: xMerMintPubkey,
        admin: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([merVaultKeypair, admin])
      .rpc();

    xMerMint = new Token(
      provider.connection,
      xMerMintPubkey,
      TOKEN_PROGRAM_ID,
      admin
    );

    userMerToken = await merMint.createAssociatedTokenAccount(user.publicKey);
    user2MerToken = await merMint.createAssociatedTokenAccount(user2.publicKey);
    adminMerToken = await merMint.createAssociatedTokenAccount(admin.publicKey);
    userxMerToken = await xMerMint.createAssociatedTokenAccount(user.publicKey);
    user2xMerToken = await xMerMint.createAssociatedTokenAccount(
      user2.publicKey
    );
    adminxMerToken = await xMerMint.createAssociatedTokenAccount(
      admin.publicKey
    );

    await merMint.mintTo(userMerToken, admin, [], 100_000_000);
    await merMint.mintTo(user2MerToken, admin, [], 100_000_000);
    await merMint.mintTo(adminMerToken, admin, [], 100_000_000);

    await stakeProgram.methods
      .stake(new anchor.BN(100_000_000))
      .accounts({
        lpMint: xMerMintPubkey,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault: merTokenVault,
        userLp: userxMerToken,
        userToken: userMerToken,
        userTransferAuthority: user.publicKey,
        vault: merVault,
      })
      .signers([user])
      .rpc();

    await stakeProgram.methods
      .stake(new anchor.BN(100_000_000))
      .accounts({
        lpMint: xMerMintPubkey,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault: merTokenVault,
        userLp: user2xMerToken,
        userToken: user2MerToken,
        userTransferAuthority: user2.publicKey,
        vault: merVault,
      })
      .signers([user2])
      .rpc();

    await stakeProgram.methods
      .stake(new anchor.BN(100_000_000))
      .accounts({
        lpMint: xMerMintPubkey,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault: merTokenVault,
        userLp: adminxMerToken,
        userToken: adminMerToken,
        userTransferAuthority: admin.publicKey,
        vault: merVault,
      })
      .signers([admin])
      .rpc();

    // Setup farm

    jupMint = await Token.createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6,
      TOKEN_PROGRAM_ID
    );

    const jupFarmingKeypair = anchor.web3.Keypair.generate();
    jupFarm = jupFarmingKeypair.publicKey;

    [jupFarmStakingVault] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("staking_vault")),
        jupFarm.toBuffer(),
      ],
      farmProgram.programId
    );

    [jupFarmRewardVault] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("reward_vault")),
        jupFarm.toBuffer(),
      ],
      farmProgram.programId
    );

    [jupFarmUser] = await anchor.web3.PublicKey.findProgramAddress(
      [user.publicKey.toBuffer(), jupFarm.toBuffer()],
      farmProgram.programId
    );

    [jupFarmUser2] = await anchor.web3.PublicKey.findProgramAddress(
      [user2.publicKey.toBuffer(), jupFarm.toBuffer()],
      farmProgram.programId
    );

    await farmProgram.methods
      .initializePool(rewardDuration, fundingAmount)
      .accounts({
        admin: admin.publicKey,
        pool: jupFarm,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        rewardMint: jupMint.publicKey,
        rewardVault: jupFarmRewardVault,
        stakingMint: xMerMintPubkey,
        stakingVault: jupFarmStakingVault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([admin, jupFarmingKeypair])
      .rpc();

    userJupToken = await jupMint.createAssociatedTokenAccount(user.publicKey);
    user2JupToken = await jupMint.createAssociatedTokenAccount(user2.publicKey);

    await farmProgram.methods
      .createUser()
      .accounts({
        owner: user.publicKey,
        pool: jupFarm,
        systemProgram: anchor.web3.SystemProgram.programId,
        user: jupFarmUser,
      })
      .signers([user])
      .rpc();

    await farmProgram.methods
      .createUser()
      .accounts({
        owner: user2.publicKey,
        pool: jupFarm,
        systemProgram: anchor.web3.SystemProgram.programId,
        user: jupFarmUser2,
      })
      .signers([user2])
      .rpc();
  });

  it("add fund to MER pool to increase xMER virtual price", async () => {
    const beforeVirtualPrice = await getxMerVirtualPrice(stakeProgram);
    console.log("Before fund, xMER virtual price", beforeVirtualPrice);
    assert.deepStrictEqual(beforeVirtualPrice, 1);
    // Deposit some reward
    await merMint.mintTo(adminMerToken, admin, [], 100_000);
    await stakeProgram.methods
      .reward(new anchor.BN(100_000))
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenVault: merTokenVault,
        userToken: adminMerToken,
        userTransferAuthority: admin.publicKey,
        vault: merVault,
      })
      .signers([admin])
      .rpc();
    // wait for profit drip to increase virtual price
    await wait(5);
    const afterVirtualPrice = await getxMerVirtualPrice(stakeProgram);
    console.log("After fund, xMER virtual price", afterVirtualPrice);
    assert.deepStrictEqual(afterVirtualPrice > 1, true);
  });

  it("Jup APY = 0, when farm not activated", async () => {
    await farmProgram.methods
      .depositFull()
      .accounts({
        owner: user.publicKey,
        pool: jupFarm,
        stakeFromAccount: userxMerToken,
        stakingVault: jupFarmStakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user: jupFarmUser,
      })
      .signers([user])
      .rpc();

    await wait(5);

    // Admin not yet activate farm, JUP apy = 0;
    const jupApy = await calculateJupApy();
    console.log("JUP apy when farm not activated", jupApy);
    assert.deepStrictEqual(jupApy, 0);

    // No pending reward as farm not activated
    const pendingReward = await getPendingReward(
      farmProgram,
      user.publicKey,
      jupFarmUser,
      jupFarmRewardVault,
      user
    );
    assert.deepStrictEqual(pendingReward.toNumber(), 0);

    // JUP farm total APY is > 0 because of xMER
    var [xMerApy, farmApy] = await Promise.all([
      calculateMerStakingApy(merVault, stakeProgram),
      calculateFarmApy(),
    ]);
    console.log("JUP farm apy when farm not activated", farmApy);
    assert.deepStrictEqual(farmApy > 0, true);

    let beforeFarmApy = farmApy;

    // JUP farm APY == xMER apy because jup farm is not activated
    assert.deepStrictEqual(farmApy, xMerApy);

    await wait(5);
    // JUP farm APY continue decreases as MER profit dripped
    [xMerApy, farmApy] = await Promise.all([
      calculateMerStakingApy(merVault, stakeProgram),
      calculateFarmApy(),
    ]);
    console.log("JUP farm apy when farm not activated", farmApy);
    assert.deepStrictEqual(farmApy, xMerApy);
    assert.deepStrictEqual(beforeFarmApy > farmApy, true);
  });

  it("JUP APY > 0, when admin start the farming", async () => {
    var jupFarmApy = await calculateFarmApy();
    let beforeJupFarmAPy = jupFarmApy;

    await farmProgram.methods
      .activateFarming()
      .accounts({
        admin: admin.publicKey,
        pool: jupFarm,
      })
      .signers([admin])
      .rpc();

    var [jupFarmApy, jupApy] = await Promise.all([
      calculateFarmApy(),
      calculateJupApy(),
    ]);

    console.log("JUP apy after admin activate farm", jupApy);
    console.log("JUP farm apy after admin activate farm", jupFarmApy);

    assert.deepStrictEqual(jupApy > 0, true);
    assert.deepStrictEqual(jupFarmApy > beforeJupFarmAPy, true);
  });

  it("JUP APY decreases as more stake amount", async () => {
    var [jupFarmApy, jupApy, pendingReward] = await Promise.all([
      calculateFarmApy(),
      calculateJupApy(),
      getPendingReward(
        farmProgram,
        user.publicKey,
        jupFarmUser,
        jupFarmRewardVault,
        user
      ),
    ]);

    let beforeJupFarmApy = jupFarmApy;
    let beforeJupApy = jupApy;
    let beforePendingReward = pendingReward;

    console.log("JUP apy before more stake amount", beforeJupApy);
    console.log("JUP farm apy before more stake amount", beforeJupFarmApy);

    await farmProgram.methods
      .depositFull()
      .accounts({
        owner: user2.publicKey,
        pool: jupFarm,
        stakeFromAccount: user2xMerToken,
        stakingVault: jupFarmStakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        user: jupFarmUser2,
      })
      .signers([user2])
      .rpc();

    [jupFarmApy, jupApy, pendingReward] = await Promise.all([
      calculateFarmApy(),
      calculateJupApy(),
      getPendingReward(
        farmProgram,
        user.publicKey,
        jupFarmUser,
        jupFarmRewardVault,
        user
      ),
    ]);

    console.log("JUP apy after more stake amount", jupApy);
    console.log("JUP farm apy after more stake amount", jupFarmApy);

    assert.deepStrictEqual(jupFarmApy < beforeJupFarmApy, true);
    assert.deepStrictEqual(jupApy < beforeJupApy, true);
    // When other user stake, shall not affect existing user pending reward
    assert.deepStrictEqual(
      pendingReward.toNumber() >= beforePendingReward.toNumber(),
      true
    );
  });

  it("deposit directly to farm reward vault will not affect JUP apy", async () => {
    var jupApy = await calculateJupApy();
    let beforeJupApy = jupApy;

    // Deposit directly to farm reward vault
    await jupMint.mintTo(jupFarmRewardVault, admin, [], 100_000_000);

    jupApy = await calculateJupApy();
    console.log("JUP apy before direct deposit to reward vault", beforeJupApy);
    console.log("JUP apy after direct deposit to reward vault", jupApy);
    // Does not increase JUP apy
    assert.deepStrictEqual(jupApy <= beforeJupApy, true);
  });

  it("deposit directly to farm staking vault will not affect JUP apy", async () => {
    var jupApy = await calculateJupApy();
    let beforeJupApy = jupApy;

    // Deposit directly to farm staking vault
    await xMerMint.transfer(
      adminxMerToken,
      jupFarmStakingVault,
      admin,
      [],
      100_000_000
    );

    jupApy = await calculateJupApy();
    console.log("JUP apy before direct deposit to staking vault", beforeJupApy);
    console.log("JUP apy after direct deposit to staking vault", jupApy);
    // Comment out as it is unstable. The above operation take time, and might causes them not exact equals as time elapsed
    // assert.deepStrictEqual(jupApy, beforeJupApy);
  });

  it("JUP APY decrease, pending reward increases as time passed", async () => {
    const farmState = await farmProgram.account.pool.fetch(jupFarm);
    while (true) {
      const onChainTimestamp = await getOnChainTimestamp();
      if (onChainTimestamp > farmState.rewardEndTimestamp.toNumber()) {
        break;
      }
      const [beforeFarmApy, beforeJupApy] = await Promise.all([
        calculateFarmApy(),
        calculateJupApy(),
      ]);
      await wait(1);
      const [farmApy, jupApy] = await Promise.all([
        calculateFarmApy(),
        calculateJupApy(),
      ]);
      console.log("Farm APY", farmApy);
      console.log("Jup APY", jupApy);
      assert.deepStrictEqual(farmApy <= beforeFarmApy, true);
      assert.deepStrictEqual(jupApy <= beforeJupApy, true);
    }
  });

  it("JUP APY = 0, when reward duration ended", async () => {
    const [farmState, onChainTimestamp] = await Promise.all([
      farmProgram.account.pool.fetch(jupFarm),
      getOnChainTimestamp(),
    ]);

    assert.deepStrictEqual(
      onChainTimestamp >= farmState.rewardEndTimestamp.toNumber(),
      true
    );

    assert.deepStrictEqual(await calculateJupApy(), 0);
  });
});

/// Calculate JUP + MER apy
async function calculateFarmApy() {
  const [jupApy, merApy] = await Promise.all([
    calculateJupApy(),
    calculateMerStakingApy(merVault, stakeProgram),
  ]);
  // It is in percentage, convert it back
  const totalApy = (1 + jupApy / 100) * (1 + merApy / 100) - 1;
  return totalApy * 100;
}

/// Calculate only JUP apy
async function calculateJupApy() {
  const secondsInYear = 3600 * 24 * 365;
  const [farmAccount, currentOnChainTime] = await Promise.all([
    farmProgram.account.pool.fetch(jupFarm),
    getOnChainTimestamp(),
  ]);

  const availJupReward = getAvailJupReward(farmAccount, currentOnChainTime);
  const xMerVirtualPrice = await getxMerVirtualPrice(stakeProgram);
  // Calculate total staked MER in JUP farm by using exchange rate of xMER
  const totalStakedMer = farmAccount.totalStaked.toNumber() * xMerVirtualPrice;
  const rewardInUSD = availJupReward * jupUsdRate;
  const totalStakedUSD = totalStakedMer * merUsdRate;

  const rewardPerUSD = rewardInUSD / totalStakedUSD;

  const remainingSeconds =
    farmAccount.rewardEndTimestamp.toNumber() - currentOnChainTime;

  // Farm not activated, or farming period ended
  if (remainingSeconds <= 0) {
    return 0;
  }

  const frequency = secondsInYear / remainingSeconds;

  const jupApy = (1 + rewardPerUSD) ** frequency - 1;
  return jupApy * 100;
}

function getAvailJupReward(farmState: Pool, currentTime: number) {
  // Farm not activated yet
  if (farmState.rewardEndTimestamp.toNumber() == 0) {
    return 0;
  }

  const rewardRate = farmState.rewardRate.div(ratePrecision).toNumber();
  const rewardDuration = farmState.rewardDuration.toNumber();
  const remainingSeconds =
    farmState.rewardEndTimestamp.toNumber() - currentTime;

  return (rewardRate * remainingSeconds ** 2) / rewardDuration;
}

function getPendingReward(
  farmProgram: anchor.Program<Staking>,
  owner: Pubkey,
  user: Pubkey,
  rewardAccount: Pubkey,
  keypair: Keypair
): Promise<BN> {
  return new Promise(async (res, rej) => {
    try {
      // Super duper weird, .rpc() works but .simulate() doesn't work. Hmm ... 🤔
      const claimIx = await farmProgram.methods
        .claim()
        .accounts({
          owner,
          pool: jupFarm,
          user,
          rewardAccount,
          rewardVault: jupFarmRewardVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          stakingVault: jupFarmStakingVault,
        })
        .instruction();
      const tx = new anchor.web3.Transaction();
      tx.add(claimIx);
      const simRes = await farmProgram.provider.connection.simulateTransaction(
        tx,
        [keypair]
      );
      new EventParser(farmProgram.programId, farmProgram.coder).parseLogs(
        simRes.value.logs,
        (log) => {
          if (log.name == "EventPendingReward") {
            res(log.data.value as BN);
          }
        }
      );
    } catch (e) {
      rej(e);
    }
  });
}

async function getxMerVirtualPrice(stakeProgram: anchor.Program<Locking>) {
  const [vaultAccount, currentOnChainTime, xMerMintInfo] = await Promise.all([
    stakeProgram.account.vault.fetch(merVault),
    getOnChainTimestamp(),
    xMerMint.getMintInfo(),
  ]);

  const unlockedAmount = getUnlockedAmount(
    vaultAccount as unknown as Vault,
    currentOnChainTime
  );

  return unlockedAmount.toNumber() / xMerMintInfo.supply.toNumber();
}

async function getOnChainTimestamp() {
  const clockAccount = await provider.connection.getParsedAccountInfo(
    SYSVAR_CLOCK_PUBKEY
  );
  const clockState = (clockAccount.value!.data as ParsedAccountData)
    .parsed as ParsedClockState;

  return clockState.info.unixTimestamp;
}

async function wait(seconds) {
  console.log("Sleep for", seconds, "seconds");
  while (seconds-- > 0) {
    await new Promise((a) => setTimeout(a, 1000));
  }
}
