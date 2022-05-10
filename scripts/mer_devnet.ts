import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Token, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { MerStaking } from "../target/types/mer_staking";
import fs from 'fs';
import os from 'os';
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet';

const homedir = os.homedir();

const merMint = new anchor.web3.PublicKey("34FtphdPUicFi8wEskVtRrodHFozQkFjn3jovzChTBAQ"); // devnet REM (MER devnet equivalent)

// Read from keypair or hardcoded pk
const programKeypair = keypairFromFile("./target/deploy/mer_staking-keypair.json");
const programId = programKeypair.publicKey;

const admin = keypairFromFile(homedir + "/.config/solana/id.json");
const wallet = new NodeWallet(admin);

const connection = new anchor.web3.Connection(anchor.web3.clusterApiUrl('devnet'));
const provider = new anchor.Provider(connection, wallet, anchor.Provider.defaultOptions());

const idl = JSON.parse(fs.readFileSync("./target/idl/mer_staking.json", "utf8"));
const program = new anchor.Program<MerStaking>(idl, programId, provider);

var vaultMer, vault, nonce, vaultMerNonce, lpMint, bumps, lpMintNonce, adminMer, adminLp, vaultLpToken;

function keypairFromFile(keypairFilePath: string): anchor.web3.Keypair {
    return anchor.web3.Keypair.fromSecretKey(
        Uint8Array.from(
            JSON.parse(
                fs.readFileSync(
                    keypairFilePath,
                    "utf8"
                )
            )
        ));
}

async function setVars(admin: anchor.web3.Signer){

    [vault, nonce] = await anchor.web3.PublicKey.findProgramAddress(
        [
            Buffer.from(anchor.utils.bytes.utf8.encode("vault")),
        ],
        program.programId
    );

    [vaultMer, vaultMerNonce] = await anchor.web3.PublicKey.findProgramAddress(
        [
            Buffer.from(anchor.utils.bytes.utf8.encode("vault_mer")),
            vault.toBuffer(),
        ],
        program.programId
    );

    [lpMint, lpMintNonce] = await anchor.web3.PublicKey.findProgramAddress(
        [
            Buffer.from(anchor.utils.bytes.utf8.encode("lp_mint")),
            vault.toBuffer(),
        ],
        program.programId
    );

    bumps = {
        vault: nonce,
        vaultMer: vaultMerNonce,
        lpMint: lpMintNonce
    };

    adminMer = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        merMint,
        admin.publicKey
    );
}

async function initializeVault() {
    const tx = await program.rpc.initializeVault(
        bumps,
        {
            accounts: {
                vault,
                vaultMer,
                merMint,
                lpMint,
                admin: admin.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            },
        }
    );
    console.log("Your transaction signature", tx);
}

async function rewardMer(signer: anchor.web3.Keypair, merAmount: number) {
    const tx = await program.rpc.reward(
        new anchor.BN(merAmount),
        {
            accounts: {
                vault,
                vaultMer,
                userMer: adminMer,
                userTransferAuthority: signer.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
            signers: [signer]
        }
    )
}


(async ()=>{
    await setVars(admin)
    initializeVault();
    //await rewardMer(admin, 2000)
})()