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
        default_value_t = staking::id().to_string()
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
    /// Transfer admin
    TransferAdmin {
        #[clap(long)]
        new_admin_path: String, // path that stores new_admin keypair
        #[clap(long)]
        vault_pubkey: Pubkey,
    },
    /// Show vault info
    ShowInfo {
        #[clap(long)]
        vault_pubkey: Pubkey,
    },
    /// Stake
    Stake {
        #[clap(long)]
        vault_pubkey: Pubkey,
        /// Amount to stake
        amount: u64,
    },
    /// Add reward to the vault
    Reward {
        #[clap(long)]
        vault_pubkey: Pubkey,
        /// Amount to stake
        amount: u64,
    },
    /// Unstake
    Unstake {
        #[clap(long)]
        vault_pubkey: Pubkey,
        /// Amount to stake
        unmint_amount: u64,
    },
    /// Update locked reward degradation
    UpdateLockedRewardDegradation {
        #[clap(long)]
        vault_pubkey: Pubkey,
        locked_reward_degradation: u64,
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
