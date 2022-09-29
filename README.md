## Programs
This repository contains 3 main programs:
- Locking: Lock MER get xMER (ratio is 1:1)
- Staking: Stake xMER farm xMER + JUP
- Farming: Deposit LP tokens to get xMER and other tokens

## Test
```
anchor test -- --features devnet
```

## Build
```
[Devnet]
anchor build -- --features devnet

[Mainnet]
anchor build
```

## Branches and Tags
- New development happens on `main`.
- Release tags have names like `v4.0.0`.