import * as anchor from "@project-serum/anchor";

type BN = anchor.BN;
const BN = anchor.BN;
type PublicKey = anchor.web3.PublicKey;

export class LockedRewardTracker {
  static LOCKED_REWARD_DEGRADATION_DENOMINATOR: BN = new BN(1_000_000_000_000);
  lastUpdatedLockedReward: BN;
  lastReport: BN;
  lockedRewardDegradation: BN;
}

export class Vault {
  tokenMint: PublicKey;
  tokenVault: PublicKey;
  lpMint: PublicKey;
  base: PublicKey;
  admin: PublicKey;
  vaultBump: number;
  totalAmount: BN;
  lockedRewardTracker: LockedRewardTracker;
  funder: PublicKey;
}
