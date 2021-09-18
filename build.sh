TOML=$(find programs -name Cargo.toml)
ANCHOR_VER=$(awk -F'[ ="]+' '$1 == "anchor-spl" { print $2 }' $TOML)
docker run -ti --rm -v $PWD:/workdir  projectserum/build:v$ANCHOR_VER anchor build