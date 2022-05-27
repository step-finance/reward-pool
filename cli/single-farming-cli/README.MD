# Dual-farming CLI
## Installation
### Prerequisites
```bash
rustc == 1.60.0
solana-cli == 1.8.16
anchor == 0.24.2 
```
### Install
```bash
git clone git@github.com:mercurial-finance/reward-pool.git
cd cli/single-farming-cli
cargo build --release
cd ../../target/release
```
### Usage
```bash
single-farming-cli 0.1.0

USAGE:
    single-farming-cli [OPTIONS] <SUBCOMMAND>

OPTIONS:
    -c, --cluster <CLUSTER>            Cluster override [default: devnet]
    -h, --help                         Print help information
    -p, --program-id <PROGRAM_ID>      [default: Dev9TukuTHwNmYm2NUcXQ9iuNL8UrP3TnZCj1Y7UjV18]
    -V, --version                      Print version information
    -w, --wallet-path <WALLET_PATH>    Wallet override [default:
                                       /Users/phihoang/.config/solana/id.json]

SUBCOMMANDS:
    claim          User claims pending rewards
    close-user     Admin closes a user stake account
    create-user    User enables staking
    help           Print this message or the help of the given subcommand(s)
    init           Initialize pool
    show-info      Show pool info
    stake          User stakes
    stake-info     User stake info
    unstake        User unstakes
```

## Examples
### Setup
```
staking_mint: AtssC9B1jGqW4d2PVZmMt6cLLpQ84DycLpAae7EW3XL6
reward_mint: Gu7Ze57kKQF9r4u4oo4tAsk8riP8idw4gBN6hgUGQdTd
```

### Initialize Pool

```bash
$ ./single-farming-cli init --staking-mint 5SJETH3dj4zfZ1prQbGXFP1roBir2sU71tNZsLpZL8Je --reward-mint 3posQXX36o8C6qbSvNh7JUubhigVqRmJ9SB9YeD6SV66 --reward-start-timestamp 1656547200 --reward-duration 2592000 --funding-amount 10

Wallet 3ekBoR8LmkuMmUm8M3iURoafbwEVQJzTsPbWEtxXk1d5
Program ID: "EnkQuN7PGSdvqDmB9Z1dDRKuYnXnCeEMpUwHU37E3kQd"
Signature 5swLHFTrptwstp2qZ6255XKJMv7FRd22tzgH27Pwmr9X8moBToqsJuTcd5A7bGPubiLRCrWQuMA2EPkDisbwQtRr

```

### Create User
```bash
$ ./single-farming-cli create-user --wallet-path ~/.config/solana/user.json --staking-mint 5SJETH3dj4zfZ1prQbGXFP1roBir2sU71tNZsLpZL8Je
 
Wallet EdRCHLTZR6Pcx1YDa4TgvVoxJDkCuwwvDGYSh9LNy5KK
Program ID: "EnkQuN7PGSdvqDmB9Z1dDRKuYnXnCeEMpUwHU37E3kQd"
Signature 2H1ZWjWBVLWKMKkDXH7HzJd31kLihjxnGDMGsbRADjcK36wG9KcVi17CTddLtSXXRu3A44cAW1hNHZQX251AMYix

```

### Stake

```bash
./single-farming-cli stake --wallet-path ~/.config/solana/user.json  --staking-mint 5SJETH3dj4zfZ1prQbGXFP1roBir2sU71tNZsLpZL8Je --base 6iG7xBbKbkm14yQfJjBJ6YZR6uHNbdw6eNnrCGQ8RsUF 1000


Wallet EdRCHLTZR6Pcx1YDa4TgvVoxJDkCuwwvDGYSh9LNy5KK
Program ID: "EnkQuN7PGSdvqDmB9Z1dDRKuYnXnCeEMpUwHU37E3kQd"
Signature 57tnZedp4qZzsYCmss64kyqDWM8BvgexLvc5yEPZyw4gETGqbCbCQG3v3ridyKgwHnWZCNHXxJwXWcJ5ePvQDgEo

```

### Unstake

```bash
./single-farming-cli unstake [--wallet-path <WALLET_PATH_JSON>]  --staking-mint <STAKING_MINT_PUBKEY>  amount
```


### Claim
```bash
./single-farming-cli claim [--wallet-path <WALLET_PATH_JSON>]  --staking-mint <STAKING_MINT_PUBKEY> 
```

### Close user

```bash
./single-farming-cli close-user [--wallet-path <WALLET_PATH_JSON>]  --staking-mint <STAKING_MINT_PUBKEY> 
```

### Show Info

```bash
./single-farming-cli show-info [--wallet-path <WALLET_PATH_JSON>]  --staking-mint <STAKING_MINT_PUBKEY> 
```

### Stake Info

```bash
./single-farming-cli stake-info --wallet-path ~/.config/solana/user.json  --staking-mint AtssC9B1jGqW4d2PVZmMt6cLLpQ84DycLpAae7EW3XL6 --base 6iG7xBbKbkm14yQfJjBJ6YZR6uHNbdw6eNnrCGQ8RsUF 

Wallet EdRCHLTZR6Pcx1YDa4TgvVoxJDkCuwwvDGYSh9LNy5KK
Program ID: "AXFHikQNKk2zgiss9USaUVccLt4TSqmXBLEkZZ6GhojH"
balance_staked 1000
reward_per_token_complete 0
reward_per_token_pending 0
```

