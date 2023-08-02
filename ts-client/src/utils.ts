import { AnchorProvider, EventParser, Program } from "@coral-xyz/anchor";
import {
  Cluster,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  Token,
} from "@solana/spl-token";
import fetch from "node-fetch";

import { Farming, IDL } from "./idl/farming-idl";
import { Amm as AmmIdl, IDL as AmmIDL } from "./idl/amm-idl";
import { AMM_PROGRAM_ID, FARM_PROGRAM_ID } from "./constant";
import { PoolInfo } from "./types";

export const getFarmProgram = (connection: Connection) => {
  const provider = new AnchorProvider(
    connection,
    {} as any,
    AnchorProvider.defaultOptions()
  );
  const program = new Program<Farming>(IDL, FARM_PROGRAM_ID, provider);

  return { provider, program };
};

export const getAmmProgram = (connection: Connection, programId?: string) => {
  const provider = new AnchorProvider(
    connection,
    {} as any,
    AnchorProvider.defaultOptions()
  );
  const ammProgram = new Program<AmmIdl>(
    AmmIDL,
    programId ?? AMM_PROGRAM_ID,
    provider
  );

  return { provider, ammProgram };
};

export const getFarmInfo = async (cluster?: Cluster) => {
  const data = await fetch(
    cluster === "devnet"
      ? process.env.DEVNET_FARM_API
      : process.env.MAINNET_FARM_API
  ).then((res) => res.json());

  return data as PoolInfo[];
};

export const parseLogs = <T>(eventParser: EventParser, logs: string[]) => {
  if (!logs.length) throw new Error("No logs found");

  for (const event of eventParser?.parseLogs(logs)) {
    return event.data as T;
  }

  throw new Error("No events found");
};

export const getOrCreateATAInstruction = async (
  tokenMint: PublicKey,
  owner: PublicKey,
  connection: Connection
): Promise<[PublicKey, TransactionInstruction?]> => {
  let toAccount;
  try {
    toAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      tokenMint,
      owner
    );
    const account = await connection.getAccountInfo(toAccount);
    if (!account) {
      const ix = Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenMint,
        toAccount,
        owner,
        owner
      );
      return [toAccount, ix];
    }
    return [toAccount, undefined];
  } catch (e) {
    /* handle error */
    console.error("Error::getOrCreateATAInstruction", e);
    throw e;
  }
};

export function chunks<T>(array: T[], size: number): T[][] {
  return Array.apply(0, new Array(Math.ceil(array.length / size))).map(
    (_, index) => array.slice(index * size, (index + 1) * size)
  );
}

export const airDropSol = async (
  connection: Connection,
  publicKey: PublicKey,
  amount = 1
) => {
  try {
    const airdropSignature = await connection.requestAirdrop(
      publicKey,
      amount * LAMPORTS_PER_SOL
    );
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });
  } catch (error) {
    console.error(error);
    throw error;
  }
};
