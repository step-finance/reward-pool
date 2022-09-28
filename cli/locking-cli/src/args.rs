use anchor_client::solana_sdk::pubkey::Pubkey;
use anchor_client::Cluster;
use clap::*;

#[derive(Parser, Debug)]
pub struct ConfigOverride {
    /// Cluster override
    ///
    /// Values = mainnet, testnet, devnet, localnet.
    /// Default: devnet
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
        default_value_t = locking::id().to_string()
    )]
    pub program_id: String,
}

#[derive(Parser, Debug)]
pub enum CliCommand {
    /// Initialize vault
    Init {
        #[clap(long)]
        token_mint: Pubkey,
    },
    /// Show vault info
    ShowInfo {
        #[clap(long)]
        vault_pubkey: Pubkey,
    },
    /// Lock
    Lock {
        #[clap(long)]
        vault_pubkey: Pubkey,
        /// Amount to lock
        amount: u64,
    },
    /// Unlock
    Unlock {
        #[clap(long)]
        vault_pubkey: Pubkey,
        /// Amount to unlock
        unlock_amount: u64,
    },
    /// Set release date
    SetReleaseDate {
        #[clap(long)]
        vault_pubkey: Pubkey,
        /// Release date since unix timestamp
        release_date: u64,
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
