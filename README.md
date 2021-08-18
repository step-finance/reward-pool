# Reward Pool

Program for staking and receiving rewards. For a technical introduction, see the [docs](./docs).

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
