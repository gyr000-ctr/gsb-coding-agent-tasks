// JOSE 那点编解码和验签的活儿，跟校验策略无关，先写好。
import { createPublicKey, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';

const HASHES = {
  RS256: 'sha256',
  RS384: 'sha384',
  RS512: 'sha512',
  ES256: 'sha256',
  ES384: 'sha384',
  ES512: 'sha512',
};

export function supportsAlgorithm(alg) {
  return Object.hasOwn(HASHES, alg);
}

export function decodeSegment(text) {
  if (typeof text !== 'string' || text === '') throw new TypeError('段不能空');
  const buffer = Buffer.from(text, 'base64url');
  if (buffer.length === 0) throw new TypeError('段解出来是空的');
  return buffer;
}

export function parseSegment(text) {
  const value = JSON.parse(decodeSegment(text).toString('utf8'));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('段里得是一个对象');
  }
  return value;
}

export function encodeSegment(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function importPublicKey(jwk) {
  return createPublicKey({ key: jwk, format: 'jwk' });
}

export function signWithKey(alg, privateKey, data) {
  const hash = HASHES[alg];
  if (!hash) throw new TypeError(`不认识的算法 ${alg}`);
  const options = alg.startsWith('ES') ? { key: privateKey, dsaEncoding: 'ieee-p1363' } : privateKey;
  return cryptoSign(hash, Buffer.from(data, 'utf8'), options);
}

export function signToken({ header, payload, privateKey }) {
  const data = `${encodeSegment(header)}.${encodeSegment(payload)}`;
  return `${data}.${signWithKey(header.alg, privateKey, data).toString('base64url')}`;
}

export function verifySignature({ alg, key, data, signature }) {
  const hash = HASHES[alg];
  if (!hash) return false;
  const options = alg.startsWith('ES') ? { key, dsaEncoding: 'ieee-p1363' } : key;
  return cryptoVerify(hash, Buffer.from(data, 'utf8'), options, signature);
}
