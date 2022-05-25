Initialize vault
cargo run init --token-mint mnVHSccbnMvEYjkSaxNXFaJSPHLGc8EHp6UfMZP1M6n

cargo run show-info --token-mint mnVHSccbnMvEYjkSaxNXFaJSPHLGc8EHp6UfMZP1M6n

Transfer admin
cargo run transfer-admin --token-mint mnVHSccbnMvEYjkSaxNXFaJSPHLGc8EHp6UfMZP1M6n --new-admin 5unTfT2kssBuNvHPY6LbJfJpLqEcdMxGYLWHwShaeTLi

Stake
cargo run stake --token-mint mnVHSccbnMvEYjkSaxNXFaJSPHLGc8EHp6UfMZP1M6n 100000000000

Reward
cargo run reward --token-mint mnVHSccbnMvEYjkSaxNXFaJSPHLGc8EHp6UfMZP1M6n 10000000000

Unstake
cargo run unstake --token-mint mnVHSccbnMvEYjkSaxNXFaJSPHLGc8EHp6UfMZP1M6n 10000000000

Update locked reward degradation
cargo run update-locked-reward-degradation --token-mint mnVHSccbnMvEYjkSaxNXFaJSPHLGc8EHp6UfMZP1M6n 1000000000000



