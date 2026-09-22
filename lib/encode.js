// 百分号编码和 HMAC 这些零件，先写好。
import { createHmac, timingSafeEqual } from 'node:crypto';

// RFC3986：除了 A-Za-z0-9-._~ 之外的字节一律 %XX（大写十六进制）。
export function encodeRfc3986(value) {
  const bytes = Buffer.from(String(value), 'utf8');
  let out = '';
  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    const unreserved =
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      (byte >= 0x30 && byte <= 0x39) ||
      char === '-' ||
      char === '.' ||
      char === '_' ||
      char === '~';
    out += unreserved ? char : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

export function hmacHex(secret, text) {
  return createHmac('sha256', String(secret)).update(String(text), 'utf8').digest('hex');
}

// 十六进制签名按字节比，不要用 === 短路。
export function safeEqualHex(left, right) {
  const a = Buffer.from(String(left), 'utf8');
  const b = Buffer.from(String(right), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
