// Keeper: reads ZEC/USD from several public sources, refuses to sign unless enough agree, signs one reading per call.
// The keeper's reading is a claim by the keeper. Nothing on-chain verifies it.
import { signReading } from './signed-price.mjs';

const toMicro = (s) => {
  const m = /^(\d+)(?:\.(\d{1,12}))?$/.exec(String(s).trim());
  if (!m) throw new Error(`bad price ${s}`);
  const frac = (m[2] ?? '').padEnd(6, '0');
  return BigInt(m[1]) * 1_000_000n + BigInt(frac.slice(0, 6));
};

const getJson = async (url, fetchFn, ms = 8000) => {
  const r = await fetchFn(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
};

export const SOURCES = {
  coingecko: async (f) => toMicro((await getJson('https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&precision=6', f)).zcash.usd),
  coinbase: async (f) => toMicro((await getJson('https://api.coinbase.com/v2/prices/ZEC-USD/spot', f)).data.amount),
  kraken: async (f) => {
    const j = await getJson('https://api.kraken.com/0/public/Ticker?pair=ZECUSD', f);
    if (j.error?.length) throw new Error(j.error.join());
    return toMicro(Object.values(j.result)[0].c[0]);
  },
  gemini: async (f) => toMicro((await getJson('https://api.gemini.com/v1/pubticker/zecusd', f)).last),
  bitfinex: async (f) => toMicro((await getJson('https://api.bitfinex.com/v1/pubticker/zecusd', f)).last_price),
};

const median = (xs) => { const s = [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2n; };

/** Ask every source, drop failures, need `minSources` answers, and at least `minSources` within `maxDevBps` of the median (outliers are dropped). Even counts average the middle two. */
export async function readPrice({ sources = SOURCES, fetchFn = fetch, minSources = 2, maxDevBps = 300n } = {}) {
  const settled = await Promise.allSettled(Object.entries(sources).map(async ([name, fn]) => [name, await fn(fetchFn)]));
  const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value).filter(([, p]) => p > 0n);
  if (ok.length < minSources) throw new Error(`only ${ok.length} price source(s) answered, need ${minSources}`);
  const spreadOk = (ps) => { const lo = ps.reduce((a, b) => (b < a ? b : a)), hi = ps.reduce((a, b) => (b > a ? b : a)); return (hi - lo) * 10_000n <= maxDevBps * lo; };
  // every answering source must sit within maxDevBps of each other; with 3 or more answering, a lone off-market
  // source (thin book, bad feed) is dropped so it cannot stop the keeper, but the rest must still agree with each other
  let agree = ok;
  if (!spreadOk(ok.map(([, p]) => p))) {
    const first = median(ok.map(([, p]) => p));
    const near = (p) => (p > first ? p - first : first - p) * 10_000n <= maxDevBps * first;
    agree = ok.length >= 3 ? ok.filter(([, p]) => near(p)) : [];
    if (agree.length < Math.max(minSources, 2) || !spreadOk(agree.map(([, p]) => p))) throw new Error(`sources disagree by more than ${maxDevBps} bps, refusing to sign`);
  }
  const med = median(agree.map(([, p]) => p));
  return { priceMicroUsd: med, source: agree.map(([n]) => n).sort().join('+') };
}

/** `now` is the keeper host's clock, in seconds. Returns a signed reading for one loan. */
export async function signedReading({ loanId, privateKeyPem, now, ...opts }) {
  const { priceMicroUsd, source } = await readPrice(opts);
  return signReading({ loanId, priceMicroUsd, ts: now, source }, privateKeyPem);
}
