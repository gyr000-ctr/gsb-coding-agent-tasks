import { ListDiffError } from '../lib/errors.js';

export const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof ListDiffError ? err.code : `NOT_LISTDIFF:${err.message}`;
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

export const itemsOf = (keys, note = 0) => keys.map((id) => ({ id, note }));

export const keysOf = (list, key = 'id') => list.map((item) => item[key]);

export const shuffle = (list, random) => {
  const out = [...list];
  for (let at = out.length - 1; at > 0; at -= 1) {
    const swap = Math.floor(random() * (at + 1));
    [out[at], out[swap]] = [out[swap], out[at]];
  }
  return out;
};

// 朴素的 O(n^2) 最长递增子序列长度，用来核对「挪几条」
export const lisLength = (values) => {
  const best = new Array(values.length).fill(1);
  let answer = 0;
  for (let at = 0; at < values.length; at += 1) {
    for (let before = 0; before < at; before += 1) {
      if (values[before] < values[at]) best[at] = Math.max(best[at], best[before] + 1);
    }
    answer = Math.max(answer, best[at]);
  }
  return answer;
};
