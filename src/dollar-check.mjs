// Checks a Solana SPL token transfer (getTransaction, jsonParsed) before it becomes a loan event.
// Pure: the caller fetches the transaction and adds the keeper's signed reading to the event.

function ownerTotal(balances, owner, mint) {
  let sum = 0n;
  for (const b of balances ?? []) {
    if (b.owner === owner && b.mint === mint) sum += BigInt(b.uiTokenAmount?.amount ?? '0');
  }
  return sum;
}

// Returns {ok:true, event} or {ok:false, reason}. `type` is 'loanPaid' (lender pays borrower)
// or 'repaid' (borrower pays lender). Amounts are base units (USDC: 6 decimals = micro-USD).
export function checkPayment(tx, { type = 'loanPaid', signature, mint, recipientOwner, minAmount, notBefore, notAfter, usedRefs = new Set() }) {
  const no = (reason) => ({ ok: false, reason });
  if (type !== 'loanPaid' && type !== 'repaid') return no('unknown event type');
  if (!tx) return no('transaction not found');
  if (!signature || tx.transaction?.signatures?.[0] !== signature) return no('signature does not match the transaction');
  if (usedRefs.has(signature)) return no('this transfer was already counted');
  if (tx.meta?.err !== null && tx.meta?.err !== undefined) return no('transaction failed on chain');
  if (!tx.meta) return no('transaction has no balance data');
  if (typeof tx.blockTime !== 'number') return no('transaction has no block time');
  const at = tx.blockTime;
  // Loan times are BigInt; Solana blockTime is a number. Compare as BigInt.
  if (notBefore !== undefined && BigInt(at) < BigInt(notBefore)) return no('transfer is older than the loan');
  if (notAfter !== undefined && BigInt(at) > BigInt(notAfter)) return no('transfer arrived after the window');
  const delta = ownerTotal(tx.meta.postTokenBalances, recipientOwner, mint) - ownerTotal(tx.meta.preTokenBalances, recipientOwner, mint);
  if (delta <= 0n) return no('recipient received nothing in this token');
  if (delta < BigInt(minAmount)) return no('transfer is below the amount owed');
  return { ok: true, event: { type, at, amount: delta, ref: signature } };
}
