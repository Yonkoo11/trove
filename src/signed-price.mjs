// A price reading is only worth what its signature is worth. The keeper signs; the loan machine verifies
// against the key written into the loan terms, so a reading typed in by anyone else cannot move a loan.
import { createPrivateKey, createPublicKey, sign, verify, generateKeyPairSync } from 'node:crypto';

export function newKeeperKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyHex: publicKey.export({ type: 'spki', format: 'der' }).toString('hex'),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

/** Fixed field order so signer and verifier hash identical bytes. */
export function readingBytes(r) {
  return Buffer.from(JSON.stringify([r.loanId, String(r.priceMicroUsd), r.ts, r.source]));
}

export function signReading({ loanId, priceMicroUsd, ts, source }, privateKeyPem) {
  if (!Number.isInteger(ts)) throw new Error('ts must be whole seconds');
  const r = { loanId, priceMicroUsd: BigInt(priceMicroUsd), ts, source };
  const sig = sign(null, readingBytes(r), createPrivateKey(privateKeyPem)).toString('hex');
  return { ...r, sig };
}

export function verifyReading(r, publicKeyHex) {
  try {
    const pub = createPublicKey({ key: Buffer.from(publicKeyHex, 'hex'), format: 'der', type: 'spki' });
    return verify(null, readingBytes(r), pub, Buffer.from(r.sig, 'hex'));
  } catch {
    return false;
  }
}
