/** ZIP 321 payment links (https://zips.z.cash/zip-0321). */
export const MAX_ZAT = 21_000_000n * 100_000_000n;

/** zat -> "1.5" style ZEC: at most 8 decimals, no trailing dot. null when ZIP 321 forbids the amount. */
export function zecAmount(zat) {
  zat = BigInt(zat);
  if (zat <= 0n || zat > MAX_ZAT) return null;
  const frac = (zat % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return (zat / 100_000_000n).toString() + (frac ? '.' + frac : '');
}

/** UTF-8 text -> unpadded base64url. null over the 512-byte memo limit. */
export function memoParam(text) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 512) return null;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** zcash:<addr>?amount=..&memo=.. for one shielded recipient. null when the amount or memo is not allowed. */
export function paymentUri(addr, zat, memo) {
  const amount = zecAmount(zat);
  if (!amount || !/^[a-z0-9]+$/.test(addr)) return null;
  let uri = `zcash:${addr}?amount=${amount}`;
  if (memo) {
    const m = memoParam(memo);
    if (m === null) return null;
    uri += `&memo=${m}`;
  }
  return uri;
}
