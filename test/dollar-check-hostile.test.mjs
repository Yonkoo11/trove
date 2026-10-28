import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPayment } from '../src/dollar-check.mjs';

// Malformed RPC data or caller options must give {ok:false, reason}, never a throw and never ok:true.
const MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const LENDER = 'FMbu8WyM9RrFYDBqSLHDZZjWHit4dfzCeseXx22AWQx4';
const BORROWER = '8A8mfYzzFY4xgpE32FoM7TpVY7SCShejHWMp6g9yowo5';
const SIG = '5sig';
const T0 = 1_000_000;

const bal = (owner, amount, mint = MINT) => ({ mint, owner, uiTokenAmount: { amount, decimals: 6 } });
const tx = ({ fromBefore = '500000000', fromAfter = '300000000', toBefore = '0', toAfter = '200000000', at = T0 + 95, extraPre = [], extraPost = [], keys, instructions } = {}) => ({
  blockTime: at,
  meta: {
    err: null,
    preTokenBalances: [bal(LENDER, fromBefore), bal(BORROWER, toBefore), ...extraPre],
    postTokenBalances: [bal(LENDER, fromAfter), bal(BORROWER, toAfter), ...extraPost],
  },
  transaction: {
    signatures: [SIG],
    message: {
      accountKeys: keys ?? [{ pubkey: LENDER, signer: true }, { pubkey: BORROWER, signer: false }],
      instructions: instructions ?? [{ program: 'spl-memo', parsed: 'L1' }],
    },
  },
});
const opts = (o = {}) => ({ signature: SIG, mint: MINT, senderOwner: LENDER, recipientOwner: BORROWER, loanId: 'L1', minAmount: 200_000_000n, notBefore: T0, notAfter: T0 + 3600, usedRefs: new Set(), ...o });

test('the clean fixture passes, so every refusal below is caused by its one change', () => {
  assert.equal(checkPayment(tx(), opts()).ok, true);
});

const refused = [
  ['negative recipient amount', tx({ toAfter: '-200000000' }), {}],
  ['hex recipient amount', tx({ toAfter: '0xbebc200' }), {}],
  ['blank recipient amount', tx({ toAfter: '' }), {}],
  ['amount as a number, not a string', tx({ toAfter: 200000000 }), {}],
  ['amount with a decimal point', tx({ toAfter: '200000000.5' }), {}],
  ['amount with spaces', tx({ toAfter: ' 200000000' }), {}],
  ['31-digit amount', tx({ toAfter: '1'.repeat(31) }), {}],
  ['negative sender amount', tx({ fromAfter: '-1' }), {}],
  ['NaN block time', tx({ at: NaN }), {}],
  ['fractional block time', tx({ at: T0 + 95.5 }), {}],
  ['block time as a string', tx({ at: String(T0 + 95) }), {}],
  ['zero block time', tx({ at: 0 }), {}],
  ['missing mint option', tx(), { mint: undefined }],
  ['mint option as a number', tx(), { mint: 1 }],
  ['negative amount owed', tx(), { minAmount: -1n }],
  ['fractional amount owed', tx(), { minAmount: 1.5 }],
  ['hex amount owed', tx(), { minAmount: '0x10' }],
  ['NaN amount owed', tx(), { minAmount: NaN }],
  ['missing amount owed', tx(), { minAmount: undefined }],
  ['junk balance entry for the recipient', tx({ extraPost: [{ owner: BORROWER, mint: MINT, uiTokenAmount: null }] }), {}],
  ['junk balance entry with no uiTokenAmount', tx({ extraPost: [{ owner: BORROWER, mint: MINT }] }), {}],
  ['duplicate sender entry hiding where the tokens came from', tx({ extraPost: [bal(LENDER, '200000000')] }), {}],
  ['accountKeys is not a list', tx({ keys: { 0: { pubkey: LENDER, signer: true } } }), {}],
  ['instructions is not a list', tx({ instructions: { program: 'spl-memo', parsed: 'L1' } }), {}],
  ['memo is an object, not the loan id', tx({ instructions: [{ program: 'spl-memo', parsed: { toString: () => 'L1' } }] }), {}],
  ['fractional notBefore', tx(), { notBefore: 1.5 }],
  ['junk notAfter', tx(), { notAfter: 'later' }],
];

for (const [name, t, o] of refused) {
  test(`refused, not thrown: ${name}`, () => {
    let r;
    assert.doesNotThrow(() => { r = checkPayment(t, opts(o)); });
    assert.equal(r.ok, false, `expected a refusal, got ${JSON.stringify(r, (_, v) => typeof v === 'bigint' ? String(v) : v)}`);
    assert.equal(typeof r.reason, 'string');
  });
}

test('null entries and other mints in the balance lists are skipped, not counted', () => {
  const r = checkPayment(tx({ extraPre: [null, bal(BORROWER, 'junk', 'OtherMint')], extraPost: [undefined, bal(BORROWER, '999', 'OtherMint')] }), opts());
  assert.equal(r.ok, true);
  assert.equal(r.event.amount, 200_000_000n);
});

test('amount owed as a decimal string or safe integer is accepted', () => {
  assert.equal(checkPayment(tx(), opts({ minAmount: '200000000' })).ok, true);
  assert.equal(checkPayment(tx(), opts({ minAmount: 200_000_000 })).ok, true);
});

// Seeded fuzz: random edits to one balance amount. Each result is a clean refusal or a pass
// whose amount is exactly what the recipient gained, never a throw.
test('fuzz: 2000 random balance strings never throw and never overpay', () => {
  let seed = Number(process.env.FUZZ_SEED ?? 7);
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pieces = ['0', '1', '9', '-', '.', 'x', 'e', ' ', '', '00', '200000000', '1e9', 'NaN', '٣'];
  const pick = () => pieces[Math.floor(rand() * pieces.length)];
  for (let i = 0; i < 2000; i++) {
    const s = Array.from({ length: 1 + Math.floor(rand() * 4) }, pick).join('');
    const field = ['fromBefore', 'fromAfter', 'toBefore', 'toAfter'][Math.floor(rand() * 4)];
    let r;
    assert.doesNotThrow(() => { r = checkPayment(tx({ [field]: s }), opts()); }, `threw on ${field}=${JSON.stringify(s)}`);
    if (r.ok) {
      const t = tx({ [field]: s });
      const gained = BigInt(t.meta.postTokenBalances[1].uiTokenAmount.amount) - BigInt(t.meta.preTokenBalances[1].uiTokenAmount.amount);
      assert.equal(r.event.amount, gained, `${field}=${JSON.stringify(s)}`);
      assert.ok(gained >= 200_000_000n);
    }
  }
});
