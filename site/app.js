import { collateralValue, interestDue, ltvBps, ZAT_PER_ZEC } from './lib/money.mjs';
import { DEFAULT_LIMITS } from './lib/defaults.mjs';
import { TERM_S, REGTEST, interestMicro, buildTerms, encodeRequest, decodeRequest } from './lib/terms.mjs';

const NAME = 'Trove';
const STORED = { micro: 1_240_743_930n, label: 'last stored close, 22 Oct 2026' };

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
    if (!r.ok) return false;
    const usdPrice = (await r.json())?.zcash?.usd;
    const m = parseUnits(String(usdPrice), 6);
    if (m === null || m * 10n < STORED.micro || m > STORED.micro * 10n) return false;
    price = { micro: m, label: 'live from CoinGecko', live: true };
    priceListeners.forEach((f) => f());
    return true;
  } catch { return false; /* stay on the stored close */ }
}
const refreshIcon = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', '16'); s.setAttribute('height', '16'); s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.5'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  s.append(p); return s;
};

const copyIcon = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', '16'); s.setAttribute('height', '16'); s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M5.5 5.5V3.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M3.5 5.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.5'); p.setAttribute('stroke-linejoin', 'round');
  s.append(p); return s;
};

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
    box.replaceChildren(h('span', { class: 'kicker' }, 'Public view'), h('h2', {}, 'What the chain shows'),
      h('p', { class: 'sub' }, 'What a stranger sees when the vault pays out.'));
    if (gate1.status === 'loading') { box.append(h('p', {}, 'Loading the recorded fields…')); return; }
    if (gate1.status === 'error') { box.append(h('p', { class: 'error' }, 'Could not load gate1-viewer-fields.json.')); return; }
    const d = gate1.data;
    const rows = [
      ['Network fee', `${(Number(d.valueBalanceZat) / 1e8).toFixed(4)} ZEC`],
      ['Public inputs', String(d.transparent_in_out?.[0] ?? 0)],
      ['Public outputs', String(d.transparent_in_out?.[1] ?? 0)],
      ['Shielded actions', String(d.ironwood_actions)],
    ];
    const dl = h('dl');
    for (const [k, v] of rows) dl.append(h('div', { class: 'row' }, h('dt', {}, k), h('dd', {}, v)));
    box.append(dl, h('div', { class: 'sealed' }, h('b', {}, 'Hidden from everyone else'), h('ul', { class: 'hidden-list' }, ['Sender', 'Receiver', 'Amount'].map((x) => h('li', {}, x)))),
      h('details', {}, h('summary', {}, 'Raw fields a viewer can read on each action'),
        h('ul', { class: 'fields' }, (d.public_fields_per_action ?? []).map((f) => h('li', {}, f)))),
      h('p', { class: 'note' }, `Checked on one vault release (lender and keeper signed): ${String(d.txid).slice(0, 8)}…${String(d.txid).slice(-4)}, height ${d.height}. Not the deposit. The dollar side of the loan runs on another chain and is public.`));
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
  const bor = h('input', { id: 'bor', inputmode: 'decimal', autocomplete: 'off', value: '200' });
  const err = h('p', { class: 'error', role: 'alert' });
  const big = h('span', { class: 'big' });
  const maxHint = h('p', { class: 'hint', id: 'zec-hint' });
  const priceNote = h('p', { class: 'small' });
  const liveLabel = h('span', {}, 'Check live price');
  const live = h('button', { class: 'link-btn', type: 'button', onclick: async () => {
    live.disabled = true; liveLabel.textContent = 'Checking…';
    const ok = await loadPrice();
    live.disabled = false; liveLabel.textContent = 'Check live price';
    if (!ok) priceNote.textContent = `ZEC at ${usd(price.micro)}. Live price unavailable, using ${price.label}.`;
  } }, refreshIcon(), liveLabel);
  const lines = h('ul', { class: 'lines' });
  const terms = h('div', { class: 'terms', hidden: '' });
  const btn = h('button', { class: 'btn', type: 'button' }, 'Create request link');
  let q = null;

  const line = (k, v) => h('li', {}, h('span', {}, k), h('span', {}, v));
  const update = () => {
    q = quote(zec.value, bor.value);
    priceNote.replaceChildren(document.createTextNode('ZEC at '), h('b', {}, usd(price.micro)), document.createTextNode(`, ${price.label}`));
    terms.hidden = true;
    if (q.error !== undefined) {
      err.textContent = q.error; btn.disabled = true;
      big.textContent = '$0.00'; lines.replaceChildren(); maxHint.textContent = '';
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
      line('Term', '30 days, fixed'),
      line(`Interest at ${apr}% APR`, usd(q.interest)),
      Object.assign(line('Total to repay', usd(q.total)), { className: 'total' }));
  };

  btn.addEventListener('click', () => {
    if (!q || q.error !== undefined) return;
    const code = encodeRequest(q.zat, q.principal);
    const link = `${location.origin}${location.pathname}#/lend/${code}`;
    const field = h('input', { class: 'share-url', readonly: '', value: link, 'aria-label': 'Request link' });
    const copied = h('span', { class: 'sr', 'aria-live': 'polite' });
    const copy = h('button', { class: 'share-btn', type: 'button' }, copyIcon(), h('span', {}, 'Copy link'));
    copy.addEventListener('click', async () => {
      // a clipboard call can hang (pending permission prompt); give up after 1.5s and fall back to select
      const stall = new Promise((_, no) => setTimeout(() => no(new Error('clipboard stalled')), 1500));
      try { await Promise.race([navigator.clipboard.writeText(link), stall]); copy.lastChild.textContent = 'Copied'; copied.textContent = 'Link copied'; }
      catch { field.select(); copy.lastChild.textContent = /Mac|iP/.test(navigator.platform) ? 'Press ⌘C' : 'Press Ctrl+C'; }
      clearTimeout(copy.t); copy.t = setTimeout(() => { copy.lastChild.textContent = 'Copy link'; copied.textContent = ''; }, 2000);
    });
    field.addEventListener('focus', () => field.select());
    terms.replaceChildren(h('p', { class: 'share-title' }, 'Send this link to a lender'),
      h('div', { class: 'share' }, field, copy), copied,
      h('p', { class: 'small' }, 'They open it to see your terms. It shows only the collateral and the dollar amount.'));
    terms.hidden = false;
  });
  zec.addEventListener('input', update);
  bor.addEventListener('input', update);
  // the link holds only ZEC and dollars, so a new price keeps it unless the quote stops being valid
  priceListeners.add(() => { const shown = !terms.hidden; update(); if (shown && q.error === undefined) terms.hidden = false; });

  const ticket = h('form', { class: 'panel ticket', onsubmit: (e) => e.preventDefault() },
    h('label', { class: 'field', for: 'zec' }, h('span', {}, 'Collateral'), h('div', { class: 'input' }, zec, h('span', { class: 'unit' }, 'ZEC')), maxHint),
    h('label', { class: 'field', for: 'bor' }, h('span', {}, 'Borrow'), h('div', { class: 'input' }, bor, h('span', { class: 'unit' }, 'USD'))),
    err,
    h('div', { class: 'result' }, h('span', { class: 'label' }, 'You receive'), big),
    btn, terms, lines, h('div', { class: 'pricebar' }, priceNote, live));
  update();

  return h('section', { class: 'screen' },
    h('h1', {}, 'Borrow dollars against your ZEC, with the collateral held in a shielded vault.'),
    h('p', { class: 'lead' }, 'A fixed 30-day loan. The dollars arrive on another chain, where they are visible.'),
    h('div', { class: 'grid' }, ticket,
      h('aside', { class: 'panel terms-panel', 'aria-label': 'Loan terms' }, h('h2', {}, 'Loan terms'),
        h('dl', {}, [['Opens at up to', `${DEFAULT_LIMITS.maxStartLtvBps / 100}% of collateral value`], ['Liquidated at', `${DEFAULT_LIMITS.liqLtvBps / 100}% loan to value`], ['Interest', `${DEFAULT_LIMITS.aprBps / 100}% APR, fixed`], ['Liquidation penalty', `${DEFAULT_LIMITS.penaltyBps / 100}%`], ['Collateral', 'Shielded ZEC, 2 of 3 keys']].map(([k, v]) => h('div', { class: 'row' }, h('dt', {}, k), h('dd', {}, v)))))));
}

// ---- Loans
const zecStr = (z) => (Number(z) / 1e8).toFixed(4).replace(/\.?0+$/, '');
const zatLine = (paid) => paid.map(([who, z]) => `${who} +${zecStr(z)} ZEC`).join(', ');

function loansScreen() {
  const body = h('tbody');
  for (const r of Object.values(RUNS)) {
    body.append(h('tr', {},
      h('td', { 'data-label': 'Run' }, h('a', { href: `#/loan/${r.id}` }, `${r.id}: ${r.name}`)),
      h('td', { 'data-label': 'State' }, h('span', { class: `tag${r.good ? ' good' : ''}` }, r.tag)),
      h('td', { 'data-label': 'Signers' }, r.signers),
      h('td', { 'data-label': 'Paid out' }, zatLine(r.paid))));
  }
  return h('section', { class: 'screen' }, h('h1', {}, 'Loans'),
    h('p', { class: 'lead' }, 'Recorded test runs.'),
    h('div', { class: 'panel' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Run', 'State', 'Signers', 'Paid out'].map((c) => h('th', {}, c)))), body)),);
}

function loanScreen(id) {
  const r = Object.hasOwn(RUNS, id) ? RUNS[id] : null;
  if (!r) return h('section', { class: 'screen' }, h('h1', {}, 'No such loan'), h('a', { class: 'back', href: '#/loans' }, 'Back to loans'));
  return h('section', { class: 'screen' }, h('a', { class: 'back', href: '#/loans' }, 'Back to loans'),
    h('h1', {}, `Run ${r.id}: ${r.name}`),
    h('div', { class: 'cols' },
      h('div', { class: 'panel' }, h('h3', {}, 'State timeline'), h('ol', { class: 'timeline' }, r.path.map((s) => h('li', {}, s.replaceAll('_', ' ')))),
        h('p', { class: 'small', style: 'margin-top:16px' }, `Signers at the end: ${r.signers}. ${r.end}`)),
      h('div', { class: 'panel' }, h('h3', {}, 'Paid out'), h('p', {}, zatLine(r.paid)))));
}

// ---- Lend
function requestPanel(code) {
  const input = h('input', { id: 'code', autocomplete: 'off', spellcheck: 'false', value: code, placeholder: 'https://trovedesk.xyz/#/lend/trove1.…' });
  const out = h('div', {});
  const show = () => {
    const raw = input.value.trim().replace(/^.*#\/lend\//, '');
    if (!raw) { out.replaceChildren(); return; }
    const r = decodeRequest(raw);
    if (!r) { out.replaceChildren(h('p', { class: 'error', role: 'alert' }, 'That is not a Trove request link. Paste the whole link the borrower sent you.')); return; }
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
      h('p', { class: 'small' }, `Price used: ${usd(price.micro)}, ${price.label}.`),
      h('p', { class: 'small' }, 'Funding from this page is not built yet. In the test runs the lock and payouts ran from scripts. ', h('a', { href: 'https://github.com/Yonkoo11/trove#how-a-loan-works' }, 'How a loan works')));
  };
  input.addEventListener('input', show);
  show();
  return h('div', { class: 'panel', style: 'margin-bottom:16px' },
    h('label', { class: 'field', for: 'code' }, h('span', {}, 'Borrower’s request link'), h('div', { class: 'input' }, input)), out);
}
function lendScreen(code = '') {
  const req = requestPanel(code);
  return h('section', { class: 'screen' }, h('h1', {}, 'Lend'),
    h('p', { class: 'lead' }, 'Open the link a borrower sent you, or paste it here to see the terms.'),
    req);
}

// ---- Limits
function limitsScreen() {
  const groups = [
    ['Who can move your collateral', [
      'Any two of the three keys can move it. The keeper and lender together can take it.',
      'The rules on who may sign are enforced by this software, not by Zcash.',
      'The keeper reads the price from at least two public sources and signs it. Nothing on-chain checks it.',
    ]],
    ['What others can see', [
      'The dollar payment crosses chains through NEAR 1Click and is visible on the other chain.',
      'The dollar amount of the loan is public. With the price, it bounds how much ZEC you locked, so borrow a round amount below the maximum.',
      'The keeper learns loan ids and when each step happens.',
      'On the test chain one shared vault wallet serves every loan, so the three key holders can see other loans’ deposits and timing.',
    ]],
    ['What is unproven', [
      'The signing code is unaudited.',
      'The vault key uses an experimental Zcash feature that is not merged and that its own reviewer says will be removed (zcash/orchard#475). Funds in such a vault could become unreachable.',
      'Run on a local test chain on 20 and 22 Oct 2026, and once on public Zcash testnet on 26 Oct 2026: one lock and three payouts, and one signer alone could not move funds. Not run on mainnet.',
    ]],
  ];
  const stat = (n, label) => h('div', { class: 'stat' }, h('strong', {}, n), h('span', {}, label));
  return h('section', { class: 'screen' }, h('h1', {}, 'Limits'),
    h('p', { class: 'lead' }, 'Risks, and what is visible on each side.'),
    h('div', { class: 'panel' }, h('h3', {}, 'Back-test'),
      h('div', { class: 'stats' }, stat('336', 'thirty-day loans'), stat('11%', 'liquidated'), stat('0', 'bad debt')),
      h('p', { class: 'small' }, 'Run over 365 daily closes at the 40% opening and 70% liquidation limits.')),
    h('div', { class: 'cols' }, groups.map(([t, items]) =>
      h('div', { class: 'panel' }, h('h3', {}, t), h('ul', { class: 'facts' }, items.map((x) => h('li', {}, x)))))),
    stubPanel(),
    h('p', { class: 'small' }, 'The price check on the Borrow page asks CoinGecko from your browser. Nothing else leaves the page.'));
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
