import { createHash } from 'node:crypto';

import { HllError } from '../lib/errors.js';

export const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof HllError ? err.code : `NOT_HLL:${err.message}`;
  }
};

// 用例这边照 README 的哈希口径另写一份，用来核对寄存器落位。
export function expectedSlot(value, precision) {
  const digest = createHash('sha256').update(value, 'utf8').digest();
  let bits = 0n;
  for (let i = 0; i < 8; i += 1) bits = (bits << 8n) | BigInt(digest[i]);
  const bucket = Number(bits >> BigInt(64 - precision));
  const width = 64 - precision;
  const rest = bits & ((1n << BigInt(width)) - 1n);
  let rank = 1;
  while (rank <= width && ((rest >> BigInt(width - rank)) & 1n) === 0n) rank += 1;
  return { bucket, rank };
}

export const nonzeroCount = (registers) => registers.reduce((total, value) => total + (value > 0 ? 1 : 0), 0);

export const values = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix}${index}`);