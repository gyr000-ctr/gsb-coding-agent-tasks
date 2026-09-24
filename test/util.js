import { DnsCodecError } from '../lib/errors.js';

export const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof DnsCodecError ? err.code : `NOT_DNS:${err.message}`;
  }
};

export const details = (fn) => {
  try {
    fn();
  } catch (err) {
    return err.details;
  }
  return null;
};

export const bytes = (text) => {
  const clean = text.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let at = 0; at < out.length; at += 1) out[at] = parseInt(clean.slice(at * 2, at * 2 + 2), 16);
  return out;
};

export const hex = (value) => [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const mulberry32 = (seed) => () => {
  let state = (seed += 0x6d2b79f5);
  state = Math.imul(state ^ (state >>> 15), state | 1);
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
  return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
};

// 把 raw 字节换成数组，方便跟「原样的消息对象」对比
export const normalize = (message) => JSON.parse(JSON.stringify(message, (key, value) =>
  (value instanceof Uint8Array ? [...value] : value)));

export const find = (haystack, needle) => {
  let count = 0;
  for (let at = 0; at <= haystack.length - needle.length; at += 1) {
    let hit = true;
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[at + index] !== needle[index]) {
        hit = false;
        break;
      }
    }
    if (hit) count += 1;
  }
  return count;
};
