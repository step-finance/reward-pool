const anchor = require("@project-serum/anchor");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const { TOKEN_PROGRAM_ID, Token, MintLayout, ASSOCIATED_TOKEN_PROGRAM_ID } = require("@solana/spl-token");

async function initializeProgram(program, provider, authMintPubkey) {
    const [_configPubkey, _nonce] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("config")], program.programId);
    configPubkey = _configPubkey;
    let nonce = _nonce;
    await program.rpc.initializeProgram(
        nonce,
        authMintPubkey,
        {
            accounts: {
                config: configPubkey,
                payer: provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        }
    )
}

async function createMint(provider, decimals) {
    const mint = await Token.createMint(
        provider.connection,
        provider.wallet.payer,
        provider.wallet.publicKey,
        null,
        decimals,
        TOKEN_PROGRAM_ID
    );
    return mint;
}

async function createMintAndVault(provider, vaultOwner, decimals) {
    const mint = await createMint(provider);

    const vault = await mint.createAccount(vaultOwner ? vaultOwner : provider.wallet.publicKey);
    return [mint, vault];
}

async function createMintFromPriv(
    mintAccount,
    provider,
    mintAuthority,
    freezeAuthority,
    decimals,
    programId,
) {
    const token = new Token(
        provider.connection,
        mintAccount.publicKey,
        programId,
        provider.wallet.payer,
    );

    // Allocate memory for the account
    const balanceNeeded = await Token.getMinBalanceRentForExemptMint(
        provider.connection,
    );

    const transaction = new anchor.web3.Transaction();
    transaction.add(
        anchor.web3.SystemProgram.createAccount({
            fromPubkey: provider.wallet.payer.publicKey,
            newAccountPubkey: mintAccount.publicKey,
            lamports: balanceNeeded,
            space: MintLayout.span,
            programId,
        }),
    );

    transaction.add(
        Token.createInitMintInstruction(
            programId,
            mintAccount.publicKey,
            decimals,
            mintAuthority,
            freezeAuthority,
        ),
    );

    await provider.sendAndConfirm(transaction, [mintAccount]);
    return token;
}

async function mintToAccount(
    provider,
    mint,
    destination,
    amount
) {
    const tx = new anchor.web3.Transaction();
    tx.add(
        Token.createMintToInstruction(
            TOKEN_PROGRAM_ID,
            mint,
            destination,
            provider.wallet.publicKey,
            [],
            amount
        )
    );
    await provider.sendAndConfirm(tx);
}

async function sendLamports(
    provider,
    destination,
    amount
) {
    const tx = new anchor.web3.Transaction();
    tx.add(
        anchor.web3.SystemProgram.transfer(
            {
                fromPubkey: provider.wallet.publicKey,
                lamports: amount,
                toPubkey: destination
            }
        )
    );
    await provider.sendAndConfirm(tx);
}

async function getOrCreateAssociatedTokenAccount(
    tokenMint,
    owner,
    payer,
    provider,
) {
    const toAccount = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenMint,
        owner
    );
    const account = await provider.connection.getAccountInfo(toAccount);
    if (!account) {
        const tx = new anchor.web3.Transaction().add(
            Token.createAssociatedTokenAccountInstruction(
                ASSOCIATED_TOKEN_PROGRAM_ID,
                TOKEN_PROGRAM_ID,
                tokenMint,
                toAccount,
                owner,
                payer.publicKey
            )
        );

        const signature = await provider.sendAndConfirm(tx, [payer]);
        await provider.connection.confirmTransaction(signature);

        return Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            tokenMint,
            owner
        );
    }
    return toAccount;
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = {
    mintToAccount,
    createMintAndVault,
    createMintFromPriv,
    createMint,
    sendLamports,
    initializeProgram,
    getOrCreateAssociatedTokenAccount,
    sleep,
};
