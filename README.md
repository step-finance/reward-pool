<h1 align="center">
  <br>
   <img width="400" src="https://github.com/step-finance/reward-pool/blob/main/logo.svg?raw=true" alt="step logo"/>
  <br>
</h1>

[![CircleCI](https://circleci.com/gh/step-finance/reward-pool/tree/main.svg?style=svg)](https://circleci.com/gh/step-finance/reward-pool/tree/main)

# Reward Pool

Program for staking and receiving rewards. 

## Design Overview

![reward pool account overview](https://github.com/step-finance/reward-pool/blob/main/account-design.png)

*draw.io editable*

## Note

- **This code is unaudited. Use at your own risk.**

## Developing

[Anchor](https://github.com/project-serum/anchor) is used for developoment, and it's
recommended workflow is used here. To get started, see the [guide](https://project-serum.github.io/anchor/getting-started/introduction.html).

### Build

```
anchor build --verifiable
```

The `--verifiable` flag should be used before deploying so that your build artifacts
can be deterministically generated with docker.

### Test

When testing locally, be sure to build with feature "local-testing" to enable the testing IDs.  You can do this by editing `programs/step-staking/Cargo.toml` and uncommenting the default feature set line.

```
anchor test
```

### Verify

To verify the program deployed on Solana matches your local source code, change directory
into the program you want to verify, e.g., `cd program`, and run

```bash
anchor verify <program-id | write-buffer>
```

A list of build artifacts can be found under [releases](https://github.com/step-finance/reward-pool/releases).

### Deploy

To deploy the program, configure your CLI to the desired network/wallet and run 

```bash
solana program deploy --programid <keypair> target/verifiable/reward_pool.so
```

I would not suggest using anchor deploy at this time; it wouldn't/couldn't really add much value.  Be sure to use `--programid <keypair>` to deploy to the correct address.

Note: By default, programs are deployed to accounts that are twice the size of the original deployment. Doing so leaves room for program growth in future redeployments. For this program, I beleive that's proper - I wouldn't want to limit  further, but I do see some possibility for growth, but not beyond double.

### Initial Migration

There is no initial migration required with this program.