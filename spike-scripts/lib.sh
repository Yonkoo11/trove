# Shared helpers for the regtest lifecycle runs. Source this file; do not run it.
OLD=~/Projects/snarks-launchpad/probe/zcash-batch
BIN=$OLD/work/bin; DT=$BIN/zcash-devtool
FZ=~/Projects/shielded-lend/spike/frost-zcash-demo/target/release
W=~/Projects/shielded-lend/spike/work
SERVER=127.0.0.1:8137; RPC=http://127.0.0.1:18232
BURN="uregtest1efxggx6lduhm2fx5lnrhxv7h7kpztlpa3ahf3n4w0q0zj5epj4av9xjq6ljsja3xk8z7rzd067kc7mgpy9448rdfzpfjz5gq389zdmpgnk6rp4ykk0xk6cmqw6zqcrnmsuaxv3yzsvcwsd4gagtalh0uzrdvy03nhmltjz2eu0232qlcs0zvxuqyut73yucd9gy5jaudnyt7yqhgpqv"
# TROVE_NET=testnet runs the same scripts on the public Zcash testnet: new devtool, public server,
# and "mine N" waits for N real blocks (about 75 s each) instead of calling regtest generate.
if [ "${TROVE_NET:-regtest}" = testnet ]; then
  DT=~/zcash-testnet/devtool/target/release/zcash-devtool; W=${TROVE_W:-~/zcash-testnet/work}
  SERVER=testnet.zec.rocks:443
fi
export RUST_LOG=warn RUST_MIN_STACK=67108864
rpc(){ curl -s -m 900 -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" $RPC; }
mine(){ if [ "${TROVE_NET:-regtest}" = testnet ]; then sleep $(( $1 * 80 )); return 0; fi; for _ in 1 2 3 4 5; do rpc generatetoaddress "[$1,\"$BURN\"]" | grep -q '"result":\[' && return 0; sleep 2; done; return 1; }
wsync(){ $DT wallet -w $W/wallets/$1 sync -s $SERVER >/dev/null 2>&1; }
# spendable ZEC-in-zatoshis for a wallet (Ironwood/Orchard pool line), 0 when none
wbal(){ wsync $1; $DT wallet -w $W/wallets/$1 balance --min-confirmations 1 2>&1 | awk '/[Bb]alance/ && /ZEC|zat/ {print}' | head -3; }
waddr(){ $DT wallet -w $W/wallets/$1 list-addresses 2>/dev/null | awk '/Default Address/{print $3}'; }
