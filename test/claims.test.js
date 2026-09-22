import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifier } from '../lib/verifier.js';
import { NOW, NOW_SECONDS, claims, expectError, makeRsa, token } from './helpers.js';

const key = makeRsa('k1');
const base = (extra = {}) => ({
  issuer: 'https://auth.example.com',
  audience: 'api',
  jwks: [key.jwk],
  clock: () => NOW,
  ...extra,
});

test('exp 过期按 clockSkewMs 放宽，边界之外才拒', () => {
  const verifier = createVerifier(base());
  const soon = token(key, claims({ exp: NOW_SECONDS + 60 }));
  assert.equal(verifier.verify(soon).claims.exp, NOW_SECONDS + 60);
  expectError(() => createVerifier(base({ clock: () => NOW + 60001 })).verify(soon), 'ERR_EXPIRED');
  const lenient = createVerifier(base({ clockSkewMs: 5000, clock: () => NOW + 65000 }));
  assert.equal(lenient.verify(soon).kid, 'k1');
  expectError(() => createVerifier(base({ clockSkewMs: 5000, clock: () => NOW + 66000 })).verify(soon), 'ERR_EXPIRED');
});

test('nbf 太早、iat 比现在还晚都拒', () => {
  const verifier = createVerifier(base());
  expectError(() => verifier.verify(token(key, claims({ nbf: NOW_SECONDS + 30 }))), 'ERR_NOT_YET_VALID');
  assert.equal(createVerifier(base({ clockSkewMs: 60000 })).verify(token(key, claims({ nbf: NOW_SECONDS + 30 }))).kid, 'k1');
  expectError(() => verifier.verify(token(key, claims({ iat: NOW_SECONDS + 120 }))), 'ERR_BAD_CLAIMS');
  expectError(() => verifier.verify(token(key, claims({ iat: 'now' }))), 'ERR_BAD_CLAIMS');
});

test('maxTokenAgeMs 限制签发时间', () => {
  const old = token(key, claims({ iat: NOW_SECONDS - 7200, exp: NOW_SECONDS + 3600 }));
  expectError(() => createVerifier(base({ maxTokenAgeMs: 3600000 })).verify(old), 'ERR_TOKEN_TOO_OLD');
  assert.equal(createVerifier(base({ maxTokenAgeMs: 7200000 })).verify(old).kid, 'k1');
  assert.equal(createVerifier(base()).verify(old).kid, 'k1');
});

test('iss 必须对上', () => {
  const verifier = createVerifier(base());
  expectError(() => verifier.verify(token(key, claims({ iss: 'https://evil.example.com' }))), 'ERR_BAD_ISSUER');
  expectError(() => verifier.verify(token(key, claims({ iss: undefined }))), 'ERR_BAD_ISSUER');
});

test('aud 支持多个受众，交集为空就拒', () => {
  const verifier = createVerifier(base({ audience: ['api', 'web'] }));
  assert.equal(verifier.verify(token(key, claims({ aud: 'web' }))).kid, 'k1');
  assert.equal(verifier.verify(token(key, claims({ aud: ['mobile', 'api'] }))).kid, 'k1');
  expectError(() => verifier.verify(token(key, claims({ aud: 'mobile' }))), 'ERR_BAD_AUDIENCE');
  expectError(() => verifier.verify(token(key, claims({ aud: undefined }))), 'ERR_BAD_AUDIENCE');
  expectError(() => verifier.verify(token(key, claims({ aud: [1, 2] }))), 'ERR_BAD_AUDIENCE');
  expectError(() => verifier.verify(token(key, claims({ aud: { api: true } }))), 'ERR_BAD_AUDIENCE');
});

test('requiredClaims 缺一个都不行，时间声明得是数字', () => {
  const verifier = createVerifier(base({ requiredClaims: ['exp', 'sub'] }));
  expectError(() => verifier.verify(token(key, claims({ sub: undefined }))), 'ERR_BAD_CLAIMS');
  expectError(() => verifier.verify(token(key, claims({ exp: undefined }))), 'ERR_BAD_CLAIMS');
  expectError(() => verifier.verify(token(key, claims({ exp: 'soon' }))), 'ERR_BAD_CLAIMS');
  const noExp = createVerifier(base({ requiredClaims: [] }));
  const withoutTimes = noExp.verify(token(key, claims({ exp: undefined, iat: undefined })));
  assert.equal(withoutTimes.expiresAt, null);
  assert.equal(withoutTimes.issuedAt, null);
});

test('now 只从 clock 来，两次验结果一样', () => {
  const verifier = createVerifier(base());
  const signed = token(key, claims());
  assert.equal(verifier.now(), NOW);
  assert.deepEqual(verifier.verify(signed).claims, verifier.verify(signed).claims);
});
