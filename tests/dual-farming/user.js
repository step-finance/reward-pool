const anchor = require("@project-serum/anchor");
const { TOKEN_PROGRAM_ID, Token, AccountLayout } = require("@solana/spl-token");
const utils = require("./utils");

async function claimForUsers(users) {
    //some eye piercing way to claim for all users async, then print out all users balances
    //if you're reading this, all we're effectively doing here is calling "claim()" on a user.
    let r = await Promise.all(
        users.map(a => a.claim().then(b => [a, b]))
    );
    console.log("--- users claimed ---")
    r.sort((a, b) => a[0].id < b[0].id)
        .forEach(a => {
            a[0].currentA = a[1][0];
            a[0].currentB = a[1][1];
            console.log(a[0].id, "amtA", a[0].currentA, "amtB", a[0].currentB);
        });
}

///user can be an admin or a staker. either way, call init - then can call other methods
class User {
    constructor(a) { this.id = a; }

    async init(initialLamports, xTokenMint, initialXToken, stakingMint, initialStaking, mintA, initialA, mintB, initialB) {
        this.keypair = new anchor.web3.Keypair();
        this.pubkey = this.keypair.publicKey;

        let envProvider = anchor.AnchorProvider.env();
        envProvider.commitment = 'pending';
        await utils.sendLamports(envProvider, this.pubkey, initialLamports);

        this.provider = new anchor.AnchorProvider(envProvider.connection, new anchor.Wallet(this.keypair), envProvider.opts);
        let program = anchor.workspace.DualFarming;
        this.program = new anchor.Program(program.idl, program.programId, this.provider);

        this.initialLamports = initialLamports;
        this.xTokenMintObject = new Token(this.provider.connection, xTokenMint, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.initialXToken = initialXToken;
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

        this.xTokenPubkey = await this.xTokenMintObject.createAssociatedTokenAccount(this.pubkey);
        if (initialXToken > 0) {
            await this.xTokenMintObject.mintTo(this.xTokenPubkey, envProvider.wallet.payer, [], initialXToken);
        }
        this.stakingPubkey = await this.stakingMintObject.createAssociatedTokenAccount(this.pubkey);
        if (initialStaking > 0) {
            await this.stakingMintObject.mintTo(this.stakingPubkey, envProvider.wallet.payer, [], initialStaking);
        }
        this.mintAPubkey = await this.mintAObject.createAssociatedTokenAccount(this.pubkey);
        if (initialA > 0) {
            await this.mintAObject.mintTo(this.mintAPubkey, envProvider.wallet.payer, [], initialA);
        }
        //single staking, will use same for each
        if (mintA != mintB) {
            this.mintBPubkey = await this.mintBObject.createAssociatedTokenAccount(this.pubkey);
            if (initialB > 0) {
                await this.mintBObject.mintTo(this.mintBPubkey, envProvider.wallet.payer, [], initialB);
            }
        } else {
            this.mintBPubkey = this.mintAPubkey;
        }
    }

    async initializePool(poolKeypair, rewardDuration, singleStake) {
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [poolKeypair.publicKey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;
        let poolNonce = _nonce;

        let xTokenPoolVault = await this.xTokenMintObject.createAccount(poolSigner);
        let stakingMintVault = await this.stakingMintObject.createAccount(poolSigner);
        let mintAVault = await this.mintAObject.createAccount(poolSigner);
        let mintBVault = null;
        if (!singleStake) {
            mintBVault = await this.mintBObject.createAccount(poolSigner);
        }

        this.poolPubkey = poolKeypair.publicKey;
        this.admin = {
            poolKeypair,
            poolSigner,
            poolNonce,
            xTokenPoolVault,
            stakingMintVault,
            mintAVault,
            mintBVault
        };

        await this.program.rpc.initializePool(
            poolNonce,
            rewardDuration,
            {
                accounts: {
                    authority: this.provider.wallet.publicKey,
                    xTokenPoolVault: xTokenPoolVault,
                    xTokenDepositor: this.xTokenPubkey,
                    xTokenDepositAuthority: this.provider.wallet.publicKey,
                    stakingMint: this.stakingMintObject.publicKey,
                    stakingVault: stakingMintVault,
                    rewardAMint: this.mintAObject.publicKey,
                    rewardAVault: mintAVault,
                    rewardBMint: singleStake ? this.mintAObject.publicKey : this.mintBObject.publicKey,
                    rewardBVault: singleStake ? mintAVault : mintBVault,
                    poolSigner: poolSigner,
                    pool: this.poolPubkey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
                signers: [poolKeypair],
                instructions: [
                    await this.program.account.pool.createInstruction(poolKeypair,),
                ],
            }
        );

        //console.log("tx", tx.instructions.map(a=>a.keys));

        //await this.provider.sendAndConfirm(tx);

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
                systemProgram: anchor.web3.SystemProgram.programId,
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

    async pausePool(authority) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.pause(
            {
                accounts: {
                    xTokenPoolVault: poolObject.xTokenPoolVault,
                    xTokenReceiver: this.xTokenPubkey,
                    pool: this.poolPubkey,
                    authority: authority ?? this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async unpausePool(authority) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        let xTokenPoolVault = await this.xTokenMintObject.createAccount(poolSigner);
        this.admin.xTokenPoolVault = xTokenPoolVault;

        await this.program.rpc.unpause(
            {
                accounts: {
                    xTokenPoolVault: xTokenPoolVault,
                    xTokenDepositor: this.xTokenPubkey,
                    xTokenDepositAuthority: this.provider.wallet.publicKey,
                    pool: this.poolPubkey,
                    authority: authority ?? this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
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

    async authorizeFunder(newFunder) {
        await this.program.rpc.authorizeFunder(
            newFunder,
            {
                accounts: {
                    pool: this.poolPubkey,
                    authority: this.provider.wallet.publicKey,
                },
            });
    }

    async deauthorizeFunder(oldFunder) {
        await this.program.rpc.deauthorizeFunder(
            oldFunder,
            {
                accounts: {
                    pool: this.poolPubkey,
                    authority: this.provider.wallet.publicKey,
                },
            });
    }

    async fund(amountA, amountB, poolPubkey) {
        let pubkeyToUse = poolPubkey ?? this.poolPubkey;
        let poolObject = await this.program.account.pool.fetch(pubkeyToUse);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [pubkeyToUse.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.fund(
            new anchor.BN(amountA),
            new anchor.BN(amountB),
            {
                accounts: {
                    // Stake instance.
                    pool: pubkeyToUse,
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

    async getUserPendingRewardsFunction() {
        return await User.getPendingRewardsFunction(this.program, this.poolPubkey);
    }

    // *returns a function* that when called returns an array of 2 values, the pending rewardA and rewardB
    // this function is accurate forever (even after pool ends), unless the pool is changed through
    // funding, or anyone staking/unstaking.
    // Querying the chain is only done on initial call (this method) to build the function.
    // Computations are done against current date/time every time the returned function is called; thus you
    //   could hook this up to a timer for a fancy UX.
    static async getPendingRewardsFunction(rewardsPoolAnchorProgram, rewardsPoolPubkey) {
        const SECONDS_IN_YEAR = new anchor.BN(365 * 24 * 60 * 60);
        const U64_MAX = new anchor.BN("18446744073709551615", 10);
        let poolObject = await rewardsPoolAnchorProgram.account.pool.fetch(rewardsPoolPubkey);
        let rewardAPerToken = new anchor.BN(poolObject.rewardAPerTokenStored);
        let rewardBPerToken = new anchor.BN(poolObject.rewardBPerTokenStored);
        let rewardARate = new anchor.BN(poolObject.rewardARate);
        let rewardBRate = new anchor.BN(poolObject.rewardBRate);
        let lastUpdate = poolObject.lastUpdateTime;
        var singleStaking = poolObject.rewardAMint.toString() == poolObject.rewardBMint.toString();

        let poolVersion = poolObject.version;

        let vaultBalance = await rewardsPoolAnchorProgram.provider.connection.getTokenAccountBalance(poolObject.stakingVault);
        vaultBalance = new anchor.BN(parseInt(vaultBalance.value.amount));

        //a function that gives the total rewards emitted over the whole pool since last update
        let fnAllRewardsPerToken = () => {
            var lastApplicable = Math.min(Math.floor(Date.now() / 1000), poolObject.rewardDurationEnd);
            var elapsed = new anchor.BN(lastApplicable - lastUpdate);
            var currentARewardPerToken = rewardAPerToken.add(elapsed.mul(rewardARate).mul(U64_MAX).div(poolVersion.v2 ? SECONDS_IN_YEAR : new anchor.BN(1)).div(vaultBalance));
            var currentBRewardPerToken;
            if (singleStaking) {
                currentBRewardPerToken = new anchor.BN(0);
            } else {
                currentBRewardPerToken = rewardBPerToken.add(elapsed.mul(rewardBRate).mul(U64_MAX).div(poolVersion.v2 ? SECONDS_IN_YEAR : new anchor.BN(1)).div(vaultBalance));
            }
            return [currentARewardPerToken, currentBRewardPerToken];
        };

        const [
            userPubkey, _userNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [rewardsPoolAnchorProgram.provider.wallet.publicKey.toBuffer(), rewardsPoolPubkey.toBuffer()],
            rewardsPoolAnchorProgram.programId
        );
        let userObject = await rewardsPoolAnchorProgram.account.user.fetch(userPubkey);
        let completeA = new anchor.BN(userObject.rewardAPerTokenComplete);
        let completeB = new anchor.BN(userObject.rewardBPerTokenComplete);
        let pendingA = new anchor.BN(userObject.rewardAPerTokenPending);
        let pendingB = new anchor.BN(userObject.rewardBPerTokenPending);
        let balanceStaked = new anchor.BN(userObject.balanceStaked);

        //a function that gives a user's total unclaimed rewards since last update
        let currentPending = () => {
            var rwds = fnAllRewardsPerToken();
            var a = balanceStaked.mul(rwds[0]).sub(completeA).div(U64_MAX).add(pendingA).toNumber();
            var b;
            if (singleStaking) {
                b = 0;
            } else {
                b = balanceStaked.mul(rwds[1]).sub(completeB).div(U64_MAX).add(pendingB).toNumber();
            }
            return [a, b];

        }

        return currentPending;
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

        return [
            amtA.value.uiAmount,
            this.mintAPubkey != this.mintBPubkey ? amtB.value.uiAmount : 0,
            poolObject.rewardARate,
            this.mintAPubkey != this.mintBPubkey ? poolObject.rewardBRate : new anchor.BN(0, 10),
        ];
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

        const [configPubkey, ___nonce] =
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
                    authority: this.provider.wallet.publicKey,
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
