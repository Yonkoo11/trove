import { collateralValue, interestDue, ltvBps, ZAT_PER_ZEC } from './lib/money.mjs';
import { DEFAULT_LIMITS } from './lib/defaults.mjs';
import { TERM_S, REGTEST, interestMicro, buildTerms, encodeRequest, decodeRequest } from './lib/terms.mjs';

const NAME = 'Trove';
const STORED = { micro: 1_240_743_930n, label: 'Last stored close, 22 Oct 2026' };

const RUNS = {
  A: { id: 'A', name: 'Repaid on time', tag: 'Repaid', good: true, signers: 'borrower + lender',
    paid: [['Borrower', 99_990_000]], path: ['proposed', 'collateral_locked', 'active', 'repaid', 'closed_repaid'],
    end: 'Borrower and lender sign the release. The keeper is not needed.' },
  B: { id: 'B', name: 'Price default', tag: 'Defaulted', good: false, signers: 'lender + keeper',
    paid: [['Lender', 93_328_625], ['Borrower', 6_641_375]], path: ['proposed', 'collateral_locked', 'active', 'defaulted', 'closed_defaulted'],
    end: 'The keeper signs a price past the liquidation line and the lender signs with it. Two payouts: lender share, borrower remainder.' },
  C: { id: 'C', name: 'Aborted before funding', tag: 'Aborted', good: false, signers: 'borrower + keeper',
    paid: [['Borrower', 99_990_000]], path: ['proposed', 'collateral_locked', 'aborted', 'closed_aborted'],
    end: 'The lender never paid, so the borrower and keeper sign the collateral back.' },
  D: { id: 'D', name: 'Late deposit refunded', tag: 'Aborted', good: false, signers: 'borrower + keeper',
    paid: [['Borrower', 99_990_000]], path: ['proposed', 'deposit_seen', 'refund_deposit', 'closed_aborted'],
    end: 'The collateral arrived after the funding window, so the rules refused the loan and the borrower and keeper sign it back.' },
};

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const fmt = (n) => Number(n).toLocaleString('en-US');
const usd = (micro) => '$' + (Number(micro / 10_000n) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

function parseUnits(str, dec) {
  const m = new RegExp(`^(\\d+)(?:\\.(\\d{1,${dec}}))?$`).exec(String(str).trim());
  if (!m) return null;
  return BigInt(m[1]) * 10n ** BigInt(dec) + BigInt((m[2] ?? '').padEnd(dec, '0') || '0');
}

// ---- price: live read is best effort, stored close is the labelled fallback
let price = { ...STORED, live: false };
const priceListeners = new Set();
async function loadPrice() {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&precision=6', { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return;
    const usdPrice = (await r.json())?.zcash?.usd;
    const m = parseUnits(String(usdPrice), 6);
    if (m === null || m * 10n < STORED.micro || m > STORED.micro * 10n) return;
    price = { micro: m, label: 'Live read from CoinGecko', live: true };
    priceListeners.forEach((f) => f());
  } catch { /* stay on the stored close */ }
}

// ---- gate 1 fields
let gate1 = { status: 'loading' };
const gateListeners = new Set();
fetch('gate1-viewer-fields.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((j) => { gate1 = { status: 'ok', data: j }; })
  .catch(() => { gate1 = { status: 'error' }; })
  .finally(() => gateListeners.forEach((f) => f()));

function stubPanel() {
  const box = h('aside', { class: 'stub', 'aria-label': 'What the chain shows' });
  const draw = () => {
    box.replaceChildren(h('h2', {}, 'What the chain shows'),
      h('p', { class: 'sub' }, 'A public viewer looking at a vault release.'));
    if (gate1.status === 'loading') { box.append(h('p', {}, 'Loading the recorded fields…')); return; }
    if (gate1.status === 'error') { box.append(h('p', { class: 'error' }, 'Could not load gate1-viewer-fields.json.')); return; }
    const d = gate1.data;
    const rows = [
      ['Fee (value balance)', `${fmt(d.valueBalanceZat)} zat`],
      ['Transparent in', String(d.transparent_in_out?.[0] ?? 0)],
      ['Transparent out', String(d.transparent_in_out?.[1] ?? 0)],
      ['Shielded actions', String(d.ironwood_actions)],
    ];
    const dl = h('dl');
    for (const [k, v] of rows) dl.append(h('div', { class: 'row' }, h('dt', {}, k), h('span', { class: 'lead-dots' }), h('dd', {}, v)));
    box.append(dl, h('p', { class: 'note' }, 'Everything else about the transaction is sealed: who sent it, who received it and how much.'),
      h('details', {}, h('summary', {}, 'Raw fields a viewer can read on each action'),
        h('ul', { class: 'fields' }, (d.public_fields_per_action ?? []).map((f) => h('li', {}, f)))),
      h('p', { class: 'note' }, `Checked on one transaction: ${String(d.txid).slice(0, 8)}…${String(d.txid).slice(-4)}, height ${d.height}. This is a release from the vault (lender and keeper signed), not the deposit; no deposit transaction is shown. Amounts and addresses are not among these fields. The stablecoin leg is on another chain and is public.`));
  };
  gateListeners.add(draw); draw();
  return box;
}

// ---- Borrow
function quote(zecStr, borrowStr) {
  const zat = parseUnits(zecStr, 8);
  if (zat === null || zat === 0n) return { error: zecStr.trim() === '' ? '' : 'Enter a ZEC amount, up to 8 decimals.' };
  const value = collateralValue(zat, price.micro);
  const maxMicro = value * BigInt(DEFAULT_LIMITS.maxStartLtvBps) / 10_000n;
  const maxCents = maxMicro / 10_000n;
  let cents;
  {
    const c = parseUnits(borrowStr, 2);
    if (c === null) return { error: 'Enter a dollar amount, up to 2 decimals.' };
    cents = c;
  }
  if (cents === 0n) return { error: 'That ZEC amount is too small to borrow against.' };
  if (cents > maxCents) return { error: `At most ${usd(maxCents * 10_000n)} can be borrowed against ${zecStr.trim()} ZEC at the ${DEFAULT_LIMITS.maxStartLtvBps / 100}% opening limit.` };
  const principal = cents * 10_000n;
  const interest = interestMicro(principal);
  const liq = (principal * ZAT_PER_ZEC * 10_000n + BigInt(DEFAULT_LIMITS.liqLtvBps) * zat - 1n) / (BigInt(DEFAULT_LIMITS.liqLtvBps) * zat);
  return { zat, principal, maxMicro: maxCents * 10_000n, ltv: ltvBps(principal, zat, price.micro), interest, total: principal + interest, liq };
}

function borrowScreen() {
  const zec = h('input', { id: 'zec', inputmode: 'decimal', autocomplete: 'off', value: '1', 'aria-describedby': 'zec-hint' });
  const bor = h('input', { id: 'bor', inputmode: 'decimal', autocomplete: 'off', value: '200', 'aria-describedby': 'bor-hint' });
  const err = h('p', { class: 'error', role: 'alert' });
  const big = h('span', { class: 'big' });
  const maxHint = h('p', { class: 'hint', id: 'zec-hint' });
  const priceNote = h('p', { class: 'small' });
  const live = h('button', { class: 'btn quiet', type: 'button', onclick: () => { live.disabled = true; loadPrice(); } }, 'Use live price (your browser asks CoinGecko)');
  const lines = h('ul', { class: 'lines' });
  const say = h('div', { class: 'say' });
  const terms = h('div', { class: 'terms', hidden: '' });
  const btn = h('button', { class: 'btn', type: 'button' }, 'Request this loan');
  let q = null;

  const line = (k, v) => h('li', {}, h('span', {}, k), h('span', {}, v));
  const update = () => {
    q = quote(zec.value, bor.value);
    priceNote.textContent = `ZEC price used: ${usd(price.micro)}. ${price.label}.`;
    terms.hidden = true;
    if (q.error !== undefined) {
      err.textContent = q.error; btn.disabled = true;
      big.textContent = '$0.00'; lines.replaceChildren(); say.replaceChildren(); maxHint.textContent = '';
      return;
    }
    err.textContent = ''; btn.disabled = false;
    big.textContent = usd(q.principal);
    maxHint.textContent = '';
    const apr = DEFAULT_LIMITS.aprBps / 100;
    lines.replaceChildren(
      line('You can borrow up to', usd(q.maxMicro)),
      line('Loan to value', `${(Number(q.ltv) / 100).toFixed(2)}%`),
      line('Liquidation price', `${usd(q.liq)} per ZEC`),
      line(`Interest at ${apr}% APR, 30 days`, usd(q.interest)),
      line('Total to repay', usd(q.total)));
    say.replaceChildren(
      h('p', {}, `You lock ${zec.value.trim()} ZEC in a vault. Nobody can spend it alone: any 2 of 3 keys (you, the lender, the keeper) are needed.`),
      h('p', {}, `If you repay ${usd(q.total)} within 30 days, you and the lender sign the collateral back to you.`),
      h('p', {}, `If the price falls to ${usd(q.liq)} per ZEC or you miss the term plus one day of grace, the lender and keeper sign, and the lender takes what is owed plus a ${DEFAULT_LIMITS.penaltyBps / 100}% penalty.`));
  };

  btn.addEventListener('click', () => {
    if (!q || q.error !== undefined) return;
    const code = encodeRequest(q.zat, q.principal);
    const link = `${location.origin}${location.pathname}#/lend/${code}`;
    const copyBtn = (label, text) => {
      const b = h('button', { class: 'btn quiet', type: 'button', onclick: async () => {
        try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; } catch { b.textContent = 'Copy failed, select the text'; }
      } }, label);
      return b;
    };
    terms.replaceChildren(h('p', { class: 'label' }, 'Your loan request'), h('pre', {}, code), 
      h('div', { class: 'row-btns' }, copyBtn('Copy request code', code), copyBtn('Copy link for the lender', link)),
      h('p', { class: 'small' }, 'Send this to a lender. It holds only the collateral and the dollar amount; rates and limits are the shared ones. Nothing is sent from this page, and the keeper’s key is added when the loan opens.'));
    terms.hidden = false;
  });
  zec.addEventListener('input', update);
  bor.addEventListener('input', update);
  priceListeners.add(update);

  const ticket = h('form', { class: 'panel ticket', onsubmit: (e) => e.preventDefault() },
    h('label', { class: 'field', for: 'zec' }, h('span', {}, 'Collateral'), h('div', { class: 'input' }, zec, h('span', { class: 'unit' }, 'ZEC')), maxHint),
    h('label', { class: 'field', for: 'bor' }, h('span', {}, 'Borrow'), h('div', { class: 'input' }, bor, h('span', { class: 'unit' }, 'USD')), h('p', { class: 'hint', id: 'bor-hint' }, 'Public on the other chain; it bounds your collateral.')),
    h('div', { class: 'field' }, h('span', {}, 'Term'), h('p', {}, '30 days, fixed')),
    err,
    h('div', { class: 'result' }, h('span', { class: 'label' }, 'You receive'), big),
    btn, terms, lines, priceNote, live);
  update();

  return h('section', { class: 'screen' },
    h('h1', {}, 'Borrow dollars against your ZEC, with the collateral held in a shielded vault.'),
    h('p', { class: 'lead' }, 'A fixed 30-day loan. The dollars arrive on another chain, where they are visible.'),
    h('div', { class: 'grid' }, ticket, stubPanel()), say);
}

// ---- Loans
const zatLine = (paid) => paid.map(([who, z]) => `${who} +${fmt(z)} zat`).join(', ');
const stubNote = 'Fee-only view checked on one vault release; each run’s own transaction is not stored.';

function loansScreen() {
  const body = h('tbody');
  for (const r of Object.values(RUNS)) {
    body.append(h('tr', {},
      h('td', { 'data-label': 'Run' }, h('a', { href: `#/loan/${r.id}` }, `${r.id}: ${r.name}`)),
      h('td', { 'data-label': 'State' }, h('span', { class: `tag ${r.good ? 'good' : 'bad'}` }, r.tag)),
      h('td', { 'data-label': 'Signers' }, r.signers),
      h('td', { 'data-label': 'Paid out' }, zatLine(r.paid))));
  }
  return h('section', { class: 'screen' }, h('h1', {}, 'Loans'),
    h('p', { class: 'lead' }, 'Four runs on a local test chain. No real funds moved.'),
    h('div', { class: 'panel' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Run', 'State', 'Signers', 'Paid out'].map((c) => h('th', {}, c)))), body)),
    h('p', { class: 'small say' }, stubNote));
}

function loanScreen(id) {
  const r = Object.hasOwn(RUNS, id) ? RUNS[id] : null;
  if (!r) return h('section', { class: 'screen' }, h('h1', {}, 'No such loan'), h('a', { class: 'back', href: '#/loans' }, 'Back to loans'));
  return h('section', { class: 'screen' }, h('a', { class: 'back', href: '#/loans' }, 'Back to loans'),
    h('h1', {}, `Run ${r.id}: ${r.name}`),
    h('div', { class: 'cols' },
      h('div', { class: 'panel' }, h('h3', {}, 'State timeline'), h('ol', { class: 'timeline' }, r.path.map((s) => h('li', {}, s.replaceAll('_', ' ')))),
        h('p', { class: 'small', style: 'margin-top:16px' }, `Signers at the end: ${r.signers}. ${r.end}`)),
      h('div', { class: 'stack' },
        h('div', { class: 'panel' }, h('h3', {}, 'Paid out'), h('p', {}, zatLine(r.paid))),
        h('div', { class: 'panel' }, h('h3', {}, 'What stays public'),
          h('p', {}, 'The stablecoin leg on the other chain, and the keeper’s price reading. The vault release hides amounts and addresses. The loan amount in dollars is public, and with the price it bounds the collateral.'))),
      stubPanel()));
}

// ---- Lend
function requestPanel(code) {
  const input = h('input', { id: 'code', autocomplete: 'off', spellcheck: 'false', value: code, placeholder: 'trove1.…' });
  const out = h('div', {});
  const show = () => {
    const raw = input.value.trim();
    if (!raw) { out.replaceChildren(); return; }
    const r = decodeRequest(raw);
    if (!r) { out.replaceChildren(h('p', { class: 'error', role: 'alert' }, 'That is not a Trove request code. It looks like trove1.<zatoshis>.<cents>.')); return; }
    const t = r.terms, zecAmt = Number(r.zat) / 1e8, ltv = ltvBps(r.principal, r.zat, price.micro);
    const interest = interestMicro(r.principal);
    const over = ltv > BigInt(DEFAULT_LIMITS.maxStartLtvBps);
    const liq = (r.principal * ZAT_PER_ZEC * 10_000n + BigInt(DEFAULT_LIMITS.liqLtvBps) * r.zat - 1n) / (BigInt(DEFAULT_LIMITS.liqLtvBps) * r.zat);
    const line = (k, v) => h('li', {}, h('span', {}, k), h('span', {}, v));
    out.replaceChildren(
      over ? h('p', { class: 'error', role: 'alert' }, `At ${usd(price.micro)} per ZEC this request opens at ${(Number(ltv) / 100).toFixed(2)}% loan to value, above the ${DEFAULT_LIMITS.maxStartLtvBps / 100}% limit. The rules would refuse it.`) : '',
      h('ul', { class: 'lines' },
        line('You fund', usd(r.principal)),
        line('Collateral locked', `${zecAmt.toLocaleString('en-US', { maximumFractionDigits: 8 })} ZEC`),
        line('Loan to value now', `${(Number(ltv) / 100).toFixed(2)}%`),
        line('Liquidation price', `${usd(liq)} per ZEC`),
        line('You earn if repaid', usd(interest)),
        line('Funding window', `${t.fundWindow / 60} minutes`)),
      h('p', { class: 'small' }, `Price used: ${usd(price.micro)}. ${price.label}.`));
  };
  input.addEventListener('input', show);
  show();
  return h('div', { class: 'panel', style: 'margin-bottom:16px' },
    h('label', { class: 'field', for: 'code' }, h('span', {}, 'Borrower’s request code'), h('div', { class: 'input' }, input)), out);
}
function lendScreen(code = '') {
  const req = requestPanel(code);
  const el = h('section', { class: 'screen' }, h('h1', {}, 'Lend'),
    h('p', { class: 'lead' }, 'You fund a borrower in dollars and hold one of three keys to their ZEC vault.'),
    req,
    h('div', { class: 'cols' },
      h('form', { class: 'panel', onsubmit: (e) => e.preventDefault() },
        h('h3', {}, 'What happens next'),
        h('ol', {}, h('li', {}, 'A borrower sends you a request code or link from the Borrow screen.'), h('li', {}, 'You check it and pay the dollars on the other chain.'), h('li', {}, 'You hold your key until the loan closes.')),
        h('p', { class: 'small' }, 'Regtest build: there is no inbox, so requests are passed by hand.')),
      h('div', { class: 'panel' }, h('h3', {}, 'What you can sign'),
        h('ul', {}, h('li', {}, 'Alone: nothing. A release needs two keys.'),
          h('li', {}, 'With the borrower: a repayment release.'),
          h('li', {}, 'With the keeper: a default release, after a signed price past the liquidation line or the end of the term plus grace.'),
          h('li', {}, 'You cannot stop the borrower and keeper signing an abort before you pay.')))));
  return el;
}

// ---- Limits
function limitsScreen() {
  const items = [
    'The keeper and lender together can take the collateral. Any 2 of 3 keys can spend.',
    'The stablecoin leg crosses chains through NEAR 1Click and is visible on the other chain.',
    'The price is the keeper’s reading of at least 2 public sources, signed by the keeper. Nothing on-chain verifies it.',
    'Who may sign a release is rules in this software, not rules enforced by Zcash.',
    'The signing libraries are unaudited and the demo client is marked not for production.',
    'This depends on an unmerged Orchard fork (zcash/orchard#475).',
    'The dollar amount you borrow is public on the other chain. With the price, it bounds how much ZEC you locked, so borrow a round amount below the maximum.',
    'On regtest one shared vault wallet serves every loan, so the three key holders can see other loans’ deposits and timing.',
    'The keeper learns loan ids and when each step happens.',
    'Built in the Zecathon window: the regtest runs are dated 20 and 22 Oct 2026.',
    'Regtest only. No public testnet run yet.',
  ];
  return h('section', { class: 'screen' }, h('h1', {}, 'Limits'),
    h('p', { class: 'lead' }, 'What this does not hide or stop.'),
    h('div', { class: 'cols' },
      h('div', { class: 'panel' }, h('ul', {}, items.map((t) => h('li', {}, t)))),
      h('div', { class: 'stack' },
        h('div', { class: 'panel' }, h('h3', {}, 'Back-test'),
          h('p', {}, '336 thirty-day loans, 11% liquidated, 0 bad debt at the 40% opening and 70% liquidation limits.')))));
}

// ---- router
function route() {
  const [, name = 'borrow', arg] = location.hash.replace(/^#/, '').split('/');
  priceListeners.clear(); gateListeners.clear();
  let view;
  if (name === 'loans') view = loansScreen();
  else if (name === 'loan') view = loanScreen(decodeURIComponent(arg ?? ''));
  else if (name === 'lend') view = lendScreen(decodeURIComponent(arg ?? ''));
  else if (name === 'limits') view = limitsScreen();
  else view = borrowScreen();
  app.replaceChildren(view);
  const cur = name === 'loan' ? 'loans' : ['loans', 'lend', 'limits'].includes(name) ? name : 'borrow';
  document.querySelectorAll('.nav nav a').forEach((a) => {
    if (a.dataset.route === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${NAME}`;
}

$('#brand').textContent = NAME;
window.addEventListener('hashchange', route);
route();
