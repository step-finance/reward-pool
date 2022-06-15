import * as anchor from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SingleFarming } from "../../target/types/single_farming";
import * as utils from "./utils";

let provider = anchor.AnchorProvider.env();

type Keypair = anchor.web3.Keypair;
type PublicKey = anchor.web3.PublicKey;

///user can be an admin or a staker. either way, call init - then can call other methods
export class User {
  id: number;
  keypair: Keypair;
  pubkey: PublicKey;
  provider: anchor.AnchorProvider;
  program: anchor.Program<SingleFarming>;
  initialLamports: number;
  stakingMintObject: Token;
  rewardMintObject: Token;
  stakingTokenAccount: PublicKey;
  rewardTokenAccount: PublicKey;
  poolPubkey: PublicKey;
  userPubkey: PublicKey;
  userNonce: number;

  constructor(a: number) {
    this.id = a;
  }

  async init(
    keypair: Keypair,
    initialLamports: number,
    stakingMint: PublicKey,
    initialMint: number,
    rewardMint: PublicKey
  ) {
    this.keypair = keypair;
    this.pubkey = this.keypair.publicKey;
    let envProvider = anchor.AnchorProvider.env();
    // envProvider.commitment = 'pending';

    await utils.sendLamports(envProvider, this.pubkey, initialLamports);
    this.provider = new anchor.AnchorProvider(
      envProvider.connection,
      new anchor.Wallet(this.keypair),
      envProvider.opts
    );

    let program = anchor.workspace.SingleFarming;
    this.program = new anchor.Program(
      program.idl,
      program.programId,
      this.provider
    );

    this.initialLamports = initialLamports;
    this.stakingMintObject = new Token(
      this.provider.connection,
      stakingMint,
      TOKEN_PROGRAM_ID,
      this.keypair
    );

    this.rewardMintObject = new Token(
      this.provider.connection,
      rewardMint,
      TOKEN_PROGRAM_ID,
      this.keypair
    );

    this.stakingTokenAccount = await utils.getOrCreateAssociatedTokenAccount(
      stakingMint,
      this.pubkey,
      this.keypair,
      this.provider
    );

    if (initialMint != 0) {
      await this.stakingMintObject.mintTo(
        this.stakingTokenAccount,
        // weird that it's not defined in the type definition, yet it exists
        // @ts-ignore
        envProvider.wallet.payer,
        [],
        initialMint
      );
    }

    this.rewardTokenAccount = await utils.getOrCreateAssociatedTokenAccount(
      rewardMint,
      this.pubkey,
      this.keypair,
      this.provider
    );
  }

  async initializePool(
    stakingMint: PublicKey,
    rewardMint: PublicKey,
    rewardDuration: anchor.BN,
    fundingAmount: anchor.BN
  ) {
    const [pool, _poolNonce] = await utils.computePoolAccount(stakingMint);

    const [stakingVault, _stakingVaultNonce] =
      await utils.computeStakingVaultAccount(pool);

    const [rewardVault, _rewardVaultNonce] =
      await utils.computeRewardVaultAccount(pool);

    await this.program.rpc.initializePool(rewardDuration, fundingAmount, {
      accounts: {
        pool: pool,
        stakingVault: stakingVault,
        stakingMint: stakingMint,
        rewardMint: rewardMint,
        rewardVault: rewardVault,
        admin: this.provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [this.keypair],
    });
    return pool;
  }

  async activateFarming(poolPubkey: PublicKey) {
    await this.program.rpc.activateFarming({
      accounts: {
        pool: poolPubkey,
        admin: this.provider.wallet.publicKey,
      },
      signers: [this.keypair],
    });
  }

  async createUserStakingAccount(poolPubkey: PublicKey) {
    this.poolPubkey = poolPubkey;

    const [_userPubkey, _userNonce] = await utils.computeUserAccount(
      this.provider.wallet.publicKey,
      poolPubkey
    );
    this.userPubkey = _userPubkey;
    this.userNonce = _userNonce;

    await this.program.rpc.createUser({
      accounts: {
        pool: poolPubkey,
        user: this.userPubkey,
        owner: this.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });
  }

  async getUserStakingInfo() {
    return this.program.account.user.fetch(this.userPubkey);
  }
  async getPoolInfo() {
    return this.program.account.pool.fetch(this.poolPubkey);
  }

  async depositTokensFull() {
    let poolObject = await this.program.account.pool.fetch(this.poolPubkey);
    await this.program.rpc.depositFull({
      accounts: {
        // Stake instance.
        pool: this.poolPubkey,
        stakingVault: poolObject.stakingVault,
        // User.
        user: this.userPubkey,
        owner: this.provider.wallet.publicKey,
        stakeFromAccount: this.stakingTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });
  }

  async depositTokens(amount: number) {
    let poolObject = await this.program.account.pool.fetch(this.poolPubkey);
    await this.program.rpc.deposit(new anchor.BN(amount), {
      accounts: {
        // Stake instance.
        pool: this.poolPubkey,
        stakingVault: poolObject.stakingVault,
        // User.
        user: this.userPubkey,
        owner: this.provider.wallet.publicKey,
        stakeFromAccount: this.stakingTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });
  }

  async withdrawTokens(amount: number) {
    let poolObject = await this.program.account.pool.fetch(this.poolPubkey);
    await this.program.rpc.withdraw(new anchor.BN(amount), {
      accounts: {
        // Stake instance.
        pool: this.poolPubkey,
        stakingVault: poolObject.stakingVault,
        // User.
        user: this.userPubkey,
        owner: this.provider.wallet.publicKey,
        stakeFromAccount: this.stakingTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });
  }

  async getUserPendingRewardsFunction(): Promise<anchor.BN> {
    let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

    const result = await this.program.methods
      .claim()
      .accounts({
        pool: this.poolPubkey,
        stakingVault: poolObject.stakingVault,
        rewardVault: poolObject.rewardVault,
        user: this.userPubkey,
        owner: this.provider.wallet.publicKey,
        rewardAccount: this.rewardTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.keypair])
      .simulate();

    const event = result.events[0];
    return event.data.value;
  }

  async claim() {
    let balanceBefore = await this.provider.connection.getTokenAccountBalance(
      this.rewardTokenAccount
    );
    let poolObject = await this.program.account.pool.fetch(this.poolPubkey);
    await this.program.rpc.claim({
      accounts: {
        pool: this.poolPubkey,
        stakingVault: poolObject.stakingVault,
        rewardVault: poolObject.rewardVault,
        user: this.userPubkey,
        owner: this.provider.wallet.publicKey,
        rewardAccount: this.rewardTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [this.keypair],
    });
    let balanceAfter = await this.provider.connection.getTokenAccountBalance(
      this.rewardTokenAccount
    );

    return new anchor.BN(balanceAfter.value.amount).sub(
      new anchor.BN(balanceBefore.value.amount)
    );
  }

  async fundReward(amount: number) {
    let envProvider = anchor.AnchorProvider.env();
    // envProvider.commitment = 'pending';
    let poolObject = await this.program.account.pool.fetch(this.poolPubkey);
    await this.rewardMintObject.mintTo(
      poolObject.rewardVault,
      // @ts-ignore
      envProvider.wallet.payer,
      [],
      amount
    );
  }

  async closeUser() {
    await this.program.rpc.closeUser({
      accounts: {
        // Stake instance.
        pool: this.poolPubkey,
        user: this.userPubkey,
        owner: this.provider.wallet.publicKey,
      },
    });
  }
}
