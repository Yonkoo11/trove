#!/usr/bin/env bash
# Gate 2 setup: fresh regtest chain + funder + FROST group (gate1-a), then the vault (view-only), borrower and lender wallets.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); source $HERE/lib.sh
bash $HERE/gate1-a.sh >/dev/null
# frost-client always speaks https://{server_url}, so the scheme must go
sed -i '' 's|server_url = .*|server_url = "localhost:2744"|' $W/frost/*.toml
GRP=$($FZ/frost-client groups -c $W/frost/borrower.toml 2>&1)
AK=$(echo "$GRP" | awk '/Public key/{print $3}' | head -1)
[ -n "$AK" ] || { echo 'no group key'; exit 1; }
$FZ/zcash-sign generate --ak $AK --network regtest > $W/logs/vault.txt 2>&1
awk -F'"' '/Orchard-only unified address/{print $2}' $W/logs/vault.txt > $W/logs/vault.ua
awk -F'"' '/Unified Full Viewing Key/{print $2}' $W/logs/vault.txt > $W/logs/vault.ufvk
$DT wallet -w $W/wallets/vault init-fvk --name vault --fvk "$(cat $W/logs/vault.ufvk)" --birthday 1 -s $SERVER >/dev/null 2>&1
for n in borrower lender; do
  for _ in 1 2 3 4 5; do rm -rf $W/wallets/$n; timeout 30 $DT wallet -w $W/wallets/$n init --name $n -i $W/wallets/$n.age -n regtest --activation-heights $OLD/config/activation-heights.toml -s $SERVER </dev/null >/dev/null 2>&1 && [ -f $W/wallets/$n/data.sqlite ] && break; sleep 3; done
  waddr $n > $W/logs/$n.ua
done
echo "setup ok: vault $(head -c 24 $W/logs/vault.ua)..., borrower $(head -c 24 $W/logs/borrower.ua)..., lender $(head -c 24 $W/logs/lender.ua)..."
