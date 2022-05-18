## Programs
This repository contains 3 main programs:
- Staking: Stake MER earn xMER
- Single farming: Stake xMER farm other token
- Dual farming: Deposit LP tokens to get single or dual rewards

### Test

When testing locally, be sure to build with feature "local-testing" to enable the testing IDs.  You can do this by editing `programs/step-staking/Cargo.toml` and uncommenting the default feature set line.

```
anchor test -- --features dev
```

## Branches and Tags
- New development happens on `main`.
- Release tags have names like `v4.0.0`.