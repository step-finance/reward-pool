use anchor_client::solana_sdk::pubkey::Pubkey;
use anchor_client::Cluster;
use clap::*;

#[derive(Parser, Debug)]
pub struct ConfigOverride {
    /// Cluster override
    ///
    /// Values = Mainnet, Testnet, Devnet, Localnet.
    /// Default: Devnet
    #[clap(global = true, short, long, default_value_t = Cluster::Devnet)]
    pub cluster: Cluster,
    /// Wallet override
    ///
    /// Example: /path/to/wallet/keypair.json
    /// Default: ~/.config/solana/id.json
    #[clap(
    global = true,
    short,
    long,
    default_value_t = String::from(shellexpand::tilde("~/.config/solana/id.json"))
    )]
    pub wallet_path: String,

    #[clap(
    global = true,
    short,
    long,
    default_value_t = dual_farming::id().to_string()
    )]
    pub program_id: String,
}

#[derive(Parser, Debug)]
pub struct PoolArgs {
    #[clap(long)]
    /// Base keypair file required to initialize the vault
    ///
    /// /path/to/base/keypair.json
    pub base: String,
    #[clap(long)]
    /// Staking mint of the pool
    ///
    /// Eg: 9NGDi2tZtNmCCp8SVLKNuGjuWAVwNF3Vap5tT8km5er9
    pub staking_mint: Pubkey,
    #[clap(long)]
    /// Mint of reward A token
    pub reward_a_mint: Pubkey,
    #[clap(long)]
    /// Mint of reward B token
    pub reward_b_mint: Pubkey,
}

#[derive(Parser, Debug)]
pub enum CliCommand {
    /// Initialize pool
    Init {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        reward_a_mint: Pubkey,
        #[clap(long)]
        reward_b_mint: Pubkey,
        reward_duration: u64,
    },
    /// User enables staking
    CreateUser {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        base: Pubkey,
    },
    /// Admin pauses the pool
    Pause {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        base: Pubkey,
    },
    /// Admin resumes the paused pool
    Unpause {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        base: Pubkey,
    },
    /// User stakes
    Stake {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        base: Pubkey,
        amount: u64,
    },
    /// User unstakes
    Unstake {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        base: Pubkey,
        spt_amount: u64,
    },
    /// Admin adds a wallet as funder
    Authorize {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        base: Pubkey,
        #[clap(long)]
        funder: Pubkey,
    },
    /// Admin removes a wallet as funder
    Deauthorize {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        base: Pubkey,
        #[clap(long)]
        funder: Pubkey,
    },
    /// Admin or funder funds rewards to pool
    Fund {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        base: Pubkey,
        #[clap(long)]
        amount_a: u64,
        #[clap(long)]
        amount_b: u64,
    },
    /// User claims pending rewards
    Claim {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        base: Pubkey,
    },
    /// Admin closes a user stake account
    CloseUser {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        base: Pubkey,
    },
    /// Admin closes the pool
    ClosePool {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        base: Pubkey,
    },
    /// Show pool info
    ShowInfo {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        base: Pubkey,
    },
    /// User stake info
    StakeInfo {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        base: Pubkey,
    },
}

#[derive(Parser, Debug)]
#[clap(version, about, author)]
pub struct Opts {
    #[clap(flatten)]
    pub config_override: ConfigOverride,
    #[clap(subcommand)]
    pub command: CliCommand,
}
