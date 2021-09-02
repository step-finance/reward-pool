const anchor = require("@project-serum/anchor");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");

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
    await provider.send(tx);
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
                toPubkey: destination}
        )
    );
    await provider.send(tx);
}

async function createMintToAccountInstrs(
    mint,
    destination,
    amount,
    mintAuthority
) {
return [
    TokenInstructions.mintTo({
    mint,
    destination: destination,
    amount: amount,
    mintAuthority: mintAuthority,
    }),
];
}

module.exports = {
    mintToAccount,
    createMintAndVault,
    createMint,
    sendLamports,
};
