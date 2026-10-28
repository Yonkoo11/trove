import { interestDue } from './money.mjs';
import { DEFAULT_LIMITS } from './defaults.mjs';

export const TERM_S = 2_592_000n;
export const REGTEST = { graceSeconds: 86400, fundWindow: 3600, payWindow: 3600, maxPriceAge: 600 };

/** One rule for the interest figure on every screen: whole cents, rounded up. */
export const interestMicro = (principalMicro) =>
  (interestDue(principalMicro, BigInt(DEFAULT_LIMITS.aprBps), TERM_S) / 10_000n + 1n) * 10_000n;

/** Terms in the shape openLoan takes. The borrower adds the keeper's public key before opening. */
export const buildTerms = (zat, principalMicro) => ({
  collateralZat: zat.toString(), principal: principalMicro.toString(), aprBps: DEFAULT_LIMITS.aprBps,
  maxStartLtvBps: DEFAULT_LIMITS.maxStartLtvBps, liqLtvBps: DEFAULT_LIMITS.liqLtvBps, penaltyBps: DEFAULT_LIMITS.penaltyBps,
  termSeconds: Number(TERM_S), ...REGTEST,
});

/**
 * The loan reference: 16 random hex characters made when the request is created. It goes in the
 * shielded lock memo and in the public dollar-payment memo, so the key holders can match the two.
 * It carries no prefix, counter or amount, so a stranger reading the public memo learns nothing
 * from it. A request made before 28 Oct 2026 has no reference.
 */
const REF = /^[0-9a-f]{16}$/;
export const newRef = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

/** A Solana wallet address, where the borrower wants the dollars. Base58, 32 to 44 characters. */
const PAY_TO = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** A loan request is two numbers plus the reference, with the borrower's dollar address when given.
 *  Everything else is rebuilt from the shared limits, so a request cannot carry its own rates. */
export function encodeRequest(zat, principalMicro, ref = '', payTo = '') {
  let code = `trove1.${zat}.${principalMicro / 10_000n}`;
  if (ref) code += `.${ref}`;
  if (payTo) code += `.${payTo}`;
  return code;
}

/** The code the lock memo carries: amounts and reference, never the dollar address. */
export const memoCode = (r) => encodeRequest(r.zat, r.principal, r.ref);

export function decodeRequest(code) {
  const m = /^trove1\.([1-9]\d{0,17})\.([1-9]\d{0,14})(?:\.([0-9a-f]{16})(?:\.([1-9A-HJ-NP-Za-km-z]{32,44}))?)?$/.exec(String(code).trim());
  if (!m) return null;
  const zat = BigInt(m[1]), principal = BigInt(m[2]) * 10_000n;
  return { zat, principal, ref: m[3] ?? '', payTo: m[4] ?? '', terms: buildTerms(zat, principal) };
}

export const isRef = (s) => REF.test(String(s));
export const isPayTo = (s) => PAY_TO.test(String(s));
