import * as anchor from "@project-serum/anchor";

type BN = anchor.BN;
const BN = anchor.BN;
type PublicKey = anchor.web3.PublicKey;

export const RATE_PRECISION = new BN(1_000_000_000_000);

export class Pool {
  nonce: number;
  stakingMint: PublicKey;
  rewardMint: PublicKey;
  rewardVault: PublicKey;
  rewardDuration: BN;
  rewardEndTimestamp: BN;
  lastUpdateTime: BN;
  rewardRate: BN;
  rewardPerTokenStored: BN;
  admin: PublicKey;
  totalStaked: BN;
}
