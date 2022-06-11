Initialize vault
cargo run init --token-mint MERt85fc5boKw3BW1eYdxonEuJNvXbiMbs6hvheau5K --base-key-location [BASE_KEY_LOCATION]


cargo run init --token-mint MERt85fc5boKw3BW1eYdxonEuJNvXbiMbs6hvheau5K --base-key-location /Users/andrewnguyen/Documents/personal/solana/base_key/base_key.json --cluster https://api.mainnet-beta.solana.com

cargo run show-info --token-mint MERt85fc5boKw3BW1eYdxonEuJNvXbiMbs6hvheau5K --cluster https://api.mainnet-beta.solana.com

Transfer admin
cargo run transfer-admin --token-mint MERt85fc5boKw3BW1eYdxonEuJNvXbiMbs6hvheau5K --new-admin 5unTfT2kssBuNvHPY6LbJfJpLqEcdMxGYLWHwShaeTLi

Stake
cargo run stake --token-mint MERt85fc5boKw3BW1eYdxonEuJNvXbiMbs6hvheau5K 1000000 --cluster https://api.mainnet-beta.solana.com

Reward
cargo run reward --token-mint MERt85fc5boKw3BW1eYdxonEuJNvXbiMbs6hvheau5K 10000000000

Unstake
cargo run unstake --token-mint MERt85fc5boKw3BW1eYdxonEuJNvXbiMbs6hvheau5K 10000000000

Update locked reward degradation
cargo run update-locked-reward-degradation --token-mint MERt85fc5boKw3BW1eYdxonEuJNvXbiMbs6hvheau5K 1000000000000



