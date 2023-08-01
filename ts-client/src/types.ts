import { IdlAccounts, Program } from "@coral-xyz/anchor";
import { Cluster } from "@solana/web3.js";

import { Farming } from "./farming-idl";

export type Opt = {
  cluster: Cluster;
};

export type FarmProgram = Program<Farming>;

export type PoolState = IdlAccounts<Farming>["pool"];
export type UserState = IdlAccounts<Farming>["user"];
