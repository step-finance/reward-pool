Initialize vault
cargo run init --token-mint 9dAVg4KmgQZffiy6oMe5Tin6hyxBM6buEQdcsTkDeM3K --base-key-location [BASE_KEY_LOCATION]

cargo run show-info --token-mint 9dAVg4KmgQZffiy6oMe5Tin6hyxBM6buEQdcsTkDeM3K

Transfer admin
cargo run transfer-admin --token-mint 9dAVg4KmgQZffiy6oMe5Tin6hyxBM6buEQdcsTkDeM3K --new-admin 5unTfT2kssBuNvHPY6LbJfJpLqEcdMxGYLWHwShaeTLi

Stake
cargo run stake --token-mint 9dAVg4KmgQZffiy6oMe5Tin6hyxBM6buEQdcsTkDeM3K 10000

Reward
cargo run reward --token-mint 9dAVg4KmgQZffiy6oMe5Tin6hyxBM6buEQdcsTkDeM3K 10000000000

Unstake
cargo run unstake --token-mint 9dAVg4KmgQZffiy6oMe5Tin6hyxBM6buEQdcsTkDeM3K 10000000000

Update locked reward degradation
cargo run update-locked-reward-degradation --token-mint 9dAVg4KmgQZffiy6oMe5Tin6hyxBM6buEQdcsTkDeM3K 1000000000000



