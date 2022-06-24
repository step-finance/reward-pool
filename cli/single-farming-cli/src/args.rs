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
    default_value_t = single_farming::id().to_string()
    )]
    pub program_id: String,
}

#[derive(Parser, Debug)]
pub enum CliCommand {
    /// Initialize pool
    Init {
        #[clap(long)]
        staking_mint: Pubkey,
        #[clap(long)]
        reward_mint: Pubkey,
        #[clap(long)]
        reward_duration: u64,
        #[clap(long)]
        funding_amount: u64,
    },
    ActivateFarming {
        #[clap(long)]
        pool_pubkey: Pubkey,
    },
    /// User enables staking
    CreateUser {
        #[clap(long)]
        pool_pubkey: Pubkey,
    },
    /// User stakes
    Stake {
        #[clap(long)]
        pool_pubkey: Pubkey,
        amount: u64,
    },
    /// User unstakes
    Unstake {
        #[clap(long)]
        pool_pubkey: Pubkey,
        spt_amount: u64,
    },
    /// User claims pending rewards
    Claim {
        #[clap(long)]
        pool_pubkey: Pubkey,
    },
    /// Admin closes a user stake account
    CloseUser {
        #[clap(long)]
        pool_pubkey: Pubkey,
    },
    /// Show pool info
    ShowInfo {
        #[clap(long)]
        pool_pubkey: Pubkey,
    },
    /// User stake info
    StakeInfo {
        #[clap(long)]
        pool_pubkey: Pubkey,
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
