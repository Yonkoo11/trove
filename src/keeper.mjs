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
};

const median = (xs) => { const s = [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); return s[Math.floor(s.length / 2)]; };

/** Ask every source, drop failures, need `minSources` answers, and every answer within `maxDevBps` of the median. */
export async function readPrice({ sources = SOURCES, fetchFn = fetch, minSources = 2, maxDevBps = 300n } = {}) {
  const settled = await Promise.allSettled(Object.entries(sources).map(async ([name, fn]) => [name, await fn(fetchFn)]));
  const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value).filter(([, p]) => p > 0n);
  if (ok.length < minSources) throw new Error(`only ${ok.length} price source(s) answered, need ${minSources}`);
  const med = median(ok.map(([, p]) => p));
  for (const [name, p] of ok) {
    const dev = (p > med ? p - med : med - p) * 10_000n / med;
    if (dev > maxDevBps) throw new Error(`source ${name} is ${dev} bps from the median, refusing to sign`);
  }
  return { priceMicroUsd: med, source: ok.map(([n]) => n).sort().join('+') };
}

/** `now` is the keeper host's clock, in seconds. Returns a signed reading for one loan. */
export async function signedReading({ loanId, privateKeyPem, now, ...opts }) {
  const { priceMicroUsd, source } = await readPrice(opts);
  return signReading({ loanId, priceMicroUsd, ts: now, source }, privateKeyPem);
}
