/**
 * The dollar leg: one USDC transfer on Solana with the loan reference as the memo.
 * The byte layouts here are the SPL Token and Memo programs' own; `buildUsdcPayment` turns them
 * into a transaction with the web3.js build the page loads on demand from vendor/.
 */
export const USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const USDC_DECIMALS = 6;
export const DEVNET_RPC = 'https://api.devnet.solana.com';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const SYSTEM_PROGRAM = '11111111111111111111111111111111';

/** Loan money is micro-dollars; USDC has 6 decimals, so the base units are the same number. */
export const usdcUnits = (principalMicro) => BigInt(principalMicro);

/** SPL Token `TransferChecked`: index 12, amount as u64 little-endian, then the mint's decimals. */
export function transferCheckedData(amount, decimals = USDC_DECIMALS) {
  amount = BigInt(amount);
  if (amount <= 0n || amount >= 1n << 64n) throw new RangeError('amount must fit a u64 and be above zero');
  const d = new Uint8Array(10);
  d[0] = 12;
  for (let i = 0; i < 8; i++) d[1 + i] = Number((amount >> BigInt(8 * i)) & 0xffn);
  d[9] = decimals;
  return d;
}

/** Associated Token Account `CreateIdempotent`: one byte, 1. Makes the recipient's USDC account if missing. */
export const createAtaData = () => new Uint8Array([1]);

/** SPL Memo takes the raw UTF-8 text. */
export const memoData = (text) => new TextEncoder().encode(text);

/**
 * Builds the unsigned transaction: create the recipient's USDC account if needed, TransferChecked,
 * then the memo. `web3` is the solanaWeb3 namespace; `connection` is its Connection.
 */
export async function buildUsdcPayment(web3, { connection, from, to, amount, memo, mint = USDC_DEVNET, decimals = USDC_DECIMALS }) {
  const { PublicKey, Transaction, TransactionInstruction } = web3;
  const fromPk = new PublicKey(from), toPk = new PublicKey(to), mintPk = new PublicKey(mint);
  const token = new PublicKey(TOKEN_PROGRAM), ataProgram = new PublicKey(ATA_PROGRAM);
  const ata = (owner) => PublicKey.findProgramAddressSync([owner.toBytes(), token.toBytes(), mintPk.toBytes()], ataProgram)[0];
  const src = ata(fromPk), dst = ata(toPk);
  const tx = new Transaction();
  if (!(await connection.getAccountInfo(dst))) {
    tx.add(new TransactionInstruction({ programId: ataProgram, data: createAtaData(), keys: [
      { pubkey: fromPk, isSigner: true, isWritable: true }, { pubkey: dst, isSigner: false, isWritable: true },
      { pubkey: toPk, isSigner: false, isWritable: false }, { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(SYSTEM_PROGRAM), isSigner: false, isWritable: false }, { pubkey: token, isSigner: false, isWritable: false },
    ] }));
  }
  tx.add(new TransactionInstruction({ programId: token, data: transferCheckedData(amount, decimals), keys: [
    { pubkey: src, isSigner: false, isWritable: true }, { pubkey: mintPk, isSigner: false, isWritable: false },
    { pubkey: dst, isSigner: false, isWritable: true }, { pubkey: fromPk, isSigner: true, isWritable: false },
  ] }));
  tx.add(new TransactionInstruction({ programId: new PublicKey(MEMO_PROGRAM), data: memoData(memo), keys: [] }));
  tx.feePayer = fromPk;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  return { tx, blockhash, lastValidBlockHeight };
}
