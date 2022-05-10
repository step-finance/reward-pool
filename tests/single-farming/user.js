const anchor = require("@project-serum/anchor");
const { TOKEN_PROGRAM_ID, Token, AccountLayout } = require("@solana/spl-token");
const utils = require("./utils");



///user can be an admin or a staker. either way, call init - then can call other methods
class User {
    constructor(a) { this.id = a; }

    async init(keypair, initialLamports, stakingMint, initialMint, rewardMint) {
        this.keypair = keypair;
        this.pubkey = this.keypair.publicKey;
        let envProvider = anchor.AnchorProvider.env();
        // envProvider.commitment = 'pending';

        await utils.sendLamports(envProvider, this.pubkey, initialLamports);
        this.provider = new anchor.AnchorProvider(envProvider.connection, new anchor.Wallet(this.keypair), envProvider.opts);

        let program = anchor.workspace.RewardPool;
        this.program = new anchor.Program(program.idl, program.programId, this.provider);


        this.initialLamports = initialLamports;
        this.stakingMintObject = new Token(this.provider.connection, stakingMint, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.rewardMintObject = new Token(this.provider.connection, rewardMint, TOKEN_PROGRAM_ID, this.provider.wallet.payer);

        this.stakingTokenAccount = await utils.getOrCreateAssociatedTokenAccount(stakingMint, this.pubkey, this.keypair, this.provider);
        if (initialMint != 0) {
            await this.stakingMintObject.mintTo(this.stakingTokenAccount, envProvider.wallet.payer, [], initialMint);
        }

        this.rewardTokenAccount = await utils.getOrCreateAssociatedTokenAccount(rewardMint, this.pubkey, this.keypair, this.provider);
    }

    async initializePool(stakingMint, rewardMint, rewardStartTimestamp, rewardDuration, fundingAmount) {
        const [
            pool,
            poolNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("pool"), stakingMint.toBuffer()],
            this.program.programId
        );

        const [
            stakingVault,
            stakingVaultNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("staking_vault"), pool.toBuffer()],
            this.program.programId
        );

        const [
            rewardVault,
            rewardVaultNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("reward_vault"), pool.toBuffer()],
            this.program.programId
        );
        await this.program.rpc.initializePool(
            poolNonce,
            rewardStartTimestamp,
            rewardDuration,
            fundingAmount,
            {
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
            }
        );
        return pool
    }

    async createUserStakingAccount(poolPubkey) {
        this.poolPubkey = poolPubkey;

        const [
            _userPubkey, _userNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.provider.wallet.publicKey.toBuffer(), poolPubkey.toBuffer()],
            this.program.programId
        );
        this.userPubkey = _userPubkey;
        this.userNonce = _userNonce;

        await this.program.rpc.createUser(this.userNonce, {
            accounts: {
                pool: poolPubkey,
                user: this.userPubkey,
                owner: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async stakeTokens(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);
        await this.program.rpc.stake(
            new anchor.BN(amount),
            {
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
            }
        );
    }

    async unstakeTokens(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);
        await this.program.rpc.unstake(
            new anchor.BN(amount),
            {
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

    async getUserPendingRewardsFunction() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const result = await this.program.methods.claim().accounts({
            pool: this.poolPubkey,
            stakingVault: poolObject.stakingVault,
            rewardVault: poolObject.rewardVault,
            user: this.userPubkey,
            owner: this.provider.wallet.publicKey,
            rewardAccount: this.rewardTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
        }).signers([this.keypair])
            .simulate();

        console.log("result: ", result);

        const event = result.events[0];
        return event.data.value;
    }

    async claim() {
        let balanceBefore = await this.provider.connection.getTokenAccountBalance(this.rewardTokenAccount);
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);
        const result = await this.program.rpc.claim({
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
        let balanceAfter = await this.provider.connection.getTokenAccountBalance(this.rewardTokenAccount);

        return balanceAfter.value.amount - balanceBefore.value.amount;
    }

    async fundReward(amount) {
        let envProvider = anchor.AnchorProvider.env();
        // envProvider.commitment = 'pending';
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);
        await this.rewardMintObject.mintTo(poolObject.rewardVault, envProvider.wallet.payer, [], amount);
    }

    async closeUser() {
        await this.program.rpc.closeUser(
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                },
            });
    }
}

module.exports = {
    User
};
