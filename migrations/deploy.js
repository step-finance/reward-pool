
// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.

const anchor = require("@project-serum/anchor");

module.exports = async function (provider) {
  // Configure client to use the provider.
  anchor.setProvider(provider);

  let program = anchor.workspace.RewardPool;

  let authMintPubKeyString = process.env.POOL_AUTHORITY_MINT_PUBKEY;
  if (authMintPubKeyString == undefined) {
    throw "POOL_AUTHORITY_MINT_PUBKEY env var reqd"
  }
  let authMintPubkey = new anchor.web3.PublicKey(authMintPubKeyString);

  const [ _configPubkey, _nonce] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("config")], program.programId);
  configPubkey = _configPubkey;
  await program.rpc.initializeProgram(
      _nonce,
      authMintPubkey,
      {
          accounts: {
              config: configPubkey,
              payer: provider.wallet.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
          },
      }
  );
}
