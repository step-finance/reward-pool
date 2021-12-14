use crate::*;
use borsh::{ BorshSerialize, BorshDeserialize };

const SECONDS_IN_YEAR: u64 = 365 * 24 * 60 * 60;

#[derive(Clone, BorshSerialize, BorshDeserialize, PartialEq)]
#[repr(u8)]
/// A version marker for different logic pertaining to program upgrades
pub enum PoolVersion {
    /// a V1 pool is the original math logic where rate is per second
    V1 = 0,
    /// a V2 pool uses the rate field as a ANNUAL lamport rate
    V2 = 2,
}

impl Pool {
    /// Will upgrade the pool if an upgrade is available and able to be done
    pub fn upgrade_if_needed(&mut self, a_amount_vault_current: u64, b_amount_vault_current: u64) {
        match self.version {
            PoolVersion::V1 => {

                msg!("pool upgraded to v2");
                self.version = PoolVersion::V2;

                //rescuing borked funds
                if self.reward_a_rate == 0 && a_amount_vault_current > 0 {
                    //if upgrade is only done when funding, this is moot
                    self.reward_a_rate = SECONDS_IN_YEAR
                        .checked_div(self.reward_duration).unwrap()
                        .checked_mul(a_amount_vault_current).unwrap();
                }
                if self.reward_b_rate == 0 && b_amount_vault_current > 0 {
                    //if upgrade is only done when funding, this is moot
                    self.reward_b_rate = SECONDS_IN_YEAR
                        .checked_div(self.reward_duration).unwrap()
                        .checked_mul(b_amount_vault_current).unwrap();
                }

            },
            _ => { },
        };
    }
}