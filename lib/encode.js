// 编码与摘要的底层零件，signer 里要用但和签名流程本身无关。
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// RFC3986：除了 A-Za-z0-9-._~ 之外的字节一律 %XX（大写十六进制）。
// 注意它不放过 `/`、`:`、`=` 这些，需要保留的字符由调用方自己按段拼回去。
export function encodeRfc3986(value) {
  const bytes = Buffer.from(String(value), 'utf8');
  let out = '';
  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    const unreserved =
      (byte >= 0x41 && byte <= 0x5a) || // A-Z
      (byte >= 0x61 && byte <= 0x7a) || // a-z
      (byte >= 0x30 && byte <= 0x39) || // 0-9
      char === '-' || char === '.' || char === '_' || char === '~';
    out += unreserved ? char : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

export function hex(buffer) {
  return Buffer.from(buffer).toString('hex');
}

export function sha256Hex(data) {
  return createHash('sha256').update(toBuffer(data)).digest('hex');
}

export function hmacSha256(key, data) {
  return createHmac('sha256', key).update(toBuffer(data)).digest();
}

// 十六进制签名不能直接 ===，要按字节比。
export function safeEqualHex(left, right) {
  const a = Buffer.from(String(left), 'utf8');
  const b = Buffer.from(String(right), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  throw new TypeError('只接受字符串或字节');
}
