#!/usr/bin/env bash
# release.sh <signerA,signerB> <dest-wallet-name> <zat>: spend from the vault to a wallet, needs 2 of 3 FROST signers.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); source $HERE/lib.sh
PAIR=$1; DEST=$2; VAL=$3; cd $W
pkill -f "frost-client coordinator" 2>/dev/null || true; pkill -f "frost-client participant" 2>/dev/null || true
pkill -f "zcash-sign sign" 2>/dev/null || true; pkill -f frostd 2>/dev/null || true; sleep 1
GRP=$($FZ/frost-client groups -c frost/borrower.toml 2>&1)
G=$(echo "$GRP" | awk '/Public key/{print $3}' | head -1)
idof(){ if [ "$1" = borrower ]; then echo "$GRP" | awk '/^[[:space:]]*\(/{gsub(/[()[:space:]]/,""); print; exit}'; else echo "$GRP" | awk -v n="$1" '$0 ~ n {gsub(/[()]/,"",$2); print $2}' | head -1; fi; }
A=${PAIR%,*}; B=${PAIR#*,}; IDS="$(idof $A),$(idof $B)"
E="SSL_CERT_FILE=$W/tls/ca.pem"
wsync vault
ACCT=$($DT wallet -w wallets/vault list-accounts 2>/dev/null | awk '/^Account /{print $2; exit}')
$DT pczt -w wallets/vault create $ACCT --address "$(cat logs/$DEST.ua)" --value "$VAL" --target-note-count 1 --output logs/spend.pczt
$DT pczt prove logs/spend.pczt --output logs/proved.pczt
rm -f logs/sig.fifo logs/signed.pczt logs/sign.out logs/coord.out; mkfifo logs/sig.fifo
(nohup sh -c "sleep 120 > logs/sig.fifo" >/dev/null 2>&1 &)
(nohup sh -c "$FZ/zcash-sign sign -i logs/proved.pczt -o logs/signed.pczt < logs/sig.fifo > logs/sign.out 2>&1" >/dev/null 2>&1 &)
for _ in $(seq 1 60); do /usr/bin/grep -q "Input hex-encoded" logs/sign.out 2>/dev/null && break; sleep 1; done
awk '/SIGHASH/{print $2}' logs/sign.out | xxd -r -p > logs/m.bin
(nohup $FZ/frostd -i 127.0.0.1 -p 2744 -c tls/cert.pem -k tls/key.pem > logs/frostd.log 2>&1 &); sleep 2
# one FROST signature per spent note (each has its own randomizer); the coordinator is always borrower.toml's client
rm -f logs/sig.hex
for R in $(awk '/Randomizer/{print $NF}' logs/sign.out); do
  echo "$R" | xxd -r -p > logs/r.bin; rm -f logs/coord.out
  (nohup env $E $FZ/frost-client coordinator -c frost/borrower.toml -g $G -S $IDS -m logs/m.bin -r logs/r.bin -o - > logs/coord.out 2>&1 &); sleep 4
  for P in $A $B; do (nohup sh -c "echo y | env $E $FZ/frost-client participant -c frost/$P.toml -g $G > logs/$P.out 2>&1" >/dev/null 2>&1 &); done
  for _ in $(seq 1 40); do [ -s logs/coord.out ] && [ "$(tail -1 logs/coord.out | wc -c)" -gt 100 ] && break; sleep 1; done
  tail -1 logs/coord.out >> logs/sig.hex
  sleep 2; pkill -f "frost-client participant" 2>/dev/null || true; pkill -f "frost-client coordinator" 2>/dev/null || true
done
cat logs/sig.hex > logs/sig.fifo; sleep 3
$DT pczt -w wallets/vault send logs/signed.pczt -s $SERVER | tail -1
mine 12; wsync vault
