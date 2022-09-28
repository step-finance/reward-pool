import * as anchor from "@project-serum/anchor";

export interface ParsedClockState {
  info: {
    epoch: number;
    epochStartTimestamp: number;
    leaderScheduleEpoch: number;
    slot: number;
    unixTimestamp: number;
  };
  type: string;
  program: string;
  space: number;
}

export const getClock = async (
  connection: anchor.web3.Connection
): Promise<ParsedClockState> => {
  const parsedClock = await connection.getParsedAccountInfo(
    anchor.web3.SYSVAR_CLOCK_PUBKEY
  );
  const clockState = (parsedClock.value!.data as anchor.web3.ParsedAccountData)
    .parsed as ParsedClockState;
  return clockState;
};
