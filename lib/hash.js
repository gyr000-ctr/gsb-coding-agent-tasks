// 32 位的 FNV-1a：纯粹按字节算，跟 crypto 无关，换机器换进程都是同一个数。
// 环上的点就是它算出来的 0 ~ 2^32-1 的整数。
export function hash32(text) {
  if (typeof text !== 'string') throw new TypeError('hash32 只接受字符串');
  let value = 0x811c9dc5;
  for (const byte of Buffer.from(text, 'utf8')) {
    value ^= byte;
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

export const RING_SIZE = 2 ** 32;

export function hex8(point) {
  return point.toString(16).padStart(8, '0');
}
