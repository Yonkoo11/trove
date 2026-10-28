// Fetches one Solana devnet transaction and prints whether it counts as a loan payment.
// node scripts/check-payment.mjs --sig <signature> --to <recipient wallet> --min <base units> [--type loanPaid|repaid]
//   [--after <unix s>] [--before <unix s>] [--save <file.json>] [--rpc <url>]
import { writeFileSync } from 'node:fs';
import { checkPayment } from '../src/dollar-check.mjs';

const USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
if (!args.sig || !args.to || !args.min) { console.error('need --sig, --to and --min'); process.exit(2); }
const rpc = args.rpc ?? 'https://api.devnet.solana.com';

const res = await fetch(rpc, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [args.sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }] }),
});
if (!res.ok) { console.error(`rpc answered ${res.status}`); process.exit(2); }
const body = await res.json();
if (body.error) { console.error(`rpc error: ${body.error.message}`); process.exit(2); }
if (args.save && body.result) writeFileSync(args.save, JSON.stringify(body.result, null, 2) + '\n');

const r = checkPayment(body.result, {
  type: args.type ?? 'loanPaid', signature: args.sig, mint: args.mint ?? USDC_DEVNET, recipientOwner: args.to,
  minAmount: BigInt(args.min), notBefore: args.after, notAfter: args.before,
});
console.log(r.ok ? `counts: ${r.event.type}, ${r.event.amount} base units at ${r.event.at}` : `refused: ${r.reason}`);
process.exit(r.ok ? 0 : 1);
