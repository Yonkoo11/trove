#!/usr/bin/env bash
# Gate 1 stage A: fresh regtest chain, 2-of-3 FROST group, vault address, fund the vault.
set -euo pipefail
OLD=~/Projects/snarks-launchpad/probe/zcash-batch
BIN=$OLD/work/bin; DT=$BIN/zcash-devtool
FZ=~/Projects/shielded-lend/spike/frost-zcash-demo/target/release
W=~/Projects/shielded-lend/spike/work; mkdir -p $W/logs $W/frost
SERVER=127.0.0.1:8137; RPC=http://127.0.0.1:18232
HEIGHTS=$OLD/config/activation-heights.toml
export RUST_LOG=warn RUST_MIN_STACK=67108864
rpc(){ curl -s -m 900 -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" $RPC; }
pkill -f "zainod start" 2>/dev/null || true; pkill -f "zebrad -c" 2>/dev/null || true; sleep 2
rm -rf $W/wallets $W/frost/*; mkdir -p $W/wallets
( cd $W && nohup env -u RUST_LOG $BIN/zebrad -c $OLD/config/zebrad.toml start > logs/zebrad.log 2>&1 & )
for _ in $(seq 1 60); do rpc getblockcount '[]' | grep -q result && break; sleep 1; done
BURN="uregtest1efxggx6lduhm2fx5lnrhxv7h7kpztlpa3ahf3n4w0q0zj5epj4av9xjq6ljsja3xk8z7rzd067kc7mgpy9448rdfzpfjz5gq389zdmpgnk6rp4ykk0xk6cmqw6zqcrnmsuaxv3yzsvcwsd4gagtalh0uzrdvy03nhmltjz2eu0232qlcs0zvxuqyut73yucd9gy5jaudnyt7yqhgpqv"
for _ in $(seq 1 30); do rpc generatetoaddress "[1,\"$BURN\"]" | grep -q '"result":\[' && break; sleep 2; done
sleep 3
( cd $W && nohup env -u RUST_LOG $BIN/zainod start -c $OLD/config/zainod.toml > logs/zainod.log 2>&1 & )
for _ in $(seq 1 60); do grep -q "started successfully" $W/logs/zainod.log 2>/dev/null && break; sleep 1; done
# funder wallet
for _ in $(seq 1 10); do rm -rf $W/wallets/funder; timeout 30 $DT wallet -w $W/wallets/funder init --name funder -i $W/wallets/funder.age -n regtest --activation-heights $HEIGHTS -s $SERVER </dev/null >$W/logs/init.log 2>&1 && [ -f $W/wallets/funder/data.sqlite ] && break; sleep 3; done
FUA=$($DT wallet -w $W/wallets/funder list-addresses 2>/dev/null | awk '/Default Address/{print $3}')
rpc generatetoaddress "[3,\"$FUA\"]" >/dev/null; rpc generatetoaddress "[100,\"$BURN\"]" >/dev/null
# FROST group: 3 participants, threshold 2, RedPallas
for n in borrower lender keeper; do $FZ/frost-client init -c $W/frost/$n.toml >/dev/null; done
$FZ/frost-client trusted-dealer -d vault -N borrower,lender,keeper -C redpallas -t 2 -n 3 \
  -c $W/frost/borrower.toml -c $W/frost/lender.toml -c $W/frost/keeper.toml -s http://127.0.0.1:2744 >$W/logs/dealer.log 2>&1
$FZ/frost-client groups -c $W/frost/borrower.toml | tee $W/logs/groups.log
