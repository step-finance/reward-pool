import * as anchor from "@project-serum/anchor";
import {AnchorError, Program} from "@project-serum/anchor";
import { DualFarming } from "../../target/types/dual_farming";

export const REWARD_DURATION = new anchor.BN(10);

export async function getPoolPda(program: anchor.Program<DualFarming>, stakingMint: anchor.web3.PublicKey,  rewardAMint: anchor.web3.PublicKey,  rewardBMint: anchor.web3.PublicKey, base: anchor.web3.PublicKey) {
    return anchor.web3.PublicKey.findProgramAddress(
        [REWARD_DURATION.toBuffer(null, 8), stakingMint.toBuffer(), rewardAMint.toBuffer(), rewardBMint.toBuffer(), base.toBuffer()],
        program.programId
    );
}

export async function getStakingVaultPda(program: anchor.Program<DualFarming>, stakingMint: anchor.web3.PublicKey,  rewardAMint: anchor.web3.PublicKey,  rewardBMint: anchor.web3.PublicKey, base: anchor.web3.PublicKey) {
    const [poolAddress, _] = await getPoolPda(program, stakingMint, rewardAMint, rewardBMint, base);
    return anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("staking"), poolAddress.toBuffer()],
        program.programId
    );
}

export async function getRewardAVaultPda(program: anchor.Program<DualFarming>, stakingMint: anchor.web3.PublicKey,  rewardAMint: anchor.web3.PublicKey,  rewardBMint: anchor.web3.PublicKey, base: anchor.web3.PublicKey) {
    const [poolAddress, _] = await getPoolPda(program, stakingMint, rewardAMint, rewardBMint, base);
    return anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("reward_a"), poolAddress.toBuffer()],
        program.programId
    );
}

export async function getRewardBVaultPda(program: anchor.Program<DualFarming>, stakingMint: anchor.web3.PublicKey,  rewardAMint: anchor.web3.PublicKey,  rewardBMint: anchor.web3.PublicKey, base: anchor.web3.PublicKey) {
    const [poolAddress, _] = await getPoolPda(program, stakingMint, rewardAMint, rewardBMint, base);
    return anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("reward_b"), poolAddress.toBuffer()],
        program.programId
    );
}

export async function getUserPda(
    program: anchor.Program<DualFarming>,
    poolAddress: anchor.web3.PublicKey,
    userAddress: anchor.web3.PublicKey
) {
    return anchor.web3.PublicKey.findProgramAddress(
        [userAddress.toBuffer(), poolAddress.toBuffer()],
        program.programId
    );
}