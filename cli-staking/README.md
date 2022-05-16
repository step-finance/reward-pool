Initialize vault
cargo run init --base /home/guantian/.config/solana/pool-base.json --token-mint 9NGDi2tZtNmCCp8SVLKNuGjuWAVwNF3Vap5tT8km5er9 --program-id 2uUkB3v8JzMDVZsFK8Cj9JytVdd9s2EpDX6msz3DTcpc

Sample: https://solscan.io/tx/5JD5jwSHXJugG8UdprWLJANFgRUg4Q1vzewmR53Yazx3VDtRqQBoEvByqvzX7xTp6UNax4bdiXGc6J7qq2Gn8SJh?cluster=devnet

Transfer admin
cargo run transfer-admin --token-mint 9NGDi2tZtNmCCp8SVLKNuGjuWAVwNF3Vap5tT8km5er9 --new-admin 5unTfT2kssBuNvHPY6LbJfJpLqEcdMxGYLWHwShaeTLi --program-id 2uUkB3v8JzMDVZsFK8Cj9JytVdd9s2EpDX6msz3DTcpc

Sample: https://solscan.io/tx/2DtJ1jP3K1zFxf7673z6VnTQTAyqHdNAvjZeWGuXfQUyF1YfRJgPX7ib9rYiT7vUhNnGVu4DJY6FVnFQRc3VsLfs?cluster=devnet

Stake
cargo run stake --token-mint 9NGDi2tZtNmCCp8SVLKNuGjuWAVwNF3Vap5tT8km5er9 --program-id 2uUkB3v8JzMDVZsFK8Cj9JytVdd9s2EpDX6msz3DTcpc 100000000000

Sample: https://solscan.io/tx/N5nJk3RhWHBCwoBUb1EEdgaSrm4F6kCeY1YvgKJkrpG8QLvrs39juT3jrp5gid6n9hdQF32rechRwjptmoU4J1w?cluster=devnet

Reward
cargo run reward --token-mint 9NGDi2tZtNmCCp8SVLKNuGjuWAVwNF3Vap5tT8km5er9 --program-id 2uUkB3v8JzMDVZsFK8Cj9JytVdd9s2EpDX6msz3DTcpc 10000000000

Sample: https://solscan.io/tx/4BXLpFh3cx41RQVYqdnQYydGGbUGsmVdPSQ4HFdWkJkjYHhch4icQwZJ62GHAYZPodJdQdAQwdENGtYpksvbKW9L?cluster=devnet

Unstake
cargo run unstake --token-mint 9NGDi2tZtNmCCp8SVLKNuGjuWAVwNF3Vap5tT8km5er9 --program-id 2uUkB3v8JzMDVZsFK8Cj9JytVdd9s2EpDX6msz3DTcpc 10000000000

Sample: https://solscan.io/tx/4bftrsosNYiBt5T2X8w9Zn2fHGLr4a4UkYZQFX1Mf3z4ts7R4bxzgY4uNiSSZ2v8spXJMPnY6jX4Xpj4eumLFWRe?cluster=devnet

Update locked reward degradation
cargo run update-locked-reward-degradation --token-mint 9NGDi2tZtNmCCp8SVLKNuGjuWAVwNF3Vap5tT8km5er9 --program-id 2uUkB3v8JzMDVZsFK8Cj9JytVdd9s2EpDX6msz3DTcpc 1000000000000

Sample: https://solscan.io/tx/2XL8iemwRxq4mwaqRJt7SuffPj7hP5QbfFeGu2Qy3o52oWaEqasKnKQdtB6pZZTKV5Z5VQvXXpUmzpmjhVxh9s9L?cluster=devnet
