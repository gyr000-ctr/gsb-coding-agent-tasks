import { generateKeyPairSync } from 'node:crypto';
import { signToken } from '../lib/jose.js';

export const NOW = Date.parse('2026-01-01T00:00:00Z');
export const NOW_SECONDS = NOW / 1000;

export function makeRsa(kid, alg = 'RS256') {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, alg, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg }, privateKey };
}

export function makeEc(kid) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { kid, alg: 'ES256', jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256' }, privateKey };
}

export function token(key, payload, headerExtra = {}) {
  return signToken({
    header: { alg: key.alg, kid: key.kid, typ: 'JWT', ...headerExtra },
    payload,
    privateKey: key.privateKey,
  });
}

export function claims(extra = {}) {
  return { iss: 'https://auth.example.com', aud: 'api', sub: 'user-1', iat: NOW_SECONDS, exp: NOW_SECONDS + 3600, ...extra };
}

export function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    if (err.name !== 'JwtError' || err.code !== code) throw err;
    return err;
  }
  throw new Error(`期望抛 ${code}，结果没抛`);
}
