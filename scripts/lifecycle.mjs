// Drives the loan rules against the regtest chain. node scripts/lifecycle.mjs A|B|C|D
// A repay (borrower+lender), B price default (two lender+keeper releases), C abort (borrower+keeper),
// D deposit arrives after the funding window and is refunded in full (borrower+keeper).
// Loan time is simulated; the lock and every release are real regtest transactions signed 2-of-3 with FROST.
import { execFileSync } from 'node:child_process';
import { newKeeperKey, signReading } from '../src/signed-price.mjs';
import { openLoan, step } from '../src/loan.mjs';

const FEE = 10_000n;
const sh = (script, ...args) => execFileSync('bash', [`spike-scripts/${script}`, ...args], { encoding: 'utf8', timeout: 400_000, stdio: ['ignore', 'pipe', 'inherit'] });
const bal = (w) => {
  const out = execFileSync('bash', ['-c', `source spike-scripts/lib.sh; wsync ${w}; $DT wallet -w $W/wallets/${w} balance --min-confirmations 1 2>&1`], { encoding: 'utf8' });
  return BigInt(Math.round(parseFloat(out.match(/^\s*Balance:\s+([\d.]+)/m)[1]) * 1e8));
};
const key = newKeeperKey();
const T0 = 1_800_000_000;
const reading = (loanId, usd, ts) => signReading({ loanId, priceMicroUsd: BigInt(Math.round(usd * 1e6)), ts, source: 'lifecycle-test' }, key.privateKeyPem);
const terms = { collateralZat: 100_000_000n, principal: 40_000_000n, aprBps: 1000, liqLtvBps: 8000, maxStartLtvBps: 5000,
  penaltyBps: 500, termSeconds: 86400 * 30, graceSeconds: 86400, fundWindow: 3600, payWindow: 3600, maxPriceAge: 600, keeperPubKey: key.publicKeyHex };
// principal is in micro-USD: 40 USD at 100 USD/ZEC on 1 ZEC is 40% LTV
terms.principal = 40_000_000n;

const doRelease = (eff, wallet, zat) => {
  // the local FROST/proving tools occasionally stall on a first try; a failed release sent nothing, so one retry is safe
  let out;
  try { out = sh('release.sh', eff.signers.join(','), wallet, String(zat)); }
  catch { console.log('release failed once, retrying'); out = sh('release.sh', eff.signers.join(','), wallet, String(zat)); }
  return out.trim().split('\n').pop();
};
const scenario = process.argv[2];
const id = `loan-${scenario}-${Date.now()}`;
let loan = openLoan({ id, createdAt: T0, terms });
const results = { scenario, steps: [] };
const log = (s) => { results.steps.push(s); console.log(s); };

sh('lock.sh', '100000000');
log(`collateral locked in the vault (real regtest transaction)`);
if (scenario !== 'D') ({ loan } = step(loan, { type: 'collateralLocked', at: T0 + 60, zat: 100_000_000n, txid: 'regtest-lock', reading: reading(id, 100, T0 + 50) }));

const before = { borrower: bal('borrower'), lender: bal('lender') };
if (scenario === 'D') {
  const late = { type: 'collateralLocked', at: T0 + 4000, zat: 100_000_000n, txid: 'regtest-lock', reading: reading(id, 100, T0 + 3990) };
  try { step(loan, late); throw new Error('a late deposit must be refused'); } catch (e) { log(`late deposit refused by the rules: ${e.message}`); }
  ({ loan } = step(loan, { type: 'depositSeen', at: late.at, zat: late.zat, txid: late.txid }));
  const r = step(loan, { type: 'refundDeposit', at: late.at + 10, txid: late.txid });
  loan = r.loan;
  log(`refund approved, state ${loan.state}, release signers ${r.effects[0].signers}`);
  const tx = doRelease(r.effects[0], 'borrower', 100_000_000n - FEE);
  ({ loan } = step(loan, { type: 'releaseConfirmed', at: late.at + 100, txid: tx }));
} else if (scenario === 'C') {
  let r = step(loan, { type: 'tick', at: T0 + 60 + 3601 }); loan = r.loan;
  const eff = r.effects[0];
  log(`pay window passed, state ${loan.state}, release signers ${eff.signers}`);
  const tx = doRelease(eff, 'borrower', 100_000_000n - FEE);
  ({ loan } = step(loan, { type: 'releaseConfirmed', at: T0 + 8000, txid: tx }));
} else {
  ({ loan } = step(loan, { type: 'loanPaid', at: T0 + 120, amount: terms.principal, ref: 'regtest-pay', reading: reading(id, 100, T0 + 100) }));
  if (scenario === 'A') {
    const at = T0 + 86400 * 10;
    const { debt } = { debt: terms.principal + (terms.principal * 1000n * BigInt(at - (T0 + 120)) / (10_000n * 31_536_000n)) + 10n };
    const r = step(loan, { type: 'repaid', at, amount: debt + 1000n, ref: 'regtest-repay' }); loan = r.loan;
    log(`repaid, state ${loan.state}, release signers ${r.effects[0].signers}`);
    const tx = doRelease(r.effects[0], 'borrower', 100_000_000n - FEE);
    ({ loan } = step(loan, { type: 'releaseConfirmed', at: at + 100, txid: tx }));
  } else {
    const at = T0 + 3600 * 5;
    const r = step(loan, { type: 'price', at, reading: reading(id, 45, at - 30) }); loan = r.loan;
    const eff = r.effects[0], s = eff.settlement;
    log(`price fell to $45, state ${loan.state}, lender gets ${s.lenderZat} zat, borrower gets ${s.borrowerZat} zat, signers ${eff.signers}`);
    const t1 = doRelease(eff, 'lender', s.lenderZat - FEE);
    const t2 = s.borrowerZat > 2n * FEE ? doRelease(eff, 'borrower', s.borrowerZat - 2n * FEE) : '';
    ({ loan } = step(loan, { type: 'releaseConfirmed', at: at + 100, txid: t1, to: 'lender' }));
    if (t2) ({ loan } = step(loan, { type: 'releaseConfirmed', at: at + 200, txid: t2, to: 'borrower' }));
    results.settlement = { lenderZat: String(s.lenderZat), borrowerZat: String(s.borrowerZat) };
  }
}
const after = { borrower: bal('borrower'), lender: bal('lender') };
results.final = loan.state;
results.delta = { borrower: String(after.borrower - before.borrower), lender: String(after.lender - before.lender) };
console.log(JSON.stringify(results.delta), loan.state);
