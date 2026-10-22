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
