import { RsCodecError } from '../lib/errors.js';

export const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof RsCodecError ? err.code : `NOT_RS:${err.message}`;
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

export const mulberry32 = (seed) => () => {
  let state = (seed += 0x6d2b79f5);
  state = Math.imul(state ^ (state >>> 15), state | 1);
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
  return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
};

export const plain = (shards) => shards.map((shard) => (shard === null ? null : [...shard]));

export const randomShard = (size, random) => {
  const shard = new Uint8Array(size);
  for (let at = 0; at < size; at += 1) shard[at] = Math.floor(random() * 256);
  return shard;
};

// 从 n 个位置里挑出所有大小为 size 的组合
export const combinations = (n, size) => {
  const out = [];
  const walk = (start, picked) => {
    if (picked.length === size) {
      out.push([...picked]);
      return;
    }
    for (let at = start; at < n; at += 1) {
      picked.push(at);
      walk(at + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return out;
};
