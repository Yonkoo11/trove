#!/usr/bin/env bash
# Build zcash-sign so it accepts the Zcash testnet NU7 branch id (0x77190ad9).
# zcash_protocol 0.10.x maps Nu7 to the placeholder 0xffffffff, so the PCZT
# signer fails with UnknownConsensusBranchId on testnet. This patches a local
# copy of the crate and builds with the nu7 cfg. Run from the repo root.
set -euo pipefail
DEMO=${DEMO:-spike/frost-zcash-demo}
PATCH=${PATCH:-spike/patches/zcash_protocol}
SRC=$(ls -d ~/.cargo/registry/src/*/zcash_protocol-0.10.5 | head -1)

if [ ! -d "$PATCH" ]; then
  mkdir -p "$(dirname "$PATCH")"
  cp -R "$SRC" "$PATCH"
  sed -i '' 's/0xffff_ffff => Ok(BranchId::Nu7)/0x7719_0ad9 => Ok(BranchId::Nu7)/; s/BranchId::Nu7 => 0xffff_ffff/BranchId::Nu7 => 0x7719_0ad9/' "$PATCH/src/consensus.rs"
fi
grep -c '0x7719_0ad9' "$PATCH/src/consensus.rs" | grep -qx 2 || { echo "patch did not apply"; exit 1; }

REL=$(python3 -c "import os,sys;print(os.path.relpath(sys.argv[1],sys.argv[2]))" "$PATCH" "$DEMO")
grep -q '^zcash_protocol = { path' "$DEMO/Cargo.toml" || \
  sed -i '' "/^\[patch.crates-io\]/a\\
zcash_protocol = { path = \"$REL\" }" "$DEMO/Cargo.toml"

grep -q 'cfg(zcash_unstable = "nu7")\] nu7: h' "$DEMO/zcash-sign/src/main.rs" || \
  sed -i '' 's|nu6: h, nu6_1: h, nu6_2: h, nu6_3: h,|&\
                #[cfg(zcash_unstable = "nu7")] nu7: h,|' "$DEMO/zcash-sign/src/main.rs"

cd "$DEMO"
cargo update -p zcash_protocol 2>&1 | tail -1
RUSTFLAGS='--cfg zcash_unstable="nu7"' cargo build --release -p zcash-sign --target-dir target-nu7 2>&1 | tail -3
# a signed macOS binary must be removed before copying over it
rm -f target/release/zcash-sign
cp target-nu7/release/zcash-sign target/release/zcash-sign
codesign --force -s - target/release/zcash-sign
echo "installed $DEMO/target/release/zcash-sign (NU7 testnet)"
