const anchor = require("@project-serum/anchor");
const { TOKEN_PROGRAM_ID, Token, AccountLayout } = require("@solana/spl-token");
const utils = require("./utils");

async function claimForUsers(users) {
    //some eye piercing way to claim for all users async, then print out all users balances
    //if you're reading this, all we're effectively doing here is calling "claim()" on a user.
    let r = await Promise.all(
      users.map(a => a.claim().then(b=>[a,b]))
    );
    console.log("--- users claimed ---")
    r.sort((a,b)=>a[0].id < b[0].id)
        .forEach(a=>{
            a[0].currentA = a[1][0];
            a[0].currentB = a[1][1];
            console.log(a[0].id, "amtA", a[0].currentA, "amtB", a[0].currentB);
        });
}

///user can be an admin or a staker. either way, call init - then can call other methods
class User {
    constructor(a) { this.id = a; }

    async init(initialLamports, authMint, shouldAuth, stakingMint, initialStaking, mintA, initialA, mintB, initialB) {
        this.keypair = new anchor.web3.Keypair();
        this.pubkey = this.keypair.publicKey;

        let envProvider = anchor.Provider.env();
        await utils.sendLamports(envProvider, this.pubkey, initialLamports);

        this.provider = new anchor.Provider(envProvider.connection, new anchor.Wallet(this.keypair), envProvider.opts);
        let program = anchor.workspace.RewardPool;
        this.program = new anchor.Program(program.idl, program.programId, this.provider);

        this.initialLamports = initialLamports;
        this.authMintObject = new Token(this.provider.connection, authMint, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.shouldAuth = shouldAuth;
        this.stakingMintObject = new Token(this.provider.connection, stakingMint, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.initialStaking = initialStaking;
        this.mintAObject = new Token(this.provider.connection, mintA, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.initialA = initialA;
        this.mintBObject = new Token(this.provider.connection, mintB, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.initialB = initialB;

        this.poolPubkey = null;
        this.userPubkey = null;
        this.userNonce = null;
        this.lpPubkey = null;

        this.authPubkey = await this.authMintObject.createAssociatedTokenAccount(this.pubkey);
        if (shouldAuth) {
            await this.authMintObject.mintTo(this.authPubkey, envProvider.wallet.payer, [], 1);
        }
        this.stakingPubkey = await this.stakingMintObject.createAssociatedTokenAccount(this.pubkey);
        if (initialStaking > 0) {
            await this.stakingMintObject.mintTo(this.stakingPubkey, envProvider.wallet.payer, [], initialStaking);
        }
        this.mintAPubkey = await this.mintAObject.createAssociatedTokenAccount(this.pubkey);
        if (initialA > 0) {
            await this.mintAObject.mintTo(this.mintAPubkey, envProvider.wallet.payer, [], initialA);
        }
        this.mintBPubkey = await this.mintBObject.createAssociatedTokenAccount(this.pubkey);
        if (initialB > 0) {
            await this.mintBObject.mintTo(this.mintBPubkey, envProvider.wallet.payer, [], initialB);
        }
    }

    async initializePool(poolKeypair, rewardDuration) {
        const [ configPubkey, ___nonce] = 
            await anchor.web3.PublicKey.findProgramAddress(
                [Buffer.from("config")], 
                this.program.programId
            );
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [poolKeypair.publicKey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;
        let nonce = _nonce;

        let stakingMintVault = await this.stakingMintObject.createAccount(poolSigner);
        let mintAVault = await this.mintAObject.createAccount(poolSigner);
        let mintBVault = await this.mintBObject.createAccount(poolSigner);

        this.poolPubkey = poolKeypair.publicKey;
        this.admin = {
            poolKeypair,
            poolSigner,
            nonce,
            stakingMintVault,
            mintAVault,
            mintBVault
        };

        await this.program.rpc.initializePool(
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
                    config: configPubkey,
                    authorityTokenAccount: this.authPubkey,
                    authorityTokenOwner: this.provider.wallet.publicKey,
                    pool: this.poolPubkey,
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

        const balanceNeeded = await Token.getMinBalanceRentForExemptAccount(this.provider.connection);

        await this.program.rpc.createUser(this.userNonce, {
            accounts: {
                pool: poolPubkey,
                user: this.userPubkey,
                owner: this.provider.wallet.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            },
        });
    }

    async stakeTokens(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

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
                    stakingVault: poolObject.stakingVault,
                    // User.
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                    stakeFromAccount: this.stakingPubkey,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
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
                    stakingVault: poolObject.stakingVault,
                    // User.
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
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

    async claim() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.claim({
            accounts: {
                // Stake instance.
                pool: this.poolPubkey,
                stakingVault: poolObject.stakingVault,
                rewardAVault: poolObject.rewardAVault,
                rewardBVault: poolObject.rewardBVault,
                // User.
                user: this.userPubkey,
                owner: this.provider.wallet.publicKey,
                rewardAAccount: this.mintAPubkey,
                rewardBAccount: this.mintBPubkey,
                // Program signers.
                poolSigner,
                // Misc.
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
        });

        let amtA = await this.provider.connection.getTokenAccountBalance(this.mintAPubkey);
        let amtB = await this.provider.connection.getTokenAccountBalance(this.mintBPubkey);

        return [amtA.value.uiAmount, amtB.value.uiAmount];
    }

    //a transaction to stake, claim, unstake all at once - should net nothing
    async snipe(amount) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        let ixStake = this.program.instruction.stake(
            new anchor.BN(amount),
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    stakingVault: poolObject.stakingVault,
                    // User.
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                    stakeFromAccount: this.stakingPubkey,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );

        let ixClaim = this.program.instruction.claim({
            accounts: {
                // Stake instance.
                pool: this.poolPubkey,
                stakingVault: poolObject.stakingVault,
                rewardAVault: poolObject.rewardAVault,
                rewardBVault: poolObject.rewardBVault,
                // User.
                user: this.userPubkey,
                owner: this.provider.wallet.publicKey,
                rewardAAccount: this.mintAPubkey,
                rewardBAccount: this.mintBPubkey,
                // Program signers.
                poolSigner,
                // Misc.
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
        });
        
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
                    stakeFromAccount: this.stakingPubkey,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
                instructions: [
                    ixStake,
                    ixClaim,
                ]
            }
        );

        let amtA = await this.provider.connection.getTokenAccountBalance(this.mintAPubkey);
        let amtB = await this.provider.connection.getTokenAccountBalance(this.mintBPubkey);

        return [amtA.value.uiAmount, amtB.value.uiAmount];
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

    async closePool() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [ configPubkey, ___nonce] = 
            await anchor.web3.PublicKey.findProgramAddress(
                [Buffer.from("config")], 
                this.program.programId
            );

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;
        let nonce = _nonce;

        await this.program.rpc.closePool(
            {
                accounts: {
                    // Stake instance.
                    config: configPubkey,
                    authorityTokenAccount: this.authPubkey,
                    authorityTokenOwner: this.provider.wallet.publicKey,
                    refundee: this.provider.wallet.publicKey,
                    stakingRefundee: this.stakingPubkey,
                    rewardARefundee: this.mintAPubkey,
                    rewardBRefundee: this.mintBPubkey,
                    pool: this.poolPubkey,
                    stakingVault: poolObject.stakingVault,
                    rewardAVault: poolObject.rewardAVault,
                    rewardBVault: poolObject.rewardBVault,
                    poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });
    }
}

module.exports = {
    claimForUsers,
    User
};