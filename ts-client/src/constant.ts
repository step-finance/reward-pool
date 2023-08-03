import { ENV, TokenInfo } from "@solana/spl-token-registry";
import { PublicKey } from "@solana/web3.js";

export const FARM_PROGRAM_ID = new PublicKey(
  "FarmuwXPWXvefWUeqFAa5w6rifLkq5X6E8bimYvrhCB1"
);

export const AMM_PROGRAM_ID = new PublicKey(
  "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB"
);

export const SIMULATION_USER = new PublicKey(
  "HrY9qR5TiB2xPzzvbBu5KrBorMfYGQXh9osXydz4jy9s"
);

export const DEVNET_COIN: Array<TokenInfo> = [
  {
    chainId: ENV.Devnet,
    address: "So11111111111111111111111111111111111111112",
    decimals: 9,
    name: "Wrapped SOL",
    symbol: "SOL",
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    extensions: {
      coingeckoId: "solana",
      serumV3Usdc: "9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT",
      serumV3Usdt: "HWHvQhFmJB3NUcu1aihKmrKegfVxBEHzwVX6yZCKEsi1",
      website: "https://solana.com/",
    },
  },
  {
    chainId: ENV.Devnet,
    address: "zVzi5VAf4qMEwzv7NXECVx5v2pQ7xnqVVjCXZwS9XzA",
    decimals: 6,
    name: "USD Coin",
    symbol: "USDC",
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    extensions: {
      coingeckoId: "usd-coin",
      serumV3Usdt: "77quYg4MGneUdjgXCunt9GgM1usmrxKY31twEy3WHwcS",
      website: "https://www.centre.io/",
    },
  },
  {
    chainId: ENV.Devnet,
    address: "9NGDi2tZtNmCCp8SVLKNuGjuWAVwNF3Vap5tT8km5er9",
    decimals: 9,
    name: "USDT",
    symbol: "USDT",
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
    tags: ["stablecoin"],
    extensions: {
      coingeckoId: "tether",
      serumV3Usdc: "77quYg4MGneUdjgXCunt9GgM1usmrxKY31twEy3WHwcS",
      website: "https://tether.to/",
    },
  },
];
