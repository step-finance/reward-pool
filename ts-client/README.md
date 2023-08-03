# Meteora Pool Farm SDK

<p align="center">
<img align="center" src="https://vaults.mercurial.finance/icons/logo.svg" width="180" height="180" />
</p>
<br>

## Getting started

NPM: https://www.npmjs.com/package/@mercurial-finance/farming-sdk

SDK: https://github.com/MeteoraAg/reward-pool

<!-- Docs: https://docs.mercurial.finance/mercurial-dynamic-yield-infra/ -->

Discord: https://discord.com/channels/841152225564950528/864859354335412224

<hr>

## Install

1. Install deps

```
npm i @mercurial-finance/farming-sdk @project-serum/anchor @solana/web3.js @solana/spl-token @solana/spl-token-registry
```

2. Initialize AmmImpl instance

```ts
import PoolFarmImpl from "@mercurial-finance/farming-sdk";
import { PublicKey } from "@solana/web3.js";
import { Wallet, AnchorProvider } from "@project-serum/anchor";

// Connection, Wallet, and AnchorProvider to interact with the network
const mainnetConnection = new Connection("https://api.mainnet-beta.solana.com");
const mockWallet = new Wallet(new Keypair());
const provider = new AnchorProvider(mainnetConnection, mockWallet, {
  commitment: "confirmed",
});
// Alternatively, to use Solana Wallet Adapter

const farmingPools = await PoolFarmImpl.getFarmAddressesByPoolAddress(
  MAINNET_POOL.USDC_USDT // Pool Address can get from https://docs.meteora.ag/dynamic-pools-integration/dynamic-pool-api/pool-info
);
// farmingPools is an array (A pool can have multiple farms)
const farmingPool = farmingPools[0];
const farm = await PoolFarmImpl.create(connection, farmingPool);
```

3. To interact with the PoolFarmImpl

- Stake

```ts
// https://station.jup.ag/blog/jupiter-token-list-api#endpoints
const tokenList = await fetch('https://token.jup.ag/all').then(res => res.json());
const USDC = tokenList.find(token => token.address === <USDC_ADDRESS>);
const USDT = tokenList.find(token => token.address === <USDT_ADDRESS>);
// Get pool lp balance from `@mercurial-finance/dynamic-amm-sdk` package
const pool = await AmmImpl.create(connection, MAINNET_POOL.USDC_USDT, USDC, USDT);
const lpBalance = await pool.getUserBalance(mockWallet.publicKey);

const stakeTx = await farm.deposit(mockWallet.publicKey, lpBalance); // Web3 Transaction Object
const stakeResult = await provider.sendAndConfirm(stakeTx); // Transaction hash
```

- Check staked balance

```ts
const farmBalance = await farm.getUserBalance(mockWallet.publicKey);
```

- Unstake

```ts
const unStakeTx = await farm.withdraw(mockWallet.publicKey, farmBalance); // Web3 Transaction Object
const unstakeResult = await provider.sendAndConfirm(depositTx); // Transaction hash
```
