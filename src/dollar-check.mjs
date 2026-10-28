// Checks a Solana SPL token transfer (getTransaction, jsonParsed) before it becomes a loan event.
// Pure: the caller fetches the transaction and adds the keeper's signed reading to the event.

function ownerTotal(balances, owner, mint) {
  let sum = 0n;
  for (const b of balances ?? []) {
    if (b.owner === owner && b.mint === mint) sum += BigInt(b.uiTokenAmount?.amount ?? '0');
  }
  return sum;
}

const delta = (meta, owner, mint) => ownerTotal(meta.postTokenBalances, owner, mint) - ownerTotal(meta.preTokenBalances, owner, mint);
const signed = (tx, owner) => (tx.transaction?.message?.accountKeys ?? []).some((k) => k.pubkey === owner && k.signer === true);
const memos = (tx) => (tx.transaction?.message?.instructions ?? []).filter((i) => i.program === 'spl-memo').map((i) => i.parsed);

// Returns {ok:true, event} or {ok:false, reason}. `type` is 'loanPaid' (lender pays borrower)
// or 'repaid' (borrower pays lender). Amounts are base units (USDC: 6 decimals = micro-USD).
// The transfer must be signed by senderOwner, move the tokens out of senderOwner, and carry
// the loan id as an SPL memo, so a stranger's payment to the same wallet cannot be claimed.
// usedRefs is the caller's registry of every signature already counted, across all loans.
export function checkPayment(tx, { type = 'loanPaid', signature, mint, senderOwner, recipientOwner, loanId, minAmount, notBefore, notAfter, usedRefs }) {
  if (!(usedRefs instanceof Set)) throw new TypeError('usedRefs must be the Set of signatures already counted');
  const no = (reason) => ({ ok: false, reason });
  if (type !== 'loanPaid' && type !== 'repaid') return no('unknown event type');
  if (!senderOwner || !recipientOwner || senderOwner === recipientOwner) return no('sender and recipient must be two different wallets');
  if (!loanId) return no('loan id is required');
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
  const got = delta(tx.meta, recipientOwner, mint);
  if (got <= 0n) return no('recipient received nothing in this token');
  if (!signed(tx, senderOwner)) return no('the expected sender did not sign this transfer');
  if (!memos(tx).includes(loanId)) return no('transfer does not carry this loan id as a memo');
  if (-delta(tx.meta, senderOwner, mint) < got) return no('the tokens did not come from the expected sender');
  if (got < BigInt(minAmount)) return no('transfer is below the amount owed');
  return { ok: true, event: { type, at, amount: got, ref: signature } };
}
