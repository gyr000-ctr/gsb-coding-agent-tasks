// 32 位 FNV-1a：纯按字节算，换机器换进程都是同一个数，分桶才稳定。
export function hash32(text) {
  if (typeof text !== 'string') throw new TypeError('hash32 只接受字符串');
  let value = 0x811c9dc5;
  for (const byte of Buffer.from(text, 'utf8')) {
    value ^= byte;
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

export const BUCKETS = 100;
