// 游标要用的编码和摘要工具，跟分页逻辑无关，先写好。
import { createHmac, timingSafeEqual } from 'node:crypto';

// 键排序固定的 JSON：同样的内容一定编出同样的字符串，验签才不会时灵时不灵。
export function canonicalJson(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((one) => canonicalJson(one)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function encodeBase64Url(text) {
  return Buffer.from(String(text), 'utf8').toString('base64url');
}

export function decodeBase64Url(text) {
  return Buffer.from(String(text), 'base64url').toString('utf8');
}

export function signHmac(secret, text) {
  return createHmac('sha256', String(secret)).update(String(text), 'utf8').digest('hex');
}

export function safeEqualHex(left, right) {
  const a = Buffer.from(String(left), 'utf8');
  const b = Buffer.from(String(right), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
