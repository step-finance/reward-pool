import * as anchor from "@project-serum/anchor";
import { AnchorError, Program } from "@project-serum/anchor";
import { Farming } from "../../target/types/farming";

export const REWARD_DURATION = new anchor.BN(10);

export async function getPoolPda(
  program: anchor.Program<Farming>,
  stakingMint: anchor.web3.PublicKey,
  rewardAMint: anchor.web3.PublicKey,
  rewardBMint: anchor.web3.PublicKey,
  base: anchor.web3.PublicKey,
  rewardDuration?: anchor.BN
) {
  return anchor.web3.PublicKey.findProgramAddress(
    [
      rewardDuration
        ? rewardDuration.toBuffer(null, 8)
        : REWARD_DURATION.toBuffer(null, 8),
      stakingMint.toBuffer(),
      rewardAMint.toBuffer(),
      rewardBMint.toBuffer(),
      base.toBuffer(),
    ],
    program.programId
  );
}

export async function getStakingVaultPda(
  program: anchor.Program<Farming>,
  stakingMint: anchor.web3.PublicKey,
  rewardAMint: anchor.web3.PublicKey,
  rewardBMint: anchor.web3.PublicKey,
  base: anchor.web3.PublicKey,
  rewardDuration?: anchor.BN
) {
  const [poolAddress, _] = await getPoolPda(
    program,
    stakingMint,
    rewardAMint,
    rewardBMint,
    base,
    rewardDuration
  );
  return anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("staking"), poolAddress.toBuffer()],
    program.programId
  );
}

export async function getRewardAVaultPda(
  program: anchor.Program<Farming>,
  stakingMint: anchor.web3.PublicKey,
  rewardAMint: anchor.web3.PublicKey,
  rewardBMint: anchor.web3.PublicKey,
  base: anchor.web3.PublicKey,
  rewardDuration?: anchor.BN
) {
  const [poolAddress, _] = await getPoolPda(
    program,
    stakingMint,
    rewardAMint,
    rewardBMint,
    base,
    rewardDuration
  );
  return anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("reward_a"), poolAddress.toBuffer()],
    program.programId
  );
}

export async function getRewardBVaultPda(
  program: anchor.Program<Farming>,
  stakingMint: anchor.web3.PublicKey,
  rewardAMint: anchor.web3.PublicKey,
  rewardBMint: anchor.web3.PublicKey,
  base: anchor.web3.PublicKey,
  rewardDuration?: anchor.BN
) {
  const [poolAddress, _] = await getPoolPda(
    program,
    stakingMint,
    rewardAMint,
    rewardBMint,
    base,
    rewardDuration
  );
  return anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("reward_b"), poolAddress.toBuffer()],
    program.programId
  );
}

export async function getUserPda(
  program: anchor.Program<Farming>,
  poolAddress: anchor.web3.PublicKey,
  userAddress: anchor.web3.PublicKey
) {
  return anchor.web3.PublicKey.findProgramAddress(
    [userAddress.toBuffer(), poolAddress.toBuffer()],
    program.programId
  );
}
