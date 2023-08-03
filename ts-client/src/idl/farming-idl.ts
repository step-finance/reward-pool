export type Farming = {
  version: '0.2.0';
  name: 'farming';
  instructions: [
    {
      name: 'initializePool';
      accounts: [
        {
          name: 'pool';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'stakingMint';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'stakingVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'rewardAMint';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'rewardAVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'rewardBMint';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'rewardBVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'authority';
          isMut: true;
          isSigner: true;
        },
        {
          name: 'base';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'systemProgram';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'tokenProgram';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'rent';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [
        {
          name: 'rewardDuration';
          type: 'u64';
        },
      ];
    },
    {
      name: 'createUser';
      accounts: [
        {
          name: 'pool';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'user';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'owner';
          isMut: true;
          isSigner: true;
        },
        {
          name: 'systemProgram';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [];
    },
    {
      name: 'pause';
      accounts: [
        {
          name: 'pool';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'authority';
          isMut: false;
          isSigner: true;
        },
      ];
      args: [];
    },
    {
      name: 'unpause';
      accounts: [
        {
          name: 'pool';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'authority';
          isMut: false;
          isSigner: true;
        },
      ];
      args: [];
    },
    {
      name: 'deposit';
      accounts: [
        {
          name: 'pool';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'stakingVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'user';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'owner';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'stakeFromAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'tokenProgram';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [
        {
          name: 'amount';
          type: 'u64';
        },
      ];
    },
    {
      name: 'withdraw';
      accounts: [
        {
          name: 'pool';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'stakingVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'user';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'owner';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'stakeFromAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'tokenProgram';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [
        {
          name: 'sptAmount';
          type: 'u64';
        },
      ];
    },
    {
      name: 'authorizeFunder';
      accounts: [
        {
          name: 'pool';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'authority';
          isMut: false;
          isSigner: true;
        },
      ];
      args: [
        {
          name: 'funderToAdd';
          type: 'publicKey';
        },
      ];
    },
    {
      name: 'deauthorizeFunder';
      accounts: [
        {
          name: 'pool';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'authority';
          isMut: false;
          isSigner: true;
        },
      ];
      args: [
        {
          name: 'funderToRemove';
          type: 'publicKey';
        },
      ];
    },
    {
      name: 'fund';
      accounts: [
        {
          name: 'pool';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'stakingVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'rewardAVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'rewardBVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'funder';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'fromA';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'fromB';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'tokenProgram';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [
        {
          name: 'amountA';
          type: 'u64';
        },
        {
          name: 'amountB';
          type: 'u64';
        },
      ];
    },
    {
      name: 'claim';
      accounts: [
        {
          name: 'pool';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'stakingVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'rewardAVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'rewardBVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'user';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'owner';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'rewardAAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'rewardBAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'tokenProgram';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [];
    },
    {
      name: 'withdrawExtraToken';
      accounts: [
        {
          name: 'pool';
          isMut: false;
          isSigner: false;
        },
        {
          name: 'stakingVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'withdrawToAccount';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'authority';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'tokenProgram';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [];
    },
    {
      name: 'closeUser';
      accounts: [
        {
          name: 'pool';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'user';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'owner';
          isMut: true;
          isSigner: true;
        },
      ];
      args: [];
    },
    {
      name: 'closePool';
      accounts: [
        {
          name: 'refundee';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'stakingRefundee';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'rewardARefundee';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'rewardBRefundee';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'pool';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'authority';
          isMut: false;
          isSigner: true;
        },
        {
          name: 'stakingVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'rewardAVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'rewardBVault';
          isMut: true;
          isSigner: false;
        },
        {
          name: 'tokenProgram';
          isMut: false;
          isSigner: false;
        },
      ];
      args: [];
    },
  ];
  accounts: [
    {
      name: 'pool';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'authority';
            type: 'publicKey';
          },
          {
            name: 'paused';
            type: 'bool';
          },
          {
            name: 'stakingMint';
            type: 'publicKey';
          },
          {
            name: 'stakingVault';
            type: 'publicKey';
          },
          {
            name: 'rewardAMint';
            type: 'publicKey';
          },
          {
            name: 'rewardAVault';
            type: 'publicKey';
          },
          {
            name: 'rewardBMint';
            type: 'publicKey';
          },
          {
            name: 'rewardBVault';
            type: 'publicKey';
          },
          {
            name: 'baseKey';
            type: 'publicKey';
          },
          {
            name: 'rewardDuration';
            type: 'u64';
          },
          {
            name: 'rewardDurationEnd';
            type: 'u64';
          },
          {
            name: 'lastUpdateTime';
            type: 'u64';
          },
          {
            name: 'rewardARate';
            type: 'u64';
          },
          {
            name: 'rewardBRate';
            type: 'u64';
          },
          {
            name: 'rewardAPerTokenStored';
            type: 'u128';
          },
          {
            name: 'rewardBPerTokenStored';
            type: 'u128';
          },
          {
            name: 'userStakeCount';
            type: 'u32';
          },
          {
            name: 'funders';
            type: {
              array: ['publicKey', 4];
            };
          },
          {
            name: 'poolBump';
            type: 'u8';
          },
          {
            name: 'totalStaked';
            type: 'u64';
          },
        ];
      };
    },
    {
      name: 'user';
      type: {
        kind: 'struct';
        fields: [
          {
            name: 'pool';
            type: 'publicKey';
          },
          {
            name: 'owner';
            type: 'publicKey';
          },
          {
            name: 'rewardAPerTokenComplete';
            type: 'u128';
          },
          {
            name: 'rewardBPerTokenComplete';
            type: 'u128';
          },
          {
            name: 'rewardAPerTokenPending';
            type: 'u64';
          },
          {
            name: 'rewardBPerTokenPending';
            type: 'u64';
          },
          {
            name: 'balanceStaked';
            type: 'u64';
          },
          {
            name: 'nonce';
            type: 'u8';
          },
        ];
      };
    },
  ];
  events: [
    {
      name: 'EventDeposit';
      fields: [
        {
          name: 'amount';
          type: 'u64';
          index: false;
        },
      ];
    },
    {
      name: 'EventWithdraw';
      fields: [
        {
          name: 'amount';
          type: 'u64';
          index: false;
        },
      ];
    },
    {
      name: 'EventFund';
      fields: [
        {
          name: 'amountA';
          type: 'u64';
          index: false;
        },
        {
          name: 'amountB';
          type: 'u64';
          index: false;
        },
      ];
    },
    {
      name: 'EventClaim';
      fields: [
        {
          name: 'amountA';
          type: 'u64';
          index: false;
        },
        {
          name: 'amountB';
          type: 'u64';
          index: false;
        },
      ];
    },
    {
      name: 'EventAuthorizeFunder';
      fields: [
        {
          name: 'newFunder';
          type: 'publicKey';
          index: false;
        },
      ];
    },
    {
      name: 'EventUnauthorizeFunder';
      fields: [
        {
          name: 'funder';
          type: 'publicKey';
          index: false;
        },
      ];
    },
  ];
  errors: [
    {
      code: 6000;
      name: 'InsufficientFundWithdraw';
      msg: 'Insufficient funds to withdraw.';
    },
    {
      code: 6001;
      name: 'AmountMustBeGreaterThanZero';
      msg: 'Amount must be greater than zero.';
    },
    {
      code: 6002;
      name: 'SingleDepositTokenBCannotBeFunded';
      msg: 'Reward B cannot be funded - pool is single deposit.';
    },
    {
      code: 6003;
      name: 'PoolPaused';
      msg: 'Pool is paused.';
    },
    {
      code: 6004;
      name: 'DurationTooShort';
      msg: 'Duration cannot be shorter than one day.';
    },
    {
      code: 6005;
      name: 'FunderAlreadyAuthorized';
      msg: 'Provided funder is already authorized to fund.';
    },
    {
      code: 6006;
      name: 'MaxFunders';
      msg: 'Maximum funders already authorized.';
    },
    {
      code: 6007;
      name: 'CannotDeauthorizePoolAuthority';
      msg: 'Cannot deauthorize the primary pool authority.';
    },
    {
      code: 6008;
      name: 'CannotDeauthorizeMissingAuthority';
      msg: 'Authority not found for deauthorization.';
    },
    {
      code: 6009;
      name: 'MathOverflow';
      msg: 'Math operation overflow';
    },
  ];
};

export const IDL: Farming = {
  version: '0.2.0',
  name: 'farming',
  instructions: [
    {
      name: 'initializePool',
      accounts: [
        {
          name: 'pool',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'stakingMint',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'stakingVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'rewardAMint',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'rewardAVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'rewardBMint',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'rewardBVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'authority',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'base',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'systemProgram',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'tokenProgram',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'rent',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'rewardDuration',
          type: 'u64',
        },
      ],
    },
    {
      name: 'createUser',
      accounts: [
        {
          name: 'pool',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'user',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'owner',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'systemProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [],
    },
    {
      name: 'pause',
      accounts: [
        {
          name: 'pool',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'authority',
          isMut: false,
          isSigner: true,
        },
      ],
      args: [],
    },
    {
      name: 'unpause',
      accounts: [
        {
          name: 'pool',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'authority',
          isMut: false,
          isSigner: true,
        },
      ],
      args: [],
    },
    {
      name: 'deposit',
      accounts: [
        {
          name: 'pool',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'stakingVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'user',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'owner',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'stakeFromAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'tokenProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'amount',
          type: 'u64',
        },
      ],
    },
    {
      name: 'withdraw',
      accounts: [
        {
          name: 'pool',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'stakingVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'user',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'owner',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'stakeFromAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'tokenProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'sptAmount',
          type: 'u64',
        },
      ],
    },
    {
      name: 'authorizeFunder',
      accounts: [
        {
          name: 'pool',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'authority',
          isMut: false,
          isSigner: true,
        },
      ],
      args: [
        {
          name: 'funderToAdd',
          type: 'publicKey',
        },
      ],
    },
    {
      name: 'deauthorizeFunder',
      accounts: [
        {
          name: 'pool',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'authority',
          isMut: false,
          isSigner: true,
        },
      ],
      args: [
        {
          name: 'funderToRemove',
          type: 'publicKey',
        },
      ],
    },
    {
      name: 'fund',
      accounts: [
        {
          name: 'pool',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'stakingVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'rewardAVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'rewardBVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'funder',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'fromA',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'fromB',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'tokenProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'amountA',
          type: 'u64',
        },
        {
          name: 'amountB',
          type: 'u64',
        },
      ],
    },
    {
      name: 'claim',
      accounts: [
        {
          name: 'pool',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'stakingVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'rewardAVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'rewardBVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'user',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'owner',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'rewardAAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'rewardBAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'tokenProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [],
    },
    {
      name: 'withdrawExtraToken',
      accounts: [
        {
          name: 'pool',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'stakingVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'withdrawToAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'authority',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'tokenProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [],
    },
    {
      name: 'closeUser',
      accounts: [
        {
          name: 'pool',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'user',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'owner',
          isMut: true,
          isSigner: true,
        },
      ],
      args: [],
    },
    {
      name: 'closePool',
      accounts: [
        {
          name: 'refundee',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'stakingRefundee',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'rewardARefundee',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'rewardBRefundee',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'pool',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'authority',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'stakingVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'rewardAVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'rewardBVault',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'tokenProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: 'pool',
      type: {
        kind: 'struct',
        fields: [
          {
            name: 'authority',
            type: 'publicKey',
          },
          {
            name: 'paused',
            type: 'bool',
          },
          {
            name: 'stakingMint',
            type: 'publicKey',
          },
          {
            name: 'stakingVault',
            type: 'publicKey',
          },
          {
            name: 'rewardAMint',
            type: 'publicKey',
          },
          {
            name: 'rewardAVault',
            type: 'publicKey',
          },
          {
            name: 'rewardBMint',
            type: 'publicKey',
          },
          {
            name: 'rewardBVault',
            type: 'publicKey',
          },
          {
            name: 'baseKey',
            type: 'publicKey',
          },
          {
            name: 'rewardDuration',
            type: 'u64',
          },
          {
            name: 'rewardDurationEnd',
            type: 'u64',
          },
          {
            name: 'lastUpdateTime',
            type: 'u64',
          },
          {
            name: 'rewardARate',
            type: 'u64',
          },
          {
            name: 'rewardBRate',
            type: 'u64',
          },
          {
            name: 'rewardAPerTokenStored',
            type: 'u128',
          },
          {
            name: 'rewardBPerTokenStored',
            type: 'u128',
          },
          {
            name: 'userStakeCount',
            type: 'u32',
          },
          {
            name: 'funders',
            type: {
              array: ['publicKey', 4],
            },
          },
          {
            name: 'poolBump',
            type: 'u8',
          },
          {
            name: 'totalStaked',
            type: 'u64',
          },
        ],
      },
    },
    {
      name: 'user',
      type: {
        kind: 'struct',
        fields: [
          {
            name: 'pool',
            type: 'publicKey',
          },
          {
            name: 'owner',
            type: 'publicKey',
          },
          {
            name: 'rewardAPerTokenComplete',
            type: 'u128',
          },
          {
            name: 'rewardBPerTokenComplete',
            type: 'u128',
          },
          {
            name: 'rewardAPerTokenPending',
            type: 'u64',
          },
          {
            name: 'rewardBPerTokenPending',
            type: 'u64',
          },
          {
            name: 'balanceStaked',
            type: 'u64',
          },
          {
            name: 'nonce',
            type: 'u8',
          },
        ],
      },
    },
  ],
  events: [
    {
      name: 'EventDeposit',
      fields: [
        {
          name: 'amount',
          type: 'u64',
          index: false,
        },
      ],
    },
    {
      name: 'EventWithdraw',
      fields: [
        {
          name: 'amount',
          type: 'u64',
          index: false,
        },
      ],
    },
    {
      name: 'EventFund',
      fields: [
        {
          name: 'amountA',
          type: 'u64',
          index: false,
        },
        {
          name: 'amountB',
          type: 'u64',
          index: false,
        },
      ],
    },
    {
      name: 'EventClaim',
      fields: [
        {
          name: 'amountA',
          type: 'u64',
          index: false,
        },
        {
          name: 'amountB',
          type: 'u64',
          index: false,
        },
      ],
    },
    {
      name: 'EventAuthorizeFunder',
      fields: [
        {
          name: 'newFunder',
          type: 'publicKey',
          index: false,
        },
      ],
    },
    {
      name: 'EventUnauthorizeFunder',
      fields: [
        {
          name: 'funder',
          type: 'publicKey',
          index: false,
        },
      ],
    },
  ],
  errors: [
    {
      code: 6000,
      name: 'InsufficientFundWithdraw',
      msg: 'Insufficient funds to withdraw.',
    },
    {
      code: 6001,
      name: 'AmountMustBeGreaterThanZero',
      msg: 'Amount must be greater than zero.',
    },
    {
      code: 6002,
      name: 'SingleDepositTokenBCannotBeFunded',
      msg: 'Reward B cannot be funded - pool is single deposit.',
    },
    {
      code: 6003,
      name: 'PoolPaused',
      msg: 'Pool is paused.',
    },
    {
      code: 6004,
      name: 'DurationTooShort',
      msg: 'Duration cannot be shorter than one day.',
    },
    {
      code: 6005,
      name: 'FunderAlreadyAuthorized',
      msg: 'Provided funder is already authorized to fund.',
    },
    {
      code: 6006,
      name: 'MaxFunders',
      msg: 'Maximum funders already authorized.',
    },
    {
      code: 6007,
      name: 'CannotDeauthorizePoolAuthority',
      msg: 'Cannot deauthorize the primary pool authority.',
    },
    {
      code: 6008,
      name: 'CannotDeauthorizeMissingAuthority',
      msg: 'Authority not found for deauthorization.',
    },
    {
      code: 6009,
      name: 'MathOverflow',
      msg: 'Math operation overflow',
    },
  ],
};
