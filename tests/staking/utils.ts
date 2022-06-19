import * as anchor from "@project-serum/anchor";
import { ParsedAccountData, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { Staking } from "../../target/types/staking";
import { ParsedClockState } from "../clock_state";
import { LockedRewardTracker, Vault } from "./vault_state";

type BN = anchor.BN;
const BN = anchor.BN;
type Pubkey = anchor.web3.PublicKey;

export function getUnlockedAmount(vaultState: Vault, currentTime: number): BN {
  return vaultState.totalAmount.sub(
    calculateLockedProfit(vaultState, currentTime)
  );
}

export function calculateLockedProfit(
  vaultState: Vault,
  currentTime: number
): BN {
  let currentTimeBN = new BN(currentTime);
  const duration = currentTimeBN.sub(vaultState.lockedRewardTracker.lastReport);
  const lockedProfitDegradation =
    vaultState.lockedRewardTracker.lockedRewardDegradation;
  const lockedFundRatio = duration.mul(lockedProfitDegradation);
  if (
    lockedFundRatio.gt(
      LockedRewardTracker.LOCKED_REWARD_DEGRADATION_DENOMINATOR
    )
  ) {
    return new BN(0);
  }
  const lockedProfit = vaultState.lockedRewardTracker.lastUpdatedLockedReward;
  return lockedProfit
    .mul(
      LockedRewardTracker.LOCKED_REWARD_DEGRADATION_DENOMINATOR.sub(
        lockedFundRatio
      )
    )
    .div(LockedRewardTracker.LOCKED_REWARD_DEGRADATION_DENOMINATOR);
}

export async function calculateApy(
  vaultAddress: Pubkey,
  program: anchor.Program<Staking>
) {
  const secondsInYear: number = 3600 * 24 * 365;
  const [clock, vaultState] = await Promise.all([
    program.provider.connection.getParsedAccountInfo(SYSVAR_CLOCK_PUBKEY),
    program.account.vault.fetch(vaultAddress),
  ]);
  const clockState = (clock.value.data as ParsedAccountData)
    .parsed as ParsedClockState;
  const currentTime = clockState.info.unixTimestamp;
  const secondsInFullDrip =
    LockedRewardTracker.LOCKED_REWARD_DEGRADATION_DENOMINATOR.div(
      vaultState.lockedRewardTracker.lockedRewardDegradation
    ).toNumber();
  const frequency = secondsInYear / secondsInFullDrip;
  let lockedProfit = calculateLockedProfit(
    vaultState as unknown as Vault,
    currentTime
  );
  let unlockedAmount = getUnlockedAmount(
    vaultState as unknown as Vault,
    currentTime
  );
  let rewardPerToken = lockedProfit.toNumber() / unlockedAmount.toNumber();
  let apy = (1 + rewardPerToken) ** frequency - 1;
  return apy * 100;
}
