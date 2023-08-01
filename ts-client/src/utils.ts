import { AnchorProvider, EventParser, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  Token,
} from "@solana/spl-token";

import { Farming, IDL } from "./farming-idl";

export const FARM_PROGRAM_ID = new PublicKey(
  "FarmuwXPWXvefWUeqFAa5w6rifLkq5X6E8bimYvrhCB1"
);

export const getFarmProgram = (connection: Connection) => {
  const provider = new AnchorProvider(
    connection,
    {} as any,
    AnchorProvider.defaultOptions()
  );
  const program = new Program<Farming>(IDL, FARM_PROGRAM_ID, provider);

  return { provider, program };
};

export const SIMULATION_USER = new PublicKey(
  "HrY9qR5TiB2xPzzvbBu5KrBorMfYGQXh9osXydz4jy9s"
);

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
