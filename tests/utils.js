const anchor = require("@project-serum/anchor");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");

async function createMintAndVault(provider, vaultOwner, decimals) {
    const mint = await Token.createMint(
        provider.connection,
        provider.wallet.payer,
        provider.wallet.publicKey,
        null,
        decimals,
        TOKEN_PROGRAM_ID
    );

    const vault = await mint.createAccount(vaultOwner ? vaultOwner : provider.wallet.publicKey);
    return [mint, vault];
}

async function createUserTokenAccounts(owner, poolMint, stakingMint) {
  const spt = await poolMint.createAccount(owner);
  const vault = await stakingMint.createAccount(owner);
  return {spt, vault};
}

async function mintToAccount(
    provider,
    mint,
    destination,
    amount,
    mintAuthority
) {
    // mint authority is the provider
    const tx = new anchor.web3.Transaction();
    tx.add(
      Token.createMintToInstruction(
        TOKEN_PROGRAM_ID,
        mint,
        destination,
        mintAuthority.publicKey,
        [],
        amount
      )
    );
    await provider.send(tx, [mintAuthority]);
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
    createUserTokenAccounts,
    mintToAccount,
    createMintAndVault
};
