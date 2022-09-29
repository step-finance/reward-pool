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
    default_value_t = staking::id().to_string()
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
        xmer_reward_mint: Pubkey,
        #[clap(long)]
        jup_reward_duration: u64,
        #[clap(long)]
        jup_funding_amount: u64,
        #[clap(long)]
        xmer_reward_duration: u64,
    },
    ActivateFarming {
        #[clap(long)]
        pool_pubkey: Pubkey,
    },
    SetJupInformation {
        #[clap(long)]
        pool_pubkey: Pubkey,
        #[clap(long)]
        jup_mint: Pubkey,
    },
    /// Admin adds a wallet as funder
    Authorize {
        #[clap(long)]
        pool: Pubkey,
        #[clap(long)]
        funder: Pubkey,
    },
    /// Admin removes a wallet as funder
    Deauthorize {
        #[clap(long)]
        pool: Pubkey,
        #[clap(long)]
        funder: Pubkey,
    },
    /// Admin or funder funds rewards to pool
    FundXmer {
        #[clap(long)]
        pool: Pubkey,
        #[clap(long)]
        amount: u64,
    },
    /// Admin or funder funds rewards to pool
    FundJup {
        #[clap(long)]
        pool: Pubkey,
        #[clap(long)]
        amount: u64,
    },
    /// User enables staking
    CreateUser {
        #[clap(long)]
        pool_pubkey: Pubkey,
    },
    /// User deposits full
    DepositFull {
        #[clap(long)]
        pool_pubkey: Pubkey,
    },
    /// User deposits
    Deposit {
        #[clap(long)]
        pool_pubkey: Pubkey,
        #[clap(long)]
        amount: u64,
    },
    /// User withdraw
    Withdraw {
        #[clap(long)]
        pool_pubkey: Pubkey,
        #[clap(long)]
        spt_amount: u64,
    },
    /// User claims pending rewards
    ClaimXmer {
        #[clap(long)]
        pool_pubkey: Pubkey,
    },
    /// User claims pending rewards
    ClaimJup {
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
