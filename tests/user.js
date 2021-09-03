const anchor = require("@project-serum/anchor");
const { TOKEN_PROGRAM_ID, Token, AccountLayout } = require("@solana/spl-token");
const utils = require("./utils");

///user can be an admin or a staker. either way, call init - then can call other methods
class User {
    constructor() { }

    async init(initialLamports, stakingMint, initialStaking, mintA, initialA, mintB, initialB) {
        this.keypair = new anchor.web3.Keypair();
        this.pubkey = this.keypair.publicKey;

        let envProvider = anchor.Provider.env();
        await utils.sendLamports(envProvider, this.pubkey, initialLamports);

        this.provider = new anchor.Provider(envProvider.connection, new anchor.Wallet(this.keypair), envProvider.opts);
        let program = anchor.workspace.RewardPool;
        this.program = new anchor.Program(program.idl, program.programId, this.provider);

        this.initialLamports = initialLamports;
        this.stakingMintObject = new Token(this.provider.connection, stakingMint, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.initialStaking = initialStaking;
        this.mintAObject = new Token(this.provider.connection, mintA, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.initialA = initialA;
        this.mintBObject = new Token(this.provider.connection, mintB, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.initialB = initialB;

        this.poolPubkey = null;
        this.userPubkey = null;
        this.userNonce = null;
        this.rewardPoolTokenPubkey = null;
        this.rewardPoolMintObject = null;

        if (initialStaking > 0) {
            this.stakingPubkey = await this.stakingMintObject.createAssociatedTokenAccount(this.pubkey);
            await this.stakingMintObject.mintTo(this.stakingPubkey, envProvider.wallet.payer, [], initialStaking);
        }
        if (initialA > 0) {
            this.mintAPubkey = await this.mintAObject.createAssociatedTokenAccount(this.pubkey);
            await this.mintAObject.mintTo(this.mintAPubkey, envProvider.wallet.payer, [], initialA);
        }
        if (initialB > 0) {
            this.mintBPubkey = await this.mintBObject.createAssociatedTokenAccount(this.pubkey);
            await this.mintBObject.mintTo(this.mintBPubkey, envProvider.wallet.payer, [], initialB);
        }
    }

    async initializePool(poolKeypair, rewardDuration) {
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [poolKeypair.publicKey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;
        let nonce = _nonce;
        this.rewardPoolMintObject = await Token.createMint(
            this.provider.connection,
            this.provider.wallet.payer,
            poolSigner,
            null,
            9,
            TOKEN_PROGRAM_ID
        );

        let stakingMintVault = await this.stakingMintObject.createAccount(poolSigner);
        let mintAVault = await this.mintAObject.createAccount(poolSigner);
        let mintBVault = await this.mintBObject.createAccount(poolSigner);

        this.poolPubkey = poolKeypair.publicKey,
            this.admin = {
                poolKeypair,
                poolSigner,
                nonce,
                stakingMintVault,
                mintAVault,
                mintBVault
            };

        let tx = await this.program.rpc.initialize(
            this.provider.wallet.publicKey,
            nonce,
            this.stakingMintObject.publicKey,
            stakingMintVault,
            this.mintAObject.publicKey,
            mintAVault,
            this.mintBObject.publicKey,
            mintBVault,
            rewardDuration,
            {
                accounts: {
                    pool: this.poolPubkey,
                    rewardPoolMint: this.rewardPoolMintObject.publicKey,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                },
                signers: [poolKeypair],
                instructions: [
                    await this.program.account.pool.createInstruction(poolKeypair),
                ],
            }
        );

        //console.log("tx", tx.instructions.map(a=>a.keys));

        //await this.provider.send(tx);

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

        //lookup the reward account this way, like a user would
        let poolObject = await this.program.account.pool.fetch(poolPubkey);
        let rewardPoolMint = poolObject.rewardPoolMint;

        this.rewardPoolMintObject = new Token(this.provider.connection, rewardPoolMint, TOKEN_PROGRAM_ID, this.provider.wallet.payer);

        let rewardPoolTokenKeypair = anchor.web3.Keypair.generate();
        this.rewardPoolTokenPubkey = rewardPoolTokenKeypair.publicKey;

        const balanceNeeded = await Token.getMinBalanceRentForExemptAccount(this.provider.connection);

        await this.program.rpc.createUser(this.userNonce, {
            accounts: {
                pool: poolPubkey,
                user: this.userPubkey,
                owner: this.provider.wallet.publicKey,
                rewardPoolToken: this.rewardPoolTokenPubkey,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            },
            instructions: [
                anchor.web3.SystemProgram.createAccount({
                    fromPubkey: this.provider.wallet.publicKey,
                    newAccountPubkey: this.rewardPoolTokenPubkey,
                    lamports: balanceNeeded,
                    space: AccountLayout.span,
                    programId: TOKEN_PROGRAM_ID,
                }),
                Token.createInitAccountInstruction(
                    TOKEN_PROGRAM_ID,
                    rewardPoolMint,
                    this.rewardPoolTokenPubkey,
                    this.userPubkey,
                ),
            ],
            signers: [rewardPoolTokenKeypair]
        });
    }

    async stakeTokens(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);
        let userObject = await this.program.account.user.fetch(this.userPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.stake(
            new anchor.BN(amount),
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    rewardPoolMint: poolObject.rewardPoolMint,
                    rewardAMint: poolObject.rewardAMint,
                    rewardBMint: poolObject.rewardBMint,
                    stakingVault: poolObject.stakingVault,
                    // User.
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                    rewardPoolToken: userObject.rewardPoolToken,
                    stakeFromAccount: this.stakingPubkey,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });
    }

    async pausePool(isPaused, authority) {
        await this.program.rpc.pause(
            isPaused,
            {
                accounts: {
                    pool: this.poolPubkey,
                    authority: authority ?? this.provider.wallet.publicKey,
                },
            });
    }

    async unstakeTokens(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);
        let userObject = await this.program.account.user.fetch(this.userPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.unstake(
            new anchor.BN(amount),
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    rewardPoolMint: poolObject.rewardPoolMint,
                    rewardAMint: poolObject.rewardAMint,
                    rewardBMint: poolObject.rewardBMint,
                    stakingVault: poolObject.stakingVault,
                    // User.
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                    rewardPoolToken: userObject.rewardPoolToken,
                    stakeFromAccount: this.stakingPubkey,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });
    }

    async fund(amountA, amountB) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.fund(
            new anchor.BN(amountA),
            new anchor.BN(amountB),
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    rewardPoolMint: poolObject.rewardPoolMint,
                    rewardAMint: poolObject.rewardAMint,
                    rewardBMint: poolObject.rewardBMint,
                    stakingVault: poolObject.stakingVault,
                    rewardAVault: poolObject.rewardAVault,
                    rewardBVault: poolObject.rewardBVault,
                    funder: this.provider.wallet.publicKey,
                    fromA: this.mintAPubkey,
                    fromB: this.mintBPubkey,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });
    }
}

module.exports = {
    User
};