import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifier } from '../lib/verifier.js';
import { encodeSegment } from '../lib/jose.js';
import { NOW, claims, expectError, makeEc, makeRsa, token } from './helpers.js';

const key = makeRsa('k1');
const spare = makeRsa('k2');

const base = (extra = {}) => ({
  issuer: 'https://auth.example.com',
  audience: 'api',
  jwks: [key.jwk],
  clock: () => NOW,
  ...extra,
});

test('正常 token 验完把 claims 原样给出来', () => {
  const verifier = createVerifier(base());
  const out = verifier.verify(token(key, claims()));
  assert.equal(out.claims.sub, 'user-1');
  assert.equal(out.kid, 'k1');
  assert.equal(out.alg, 'RS256');
  assert.equal(out.expiresAt, (NOW / 1000 + 3600) * 1000);
  assert.equal(out.issuedAt, NOW);
  assert.deepEqual(verifier.keys(), ['k1']);
  assert.deepEqual(verifier.algorithms(), ['RS256']);
});

test('token 本身不合法时报 ERR_MALFORMED', () => {
  const verifier = createVerifier(base());
  expectError(() => verifier.verify(undefined), 'ERR_MALFORMED');
  expectError(() => verifier.verify(''), 'ERR_MALFORMED');
  expectError(() => verifier.verify('only-one-part'), 'ERR_MALFORMED');
  expectError(() => verifier.verify('aa.bb'), 'ERR_MALFORMED');
  expectError(() => verifier.verify(`not-json.${encodeSegment({})}.zz`), 'ERR_MALFORMED');
  expectError(() => verifier.verify(`${encodeSegment({ alg: 'RS256', kid: 'k1' })}.not-json.zz`), 'ERR_MALFORMED');
  expectError(() => verifier.verify(`${encodeSegment({ alg: 'RS256', kid: 'k1' })}.${encodeSegment({})}.`), 'ERR_MALFORMED');
});

test('算法要过白名单，none 和对称算法直接拒', () => {
  const verifier = createVerifier(base());
  // none / HS256 这类算法连签都签不出来，直接手搓一个头出来给校验器看。
  const handRolled = (header) =>
    `${encodeSegment(header)}.${encodeSegment(claims())}.${Buffer.from('sig').toString('base64url')}`;
  for (const alg of ['none', 'HS256']) {
    expectError(() => verifier.verify(handRolled({ alg, kid: 'k1' })), 'ERR_UNSUPPORTED_ALG');
  }
  expectError(() => verifier.verify(handRolled({ kid: 'k1' })), 'ERR_UNSUPPORTED_ALG');
  expectError(() => verifier.verify(token(key, claims(), { alg: 'RS512' })), 'ERR_UNSUPPORTED_ALG');
  const onlyEc = createVerifier(base({ algorithms: ['ES256'] }));
  expectError(() => onlyEc.verify(token(key, claims())), 'ERR_UNSUPPORTED_ALG');
});

test('kid 缺失、陌生、和钥匙上写的算法不一致都拒', () => {
  const verifier = createVerifier(base());
  expectError(() => verifier.verify(token(key, claims(), { kid: undefined })), 'ERR_KID_MISSING');
  expectError(() => verifier.verify(token(key, claims(), { kid: 'nope' })), 'ERR_KID_UNKNOWN');
  const otherAlg = makeRsa('k3', 'RS512');
  const mixed = createVerifier(base({ jwks: [otherAlg.jwk], algorithms: ['RS256'] }));
  expectError(() => mixed.verify(token(otherAlg, claims(), { alg: 'RS256' })), 'ERR_UNSUPPORTED_ALG');
});

test('签名不对就报 ERR_SIGNATURE', () => {
  const verifier = createVerifier(base());
  const good = token(key, claims());
  const [header, , signature] = good.split('.');
  const tampered = `${header}.${encodeSegment(claims({ sub: 'hacker' }))}.${signature}`;
  expectError(() => verifier.verify(tampered), 'ERR_SIGNATURE');
  const impostor = token({ ...key, privateKey: spare.privateKey }, claims());
  expectError(() => verifier.verify(impostor), 'ERR_SIGNATURE');
});

test('轮换钥匙之后旧的 kid 就不认了', () => {
  const verifier = createVerifier(base());
  assert.equal(verifier.verify(token(key, claims())).kid, 'k1');
  verifier.rotate([spare.jwk]);
  assert.deepEqual(verifier.keys(), ['k2']);
  expectError(() => verifier.verify(token(key, claims())), 'ERR_KID_UNKNOWN');
  assert.equal(verifier.verify(token(spare, claims())).kid, 'k2');
  assert.throws(() => verifier.rotate([]), { name: 'JwtError', code: 'ERR_BAD_CONFIG' });
});

test('ES256 也能验，但得先在算法白名单里', () => {
  const ec = makeEc('e1');
  const verifier = createVerifier(base({ jwks: [ec.jwk], algorithms: ['RS256', 'ES256'] }));
  assert.equal(verifier.verify(token(ec, claims())).alg, 'ES256');
});

test('配置和 JWKS 不合法时报哪个码', () => {
  expectError(() => createVerifier({ ...base(), issuer: '' }), 'ERR_BAD_CONFIG');
  expectError(() => createVerifier({ ...base(), audience: [] }), 'ERR_BAD_CONFIG');
  expectError(() => createVerifier({ ...base(), algorithms: ['HS256'] }), 'ERR_BAD_CONFIG');
  expectError(() => createVerifier({ ...base(), clock: 123 }), 'ERR_BAD_CONFIG');
  expectError(() => createVerifier({ ...base(), jwks: [] }), 'ERR_BAD_CONFIG');
  expectError(() => createVerifier({ ...base(), jwks: 'nope' }), 'ERR_BAD_CONFIG');
  expectError(() => createVerifier({ ...base(), jwks: [{ ...key.jwk, kid: '' }] }), 'ERR_BAD_JWK');
  expectError(() => createVerifier({ ...base(), jwks: [key.jwk, key.jwk] }), 'ERR_BAD_JWK');
  expectError(() => createVerifier({ ...base(), jwks: [{ kty: 'oct', k: 'AAAA', kid: 'x' }] }), 'ERR_BAD_JWK');
});
