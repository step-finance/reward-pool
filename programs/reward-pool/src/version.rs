use crate::*;
use borsh::{ BorshSerialize, BorshDeserialize };

#[derive(Clone, BorshSerialize, BorshDeserialize)]
#[repr(u8)]
pub enum PoolVersion {
    V1 = 0,
    V2 = 2,
}

/*
impl Pool {
    fn upgrade(&mut self) -> Result<()> {
        match self.version {
            PoolVersion::V1 => {
                self.version = PoolVersion::V2;
                self.reward_a_rate = self.reward_a_rate.checked_mul(365 * 24 * 60 * 60).unwrap();
                self.reward_b_rate = self.reward_b_rate.checked_mul(365 * 24 * 60 * 60).unwrap();
            },
            _ => { },
        };
        Ok(())
    }
}
*/