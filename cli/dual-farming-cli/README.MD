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
cd cli/dual-farming-cli
cargo build --release
cd ../../target/release
```
### Usage
```bash
USAGE:
    dual-farming-cli [OPTIONS] <SUBCOMMAND>

OPTIONS:
    -c, --cluster <CLUSTER>
            Cluster override
            
            Values = mainnet, testnet, devnet, localnet. Default: devnet
            
            [default: devnet]

    -h, --help
            Print help information

    -p, --program-id <PROGRAM_ID>
            [default: DUALszVmfxqFLXDQpkrf8S6qHNxjqeBdDnqne74Bwhvw]

    -V, --version
            Print version information

    -w, --wallet-path <WALLET_PATH>
            Wallet override
            
            Example: /path/to/wallet/keypair.json Default: ~/.config/solana/id.json
            
            [default: ~/.config/solana/id.json]

SUBCOMMANDS:
    authorize
            Admin adds a wallet as funder
    claim
            User claims pending rewards
    close-pool
            Admin closes the pool
    close-user
            Admin closes a user stake account
    create-user
            User enables staking
    deauthorize
            Admin removes a wallet as funder
    fund
            Admin or funder funds rewards to pool
    help
            Print this message or the help of the given subcommand(s)
    init
            Initialize pool
    pause
            Admin pauses the pool
    show-info
            Show pool info
    stake
            User stakes
    stake-info
            User stake info
    unpause
            Admin resumes the paused pool
    unstake
            User unstakes

```

## Examples
### Setup
```
staking_mint: AtssC9B1jGqW4d2PVZmMt6cLLpQ84DycLpAae7EW3XL6
reward_a_mint: Gu7Ze57kKQF9r4u4oo4tAsk8riP8idw4gBN6hgUGQdTd
reward_b_mint: D6a1BML94qorutv8j67fdpmYiQGou3iBArGiw467Qwzj
```

### Initialize Pool

```bash
$ ./dual-farming-cli init --staking-mint AtssC9B1jGqW4d2PVZmMt6cLLpQ84DycLpAae7EW3XL6 --reward-a-mint Gu7Ze57kKQF9r4u4oo4tAsk8riP8idw4gBN6hgUGQdTd --reward-b-mint D6a1BML94qorutv8j67fdpmYiQGou3iBArGiw467Qwzj 2592000`

Wallet 3ekBoR8LmkuMmUm8M3iURoafbwEVQJzTsPbWEtxXk1d5
Program ID: "DUALszVmfxqFLXDQpkrf8S6qHNxjqeBdDnqne74Bwhvw"
base pubkey 6iG7xBbKbkm14yQfJjBJ6YZR6uHNbdw6eNnrCGQ8RsUF
Signature dNG7A3meEuxHtRUFdhL13fwUpFiWe3WXpvx8eoV94HwtJmVj6crqiYqFpnfQMy7mz8w9Nts2jPkjf87FrVoW5nP
```

### Pause 
```bash
./dual-farming-cli pause [--wallet-path <WALLET_PATH_JSON>]  --staking-mint <STAKING_MINT_PUBKEY> --base <BASE_PUBKEY>
```

### Unpause
```bash
./dual-farming-cli unpause [--wallet-path <WALLET_PATH_JSON>]  --staking-mint <STAKING_MINT_PUBKEY> --base <BASE_PUBKEY>
```

### Create User
```bash
$ ./dual-farming-cli create-user --wallet-path ~/.config/solana/user.json  --staking-mint 3posQXX36o8C6qbSvNh7JUubhigVqRmJ9SB9YeD6SV66
 --base 9C4KtWUFkqw9k4fyPmLoeh88KXRubZUbcLWRwbrZeycT
 
Wallet EdRCHLTZR6Pcx1YDa4TgvVoxJDkCuwwvDGYSh9LNy5KK
Program ID: "DUALszVmfxqFLXDQpkrf8S6qHNxjqeBdDnqne74Bwhvw"
Signature 5T8YCrxJkVE238tnDABdhoeVyL5u9kR2EqaAV8KPB6yFefZtAH8nwwEd3BBtiGXYH5NKW2eXju6HByQbj2kvR2ax
```

### Deposit

```bash
./dual-farming-cli deposit --wallet-path ~/.config/solana/user.json  --staking-mint AtssC9B1jGqW4d2PVZmMt6cLLpQ84DycLpAae7EW3XL6 --base 6iG7xBbKbkm14yQfJjBJ6YZR6uHNbdw6eNnrCGQ8RsUF 1000


Wallet EdRCHLTZR6Pcx1YDa4TgvVoxJDkCuwwvDGYSh9LNy5KK
Program ID: "DUALszVmfxqFLXDQpkrf8S6qHNxjqeBdDnqne74Bwhvw"
Signature 57tnZedp4qZzsYCmss64kyqDWM8BvgexLvc5yEPZyw4gETGqbCbCQG3v3ridyKgwHnWZCNHXxJwXWcJ5ePvQDgEo

```

### Withdraw

```bash
./dual-farming-cli withdraw [--wallet-path <WALLET_PATH_JSON>]  --staking-mint <STAKING_MINT_PUBKEY> --base <BASE_PUBKEY> amount
```


### Authorize Funder
```bash
./dual-farming-cli authorize [--wallet-path <WALLET_PATH_JSON>]  --staking-mint <STAKING_MINT_PUBKEY> --base <BASE_PUBKEY> --funder <FUNDER_WALLET>
```

### Deauthorize Funder
```bash
./dual-farming-cli deauthorize [--wallet-path <WALLET_PATH_JSON>]  --staking-mint <STAKING_MINT_PUBKEY> --base <BASE_PUBKEY> --funder <FUNDER_WALLET>
```
### Fund
```bash
./dual-farming-cli fund fund --staking-mint AtssC9B1jGqW4d2PVZmMt6cLLpQ84DycLpAae7EW3XL6 --base 6iG7xBbKbkm14yQfJjBJ6YZR6uHNbdw6eNnrCGQ8RsUF --amount-a 100000 --amount-b 100000

Wallet 3ekBoR8LmkuMmUm8M3iURoafbwEVQJzTsPbWEtxXk1d5
Program ID: "DUALszVmfxqFLXDQpkrf8S6qHNxjqeBdDnqne74Bwhvw"
Signature 52qNmzg8knVzEPSuCmMfcGPkm7JQtUoFAXMG9xaDTwKwcemE7ijcSCQkkBmP3ZKpjCX2JScopksed6LKMGijfAHv
```

### Claim
```bash
./dual-farming-cli claim [--wallet-path <WALLET_PATH_JSON>]  --staking-mint <STAKING_MINT_PUBKEY> --base <BASE_PUBKEY>
```

### Close user

```bash
./dual-farming-cli close-user [--wallet-path <WALLET_PATH_JSON>]  --staking-mint <STAKING_MINT_PUBKEY> --base <BASE_PUBKEY>
```

### Close pool

```bash
./dual-farming-cli close-pool [--wallet-path <WALLET_PATH_JSON>]  --staking-mint <STAKING_MINT_PUBKEY> --base <BASE_PUBKEY>
```

### Show Info

```bash
./dual-farming-cli show-info [--wallet-path <WALLET_PATH_JSON>]  --staking-mint <STAKING_MINT_PUBKEY> --base <BASE_PUBKEY>
```

### Stake Info

```bash
./dual-farming-cli stake-info --wallet-path ~/.config/solana/user.json  --staking-mint AtssC9B1jGqW4d2PVZmMt6cLLpQ84DycLpAae7EW3XL6 --base 6iG7xBbKbkm14yQfJjBJ6YZR6uHNbdw6eNnrCGQ8RsUF 

Wallet EdRCHLTZR6Pcx1YDa4TgvVoxJDkCuwwvDGYSh9LNy5KK
Program ID: "DUALszVmfxqFLXDQpkrf8S6qHNxjqeBdDnqne74Bwhvw"
balance_staked 1000
reward_a_per_token_complete 0
reward_a_per_token_pending 0
reward_b_per_token_complete 0
reward_b_per_token_pending 0
```

