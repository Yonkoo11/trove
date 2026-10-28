#!/bin/bash
# Forged-signature check against the live regtest node: two bad signatures on fresh spends, each must be rejected.
# Case 1: 64 random bytes. Case 2: the valid signature from the earlier spend (logs/sig.hex) replayed on a new message.
HERE=$(cd "$(dirname "$0")" && pwd); source $HERE/lib.sh
Z=$FZ; D=$DT; cd $W
ACCT=$($D wallet -w wallets/vault list-accounts 2>/dev/null | awk "/^Account/{print \$2; exit}")
FUA=$(cat logs/funder.ua)
try() { # $1 label, $2 signature hex
  $D pczt -w wallets/vault create $ACCT --address "$FUA" --value 1000000 --target-note-count 1 --output logs/f.pczt >/dev/null 2>&1 || { echo "$1: could not build spend"; return; }
  $D pczt prove logs/f.pczt --output logs/fp.pczt >/dev/null 2>&1
  rm -f logs/f.fifo; mkfifo logs/f.fifo
  (sleep 8 > logs/f.fifo &) ; ($Z/zcash-sign sign -i logs/fp.pczt -o logs/fs.pczt < logs/f.fifo > logs/f.out 2>&1 &)
  sleep 3; echo "$2" > logs/f.fifo; sleep 3
  [ -f logs/fs.pczt ] || { echo "$1: signer refused the signature: $(tail -1 logs/f.out | cut -c1-120)"; return; }
  echo "$1: node says: $($D pczt -w wallets/vault send logs/fs.pczt -s 127.0.0.1:8137 2>&1 | tail -2 | tr '\n' ' ' | cut -c1-300)"
  rm -f logs/fs.pczt
}
try random "$(head -c 64 /dev/urandom | xxd -p -c 128)"
try replay "$(head -1 logs/sig.hex | tr -d '\n ')"
