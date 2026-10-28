// Fetches one Solana devnet transaction and prints whether it counts as a loan payment.
// node scripts/check-payment.mjs --sig <signature> --from <sender wallet> --to <recipient wallet> --loan <loan id>
//   --min <base units> [--type loanPaid|repaid] [--after <unix s>] [--before <unix s>] [--save <file.json>] [--rpc <url>]
// One read-only check: it keeps no record of past transfers, so it cannot refuse a replay across runs.
import { writeFileSync } from 'node:fs';
import { checkPayment } from '../src/dollar-check.mjs';

const USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
if (!args.sig || !args.from || !args.to || !args.loan || !args.min) { console.error('need --sig, --from, --to, --loan and --min'); process.exit(2); }
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
  type: args.type ?? 'loanPaid', signature: args.sig, mint: args.mint ?? USDC_DEVNET, senderOwner: args.from, recipientOwner: args.to,
  loanId: args.loan, minAmount: BigInt(args.min), notBefore: args.after === undefined ? undefined : BigInt(args.after), notAfter: args.before === undefined ? undefined : BigInt(args.before), usedRefs: new Set(),
});
console.log(r.ok ? `counts: ${r.event.type}, ${r.event.amount} base units at ${r.event.at}` : `refused: ${r.reason}`);
process.exit(r.ok ? 0 : 1);
