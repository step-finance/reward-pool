
// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.

const anchor = require("@project-serum/anchor");

module.exports = async function (provider) {
  // Configure client to use the provider.
  anchor.setProvider(provider);

  let program = anchor.workspace.RewardPool;
  console.log(`program.programId: ${program.programId}`);

  let pda = anchor.utils.publicKey.findProgramAddressSync([Buffer.from("test"), anchor.web3.Keypair.generate().publicKey.toBuffer()], program.programId);
  console.log(`pda address: ${pda[0]}; pda bump: ${pda[1]}`);

  let asdasd = Object.keys(program.account);
  console.log(`asdasd: ${asdasd}`);

  let accts = await program.account["pool"].all();
  console.log(`accts.length: ${accts.length}`);
  for (const acct of accts) {
    console.log(`acct.account.rewardAMint: ${acct.account.rewardAMint}`);
    if (acct.account.rewardAMint?.toString() == "7JYZmXjHenJxgLUtBxgYsFfoABmWQFA1fW3tHQKUBThV") {
      console.log(`owner of weed farm is ${acct.account.authority}`);
    }
  }
}
