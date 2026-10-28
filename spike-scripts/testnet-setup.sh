#!/usr/bin/env bash
# testnet-setup.sh: 2-of-3 FROST group, view-only vault, borrower and lender wallets for TROVE_NET=testnet.
# The funder wallet (already holding test ZEC) is linked in, not recreated.
set -euo pipefail
export TROVE_NET=testnet
HERE=$(cd "$(dirname "$0")" && pwd); source $HERE/lib.sh
mkdir -p $W/logs $W/frost $W/wallets; rm -f $W/frost/*
FUNDER=${TROVE_FUNDER:?set TROVE_FUNDER to the funded testnet wallet folder (its .age identity sits beside it)}
ln -sfn "$FUNDER" $W/wallets/funder; ln -sf "$FUNDER.age" $W/wallets/funder.age
cp -R "$ROOT/spike/work/tls" $W/
pkill -f frostd 2>/dev/null || true; sleep 1
(cd $W && nohup $FZ/frostd -i 127.0.0.1 -p 2744 -c tls/cert.pem -k tls/key.pem > logs/frostd.log 2>&1 &); sleep 2
for n in borrower lender keeper; do $FZ/frost-client init -c $W/frost/$n.toml >/dev/null; done
env SSL_CERT_FILE=$W/tls/ca.pem $FZ/frost-client trusted-dealer -d vault -N borrower,lender,keeper -C redpallas -t 2 -n 3 \
  -c $W/frost/borrower.toml -c $W/frost/lender.toml -c $W/frost/keeper.toml -s http://127.0.0.1:2744 >$W/logs/dealer.log 2>&1
sed -i '' 's|server_url = .*|server_url = "localhost:2744"|' $W/frost/*.toml
AK=$($FZ/frost-client groups -c $W/frost/borrower.toml 2>&1 | awk '/Public key/{print $3}' | head -1)
[ -n "$AK" ] || { echo 'no group key'; exit 1; }
$FZ/zcash-sign generate --ak $AK --network test > $W/logs/vault.txt 2>&1
awk -F'"' '/Orchard-only unified address/{print $2}' $W/logs/vault.txt > $W/logs/vault.ua
awk -F'"' '/Unified Full Viewing Key/{print $2}' $W/logs/vault.txt > $W/logs/vault.ufvk
$DT wallet -w $W/wallets/vault init-fvk --name vault --fvk "$(cat $W/logs/vault.ufvk)" -s $SERVER >$W/logs/vault-init.log 2>&1
for n in borrower lender; do $DT wallet -w $W/wallets/$n init --name $n -i $W/wallets/$n.age -n test -s $SERVER </dev/null >$W/logs/$n-init.log 2>&1; waddr $n > $W/logs/$n.ua; done
waddr funder > $W/logs/funder.ua
echo "setup ok: vault $(head -c 14 $W/logs/vault.ua)..., borrower $(head -c 14 $W/logs/borrower.ua)..., lender $(head -c 14 $W/logs/lender.ua)..."
