use anchor_lang::prelude::*;

/// Contains error code from the program
#[error_code]
pub enum ErrorCode {
    /// Staking mint is wrong
    #[msg("Staking mint is wrong")]
    WrongStakingMint,
    /// Create pool with wrong admin
    #[msg("Create pool with wrong admin")]
    InvalidAdminWhenCreatingPool,
    /// Start time cannot be smaller than current time
    #[msg("Start time cannot be smaller than current time")]
    InvalidStartDate,
    /// Cannot unstake more than staked amount
    #[msg("Cannot unstake more than staked amount")]
    CannotUnstakeMoreThanBalance,
    /// Insufficient funds to unstake.
    #[msg("Insufficient funds to unstake.")]
    InsufficientFundUnstake,
    /// Amount must be greater than zero.
    #[msg("Amount must be greater than zero.")]
    AmountMustBeGreaterThanZero,
    /// Duration cannot be shorter than one day.
    #[msg("Jup duration cannot be zero")]
    JupDurationCannotBeZero,
    /// MathOverFlow
    #[msg("MathOverFlow")]
    MathOverFlow,
    /// Provided funder is already authorized to fund.
    #[msg("Provided funder is already authorized to fund.")]
    FunderAlreadyAuthorized,
    /// Maximum funders already authorized.
    #[msg("Maximum funders already authorized.")]
    MaxFunders,
    /// Cannot deauthorize the primary pool authority.
    #[msg("Cannot deauthorize the primary pool admin.")]
    CannotDeauthorizePoolAdmin,
    /// Authority not found for deauthorization.
    #[msg("Authority not found for deauthorization.")]
    CannotDeauthorizeMissingAuthority,
    /// Provided funder is already authorized to fund.
    #[msg("JUP is already fully funded.")]
    JupIsFullyFunded,
}
