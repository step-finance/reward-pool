"use strict";Object.defineProperty(exports, "__esModule", {value: true});var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/farm.ts
var _anchor = require('@coral-xyz/anchor');
var _spltoken = require('@solana/spl-token');




var _web3js = require('@solana/web3.js');

// src/utils.ts








// src/farming-idl.ts
var IDL = {
  version: "0.2.0",
  name: "farming",
  instructions: [
    {
      name: "initializePool",
      accounts: [
        {
          name: "pool",
          isMut: true,
          isSigner: false
        },
        {
          name: "stakingMint",
          isMut: false,
          isSigner: false
        },
        {
          name: "stakingVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "rewardAMint",
          isMut: false,
          isSigner: false
        },
        {
          name: "rewardAVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "rewardBMint",
          isMut: false,
          isSigner: false
        },
        {
          name: "rewardBVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "authority",
          isMut: true,
          isSigner: true
        },
        {
          name: "base",
          isMut: false,
          isSigner: true
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "tokenProgram",
          isMut: false,
          isSigner: false
        },
        {
          name: "rent",
          isMut: false,
          isSigner: false
        }
      ],
      args: [
        {
          name: "rewardDuration",
          type: "u64"
        }
      ]
    },
    {
      name: "createUser",
      accounts: [
        {
          name: "pool",
          isMut: true,
          isSigner: false
        },
        {
          name: "user",
          isMut: true,
          isSigner: false
        },
        {
          name: "owner",
          isMut: true,
          isSigner: true
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false
        }
      ],
      args: []
    },
    {
      name: "pause",
      accounts: [
        {
          name: "pool",
          isMut: true,
          isSigner: false
        },
        {
          name: "authority",
          isMut: false,
          isSigner: true
        }
      ],
      args: []
    },
    {
      name: "unpause",
      accounts: [
        {
          name: "pool",
          isMut: true,
          isSigner: false
        },
        {
          name: "authority",
          isMut: false,
          isSigner: true
        }
      ],
      args: []
    },
    {
      name: "deposit",
      accounts: [
        {
          name: "pool",
          isMut: true,
          isSigner: false
        },
        {
          name: "stakingVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "user",
          isMut: true,
          isSigner: false
        },
        {
          name: "owner",
          isMut: false,
          isSigner: true
        },
        {
          name: "stakeFromAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "tokenProgram",
          isMut: false,
          isSigner: false
        }
      ],
      args: [
        {
          name: "amount",
          type: "u64"
        }
      ]
    },
    {
      name: "withdraw",
      accounts: [
        {
          name: "pool",
          isMut: true,
          isSigner: false
        },
        {
          name: "stakingVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "user",
          isMut: true,
          isSigner: false
        },
        {
          name: "owner",
          isMut: false,
          isSigner: true
        },
        {
          name: "stakeFromAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "tokenProgram",
          isMut: false,
          isSigner: false
        }
      ],
      args: [
        {
          name: "sptAmount",
          type: "u64"
        }
      ]
    },
    {
      name: "authorizeFunder",
      accounts: [
        {
          name: "pool",
          isMut: true,
          isSigner: false
        },
        {
          name: "authority",
          isMut: false,
          isSigner: true
        }
      ],
      args: [
        {
          name: "funderToAdd",
          type: "publicKey"
        }
      ]
    },
    {
      name: "deauthorizeFunder",
      accounts: [
        {
          name: "pool",
          isMut: true,
          isSigner: false
        },
        {
          name: "authority",
          isMut: false,
          isSigner: true
        }
      ],
      args: [
        {
          name: "funderToRemove",
          type: "publicKey"
        }
      ]
    },
    {
      name: "fund",
      accounts: [
        {
          name: "pool",
          isMut: true,
          isSigner: false
        },
        {
          name: "stakingVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "rewardAVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "rewardBVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "funder",
          isMut: false,
          isSigner: true
        },
        {
          name: "fromA",
          isMut: true,
          isSigner: false
        },
        {
          name: "fromB",
          isMut: true,
          isSigner: false
        },
        {
          name: "tokenProgram",
          isMut: false,
          isSigner: false
        }
      ],
      args: [
        {
          name: "amountA",
          type: "u64"
        },
        {
          name: "amountB",
          type: "u64"
        }
      ]
    },
    {
      name: "claim",
      accounts: [
        {
          name: "pool",
          isMut: true,
          isSigner: false
        },
        {
          name: "stakingVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "rewardAVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "rewardBVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "user",
          isMut: true,
          isSigner: false
        },
        {
          name: "owner",
          isMut: false,
          isSigner: true
        },
        {
          name: "rewardAAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "rewardBAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "tokenProgram",
          isMut: false,
          isSigner: false
        }
      ],
      args: []
    },
    {
      name: "withdrawExtraToken",
      accounts: [
        {
          name: "pool",
          isMut: false,
          isSigner: false
        },
        {
          name: "stakingVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "withdrawToAccount",
          isMut: true,
          isSigner: false
        },
        {
          name: "authority",
          isMut: false,
          isSigner: true
        },
        {
          name: "tokenProgram",
          isMut: false,
          isSigner: false
        }
      ],
      args: []
    },
    {
      name: "closeUser",
      accounts: [
        {
          name: "pool",
          isMut: true,
          isSigner: false
        },
        {
          name: "user",
          isMut: true,
          isSigner: false
        },
        {
          name: "owner",
          isMut: true,
          isSigner: true
        }
      ],
      args: []
    },
    {
      name: "closePool",
      accounts: [
        {
          name: "refundee",
          isMut: true,
          isSigner: false
        },
        {
          name: "stakingRefundee",
          isMut: true,
          isSigner: false
        },
        {
          name: "rewardARefundee",
          isMut: true,
          isSigner: false
        },
        {
          name: "rewardBRefundee",
          isMut: true,
          isSigner: false
        },
        {
          name: "pool",
          isMut: true,
          isSigner: false
        },
        {
          name: "authority",
          isMut: false,
          isSigner: true
        },
        {
          name: "stakingVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "rewardAVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "rewardBVault",
          isMut: true,
          isSigner: false
        },
        {
          name: "tokenProgram",
          isMut: false,
          isSigner: false
        }
      ],
      args: []
    }
  ],
  accounts: [
    {
      name: "pool",
      type: {
        kind: "struct",
        fields: [
          {
            name: "authority",
            type: "publicKey"
          },
          {
            name: "paused",
            type: "bool"
          },
          {
            name: "stakingMint",
            type: "publicKey"
          },
          {
            name: "stakingVault",
            type: "publicKey"
          },
          {
            name: "rewardAMint",
            type: "publicKey"
          },
          {
            name: "rewardAVault",
            type: "publicKey"
          },
          {
            name: "rewardBMint",
            type: "publicKey"
          },
          {
            name: "rewardBVault",
            type: "publicKey"
          },
          {
            name: "baseKey",
            type: "publicKey"
          },
          {
            name: "rewardDuration",
            type: "u64"
          },
          {
            name: "rewardDurationEnd",
            type: "u64"
          },
          {
            name: "lastUpdateTime",
            type: "u64"
          },
          {
            name: "rewardARate",
            type: "u64"
          },
          {
            name: "rewardBRate",
            type: "u64"
          },
          {
            name: "rewardAPerTokenStored",
            type: "u128"
          },
          {
            name: "rewardBPerTokenStored",
            type: "u128"
          },
          {
            name: "userStakeCount",
            type: "u32"
          },
          {
            name: "funders",
            type: {
              array: ["publicKey", 4]
            }
          },
          {
            name: "poolBump",
            type: "u8"
          },
          {
            name: "totalStaked",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "user",
      type: {
        kind: "struct",
        fields: [
          {
            name: "pool",
            type: "publicKey"
          },
          {
            name: "owner",
            type: "publicKey"
          },
          {
            name: "rewardAPerTokenComplete",
            type: "u128"
          },
          {
            name: "rewardBPerTokenComplete",
            type: "u128"
          },
          {
            name: "rewardAPerTokenPending",
            type: "u64"
          },
          {
            name: "rewardBPerTokenPending",
            type: "u64"
          },
          {
            name: "balanceStaked",
            type: "u64"
          },
          {
            name: "nonce",
            type: "u8"
          }
        ]
      }
    }
  ],
  events: [
    {
      name: "EventDeposit",
      fields: [
        {
          name: "amount",
          type: "u64",
          index: false
        }
      ]
    },
    {
      name: "EventWithdraw",
      fields: [
        {
          name: "amount",
          type: "u64",
          index: false
        }
      ]
    },
    {
      name: "EventFund",
      fields: [
        {
          name: "amountA",
          type: "u64",
          index: false
        },
        {
          name: "amountB",
          type: "u64",
          index: false
        }
      ]
    },
    {
      name: "EventClaim",
      fields: [
        {
          name: "amountA",
          type: "u64",
          index: false
        },
        {
          name: "amountB",
          type: "u64",
          index: false
        }
      ]
    },
    {
      name: "EventAuthorizeFunder",
      fields: [
        {
          name: "newFunder",
          type: "publicKey",
          index: false
        }
      ]
    },
    {
      name: "EventUnauthorizeFunder",
      fields: [
        {
          name: "funder",
          type: "publicKey",
          index: false
        }
      ]
    }
  ],
  errors: [
    {
      code: 6e3,
      name: "InsufficientFundWithdraw",
      msg: "Insufficient funds to withdraw."
    },
    {
      code: 6001,
      name: "AmountMustBeGreaterThanZero",
      msg: "Amount must be greater than zero."
    },
    {
      code: 6002,
      name: "SingleDepositTokenBCannotBeFunded",
      msg: "Reward B cannot be funded - pool is single deposit."
    },
    {
      code: 6003,
      name: "PoolPaused",
      msg: "Pool is paused."
    },
    {
      code: 6004,
      name: "DurationTooShort",
      msg: "Duration cannot be shorter than one day."
    },
    {
      code: 6005,
      name: "FunderAlreadyAuthorized",
      msg: "Provided funder is already authorized to fund."
    },
    {
      code: 6006,
      name: "MaxFunders",
      msg: "Maximum funders already authorized."
    },
    {
      code: 6007,
      name: "CannotDeauthorizePoolAuthority",
      msg: "Cannot deauthorize the primary pool authority."
    },
    {
      code: 6008,
      name: "CannotDeauthorizeMissingAuthority",
      msg: "Authority not found for deauthorization."
    },
    {
      code: 6009,
      name: "MathOverflow",
      msg: "Math operation overflow"
    }
  ]
};

// src/utils.ts
var FARM_PROGRAM_ID = new (0, _web3js.PublicKey)(
  "FarmuwXPWXvefWUeqFAa5w6rifLkq5X6E8bimYvrhCB1"
);
var getFarmProgram = (connection) => {
  const provider = new (0, _anchor.AnchorProvider)(
    connection,
    {},
    _anchor.AnchorProvider.defaultOptions()
  );
  const program = new (0, _anchor.Program)(IDL, FARM_PROGRAM_ID, provider);
  return { provider, program };
};
var SIMULATION_USER = new (0, _web3js.PublicKey)(
  "HrY9qR5TiB2xPzzvbBu5KrBorMfYGQXh9osXydz4jy9s"
);
var parseLogs = (eventParser, logs) => {
  if (!logs.length)
    throw new Error("No logs found");
  for (const event of eventParser == null ? void 0 : eventParser.parseLogs(logs)) {
    return event.data;
  }
  throw new Error("No events found");
};
var getOrCreateATAInstruction = (tokenMint, owner, connection) => __async(void 0, null, function* () {
  let toAccount;
  try {
    toAccount = yield _spltoken.Token.getAssociatedTokenAddress(
      _spltoken.ASSOCIATED_TOKEN_PROGRAM_ID,
      _spltoken.TOKEN_PROGRAM_ID,
      tokenMint,
      owner
    );
    const account = yield connection.getAccountInfo(toAccount);
    if (!account) {
      const ix = _spltoken.Token.createAssociatedTokenAccountInstruction(
        _spltoken.ASSOCIATED_TOKEN_PROGRAM_ID,
        _spltoken.TOKEN_PROGRAM_ID,
        tokenMint,
        toAccount,
        owner,
        owner
      );
      return [toAccount, ix];
    }
    return [toAccount, void 0];
  } catch (e) {
    console.error("Error::getOrCreateATAInstruction", e);
    throw e;
  }
});
function chunks(array, size) {
  return Array.apply(0, new Array(Math.ceil(array.length / size))).map(
    (_, index) => array.slice(index * size, (index + 1) * size)
  );
}

// src/farm.ts
var chunkedFetchMultipleUserAccount = (program, pks, chunkSize = 100) => __async(void 0, null, function* () {
  const accounts = (yield Promise.all(
    chunks(pks, chunkSize).map(
      (chunk) => program.account.user.fetchMultiple(chunk)
    )
  )).flat();
  return accounts.filter(Boolean);
});
var chunkedFetchMultiplePoolAccount = (program, pks, chunkSize = 100) => __async(void 0, null, function* () {
  const accounts = (yield Promise.all(
    chunks(pks, chunkSize).map(
      (chunk) => program.account.pool.fetchMultiple(chunk)
    )
  )).flat();
  return accounts.filter(Boolean);
});
var getAllPoolState = (farmMints, program) => __async(void 0, null, function* () {
  const poolStates = yield chunkedFetchMultiplePoolAccount(
    program,
    farmMints
  );
  return poolStates;
});
var MAX_CLAIM_ALL_ALLOWED = 2;
var PoolFarmImpl = class _PoolFarmImpl {
  constructor(address, program, eventParser, poolState, opt) {
    this.address = address;
    this.program = program;
    this.eventParser = eventParser;
    this.poolState = poolState;
    this.opt = {
      cluster: "mainnet-beta"
    };
    this.opt = opt;
  }
  static createMultiple(connection, farmList, opt) {
    return __async(this, null, function* () {
      var _a;
      const cluster = (_a = opt == null ? void 0 : opt.cluster) != null ? _a : "mainnet-beta";
      const { program } = getFarmProgram(connection);
      const eventParser = new (0, _anchor.EventParser)(FARM_PROGRAM_ID, program.coder);
      const poolsState = yield getAllPoolState(farmList, program);
      return poolsState.map((poolState, idx) => {
        const address = farmList[idx];
        return new _PoolFarmImpl(address, program, eventParser, poolState, {
          cluster
        });
      });
    });
  }
  static getUserBalances(connection, owner, farmMints) {
    return __async(this, null, function* () {
      const { program } = getFarmProgram(connection);
      const userStakingPda = farmMints.map((mint) => {
        const [userStakingAddress] = _web3js.PublicKey.findProgramAddressSync(
          [owner.toBuffer(), mint.toBuffer()],
          FARM_PROGRAM_ID
        );
        return userStakingAddress;
      });
      const usersState = yield chunkedFetchMultipleUserAccount(
        program,
        userStakingPda,
        100
      );
      return usersState.reduce((acc, userState) => {
        const userStaked = userState.balanceStaked;
        if (userStaked.isZero())
          return acc;
        acc.set(userState.pool.toBase58(), userStaked);
        return acc;
      }, /* @__PURE__ */ new Map());
    });
  }
  static claimAll(connection, owner, farmMints, opt) {
    return __async(this, null, function* () {
      const { program } = getFarmProgram(connection);
      const userBalanceMap = yield _PoolFarmImpl.getUserBalances(
        connection,
        owner,
        farmMints
      );
      const farmMintWithBalance = Array.from(userBalanceMap.keys()).map(
        (farmMint) => new (0, _web3js.PublicKey)(farmMint)
      );
      const poolFarmsImpl = yield _PoolFarmImpl.createMultiple(
        connection,
        farmMintWithBalance,
        { cluster: opt == null ? void 0 : opt.cluster }
      );
      const claimAllIxs = yield Promise.all(
        poolFarmsImpl.map((poolFarmImpl) => __async(this, null, function* () {
          return (yield poolFarmImpl.claimMethodBuilder(owner)).instruction();
        }))
      );
      const chunkedClaimAllIx = chunks(claimAllIxs, MAX_CLAIM_ALL_ALLOWED);
      return Promise.all(
        chunkedClaimAllIx.map((claimAllIx) => __async(this, null, function* () {
          return new (0, _web3js.Transaction)(__spreadValues({
            feePayer: owner
          }, yield program.provider.connection.getLatestBlockhash(
            "finalized"
          ))).add(...claimAllIx).add(_web3js.ComputeBudgetProgram.setComputeUnitLimit({ units: 14e5 }));
        }))
      );
    });
  }
  getUserPda(owner) {
    const [userPda] = _web3js.PublicKey.findProgramAddressSync(
      [owner.toBuffer(), this.address.toBuffer()],
      this.program.programId
    );
    return userPda;
  }
  getUserState(owner) {
    return __async(this, null, function* () {
      const userPda = this.getUserPda(owner);
      return this.program.account.user.fetchNullable(owner);
    });
  }
  createUserInstruction(owner) {
    return __async(this, null, function* () {
      const userPda = this.getUserPda(owner);
      const userState = yield this.getUserState(userPda);
      if (userState)
        return void 0;
      return yield this.program.methods.createUser().accounts({
        owner,
        pool: this.address,
        user: userPda
      }).instruction();
    });
  }
  deposit(owner, amount) {
    return __async(this, null, function* () {
      const userPda = this.getUserPda(owner);
      const instructions = [];
      const userCreateInstruction = yield this.createUserInstruction(owner);
      userCreateInstruction && instructions.push(userCreateInstruction);
      const [userStakingATA, userStakingIx] = yield getOrCreateATAInstruction(
        this.poolState.stakingMint,
        owner,
        this.program.provider.connection
      );
      userStakingIx && instructions.push(userStakingIx);
      const depositTx = yield this.program.methods.deposit(amount).accounts({
        owner,
        user: userPda,
        pool: this.address,
        stakeFromAccount: userStakingATA,
        stakingVault: this.poolState.stakingVault,
        tokenProgram: _spltoken.TOKEN_PROGRAM_ID
      }).preInstructions(instructions).transaction();
      return new (0, _web3js.Transaction)(__spreadValues({
        feePayer: owner
      }, yield this.program.provider.connection.getLatestBlockhash(
        "finalized"
      ))).add(depositTx);
    });
  }
  withdraw(owner, amount) {
    return __async(this, null, function* () {
      const userPda = this.getUserPda(owner);
      const instructions = [];
      const [userStakingATA, userStakingIx] = yield getOrCreateATAInstruction(
        this.poolState.stakingMint,
        owner,
        this.program.provider.connection
      );
      userStakingIx && instructions.push(userStakingIx);
      const withdrawTx = yield this.program.methods.withdraw(amount).accounts({
        owner,
        pool: this.address,
        stakeFromAccount: userStakingATA,
        stakingVault: this.poolState.stakingVault,
        tokenProgram: _spltoken.TOKEN_PROGRAM_ID,
        user: userPda
      }).preInstructions(instructions).transaction();
      return new (0, _web3js.Transaction)(__spreadValues({
        feePayer: owner
      }, yield this.program.provider.connection.getLatestBlockhash(
        "finalized"
      ))).add(withdrawTx);
    });
  }
  claimMethodBuilder(owner) {
    return __async(this, null, function* () {
      const userPda = this.getUserPda(owner);
      const isDual = !this.poolState.rewardAMint.equals(
        this.poolState.rewardBMint
      );
      const preInstructions = [];
      const [[userRewardAATA, userRewardAIx], [userRewardBATA, userRewardBIx]] = yield Promise.all(
        isDual ? [
          getOrCreateATAInstruction(
            this.poolState.rewardAMint,
            owner,
            this.program.provider.connection
          ),
          getOrCreateATAInstruction(
            this.poolState.rewardBMint,
            owner,
            this.program.provider.connection
          )
        ] : [
          getOrCreateATAInstruction(
            this.poolState.rewardAMint,
            owner,
            this.program.provider.connection
          ),
          [void 0, void 0]
        ]
      );
      userRewardAIx && preInstructions.push(userRewardAIx);
      userRewardBIx && preInstructions.push(userRewardBIx);
      return this.program.methods.claim().accounts({
        owner,
        pool: this.address,
        rewardAAccount: userRewardAATA,
        rewardBAccount: isDual ? userRewardBATA : userRewardAATA,
        rewardAVault: this.poolState.rewardAVault,
        rewardBVault: this.poolState.rewardBVault,
        stakingVault: this.poolState.stakingVault,
        tokenProgram: _spltoken.TOKEN_PROGRAM_ID,
        user: userPda
      }).preInstructions(preInstructions);
    });
  }
  claim(owner) {
    return __async(this, null, function* () {
      const claimTx = yield (yield this.claimMethodBuilder(owner)).transaction();
      return new (0, _web3js.Transaction)(__spreadValues({
        feePayer: owner
      }, yield this.program.provider.connection.getLatestBlockhash(
        "finalized"
      ))).add(claimTx);
    });
  }
  getClaimableReward(owner) {
    return __async(this, null, function* () {
      var _a, _b;
      if (!this.eventParser)
        throw "EventParser not found";
      const claimMethodBuilder = yield this.claimMethodBuilder(owner);
      const claimTransaction = yield claimMethodBuilder.transaction();
      if (!claimTransaction)
        return;
      const blockhash = (yield this.program.provider.connection.getLatestBlockhash("finalized")).blockhash;
      const claimTx = new (0, _web3js.Transaction)({
        recentBlockhash: blockhash,
        feePayer: SIMULATION_USER
      });
      claimTransaction && claimTx.add(claimTransaction);
      const tx = yield this.program.provider.connection.simulateTransaction(
        claimTx
      );
      const simulatedReward = yield parseLogs(
        this.eventParser,
        (_b = (_a = tx == null ? void 0 : tx.value) == null ? void 0 : _a.logs) != null ? _b : []
      );
      return simulatedReward;
    });
  }
};


exports.PoolFarmImpl = PoolFarmImpl;
//# sourceMappingURL=index.js.map