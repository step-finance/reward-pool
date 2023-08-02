import { IdlAccounts, Program } from "@coral-xyz/anchor";
import { Cluster } from "@solana/web3.js";

import { Farming } from "./idl/farming-idl";

export interface PoolInfo {
  accumulated_fee_volume: string;
  accumulated_trading_volume: string;
  accumulated_yield_volume: string;
  farm_expire: boolean;
  farm_new: boolean;
  farm_order: number;
  farm_tvl: string;
  farming_apy: string;
  farming_pool: string | null;
  farm_reward_duration_end: number;
  is_monitoring: boolean;
  is_lst: boolean;
  lp_decimal: number;
  lp_mint: string;
  permissioned: boolean;
  pool_address: string;
  pool_name: string;
  pool_order: number;
  pool_token_mints: Array<string>;
  pool_token_usd_amounts: Array<string>;
  pool_tvl: string;
  pool_lp_price_in_usd: number;
  total_fee_pct?: string;
  trading_volume?: number;
  trade_apy: string;
  unknown: boolean;
  daily_base_apy: string;
  fee_volume?: number;
  weekly_base_apy: string;
  yield_volume?: string;
}

export type Opt = {
  cluster: Cluster;
};

export type FarmProgram = Program<Farming>;

export type PoolState = IdlAccounts<Farming>["pool"];
export type UserState = IdlAccounts<Farming>["user"];
