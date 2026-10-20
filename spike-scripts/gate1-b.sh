#!/bin/bash
# Gate 1 stage B (run after gate1-a.sh): 2-of-3 FROST spend of the vault, as run by hand on 2026-10-20.
# Needs spike/work/tls (throwaway CA + leaf cert for localhost: frost-client always speaks https://host:port,
# and reads trust roots from SSL_CERT_FILE). frost/*.toml server_url must be "localhost:2744" (no scheme).
set -e
W=~/Projects/shielded-lend/spike/work; cd $W
Z=~/Projects/shielded-lend/spike/frost-zcash-demo/target/release
D=~/Projects/snarks-launchpad/probe/zcash-batch/work/bin/zcash-devtool
G=$(awk '/Public key/{print $3; exit}' <($Z/frost-client groups -c frost/borrower.toml))
L=$(awk '/lender/{gsub(/[()]/,"",$2); print $2}' <($Z/frost-client groups -c frost/borrower.toml))
K=$(awk '/keeper/{gsub(/[()]/,"",$2); print $2}' <($Z/frost-client groups -c frost/borrower.toml))
E="SSL_CERT_FILE=$W/tls/ca.pem"; RPC=http://127.0.0.1:18232
ACCT=$($D wallet -w wallets/vault list-accounts 2>/dev/null | awk '/Account/{print $NF; exit}')
FUA=$(cat logs/funder.ua)
$D pczt -w wallets/vault create $ACCT --address "$FUA" --value 30000000 --target-note-count 1 --output logs/spend.pczt
$D pczt prove logs/spend.pczt --output logs/proved.pczt
rm -f logs/sig.fifo; mkfifo logs/sig.fifo
(nohup sh -c "sleep 300 > logs/sig.fifo" >/dev/null 2>&1 &)
(nohup sh -c "$Z/zcash-sign sign -i logs/proved.pczt -o logs/signed.pczt < logs/sig.fifo > logs/sign.out 2>&1" >/dev/null 2>&1 &)
sleep 4
xxd -r -p <(awk '/SIGHASH/{print $2}' logs/sign.out) > logs/m.bin
xxd -r -p <(awk '/Randomizer/{print $NF}' logs/sign.out) > logs/r.bin
(nohup $Z/frostd -i 127.0.0.1 -p 2744 -c tls/cert.pem -k tls/key.pem > logs/frostd.log 2>&1 &); sleep 2
(nohup env $E $Z/frost-client coordinator -c frost/borrower.toml -g $G -S $L,$K -m logs/m.bin -r logs/r.bin -o - > logs/coord.out 2>&1 &); sleep 4
for P in lender keeper; do (nohup sh -c "echo y | env $E $Z/frost-client participant -c frost/$P.toml -g $G > logs/$P.out 2>&1" >/dev/null 2>&1 &); done
sleep 12; tail -1 logs/coord.out > logs/sig.hex; cat logs/sig.hex > logs/sig.fifo; sleep 3
$D pczt -w wallets/vault send logs/signed.pczt -s 127.0.0.1:8137 | tail -1 | tee logs/send.out
