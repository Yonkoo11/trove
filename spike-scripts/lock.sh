#!/usr/bin/env bash
# lock.sh <zat>: the funder (standing in for the borrower's wallet) sends collateral into the vault and mines it in.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); source $HERE/lib.sh
wsync funder
$DT wallet -w $W/wallets/funder send -i $W/wallets/funder.age --address "$(cat $W/logs/vault.ua)" --value "$1" --target-note-count 1 -s $SERVER 2>&1 | tail -1
mine 12; wsync vault
