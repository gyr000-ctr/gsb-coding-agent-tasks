import { PackError } from '../lib/errors.js';

export const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof PackError ? err.code : `NOT_PACK:${err.message}`;
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

export const items = (...pairs) => pairs.map(([id, weight]) => ({ id, weight }));

export const shape = (result) => ({
  bins: result.bins.map((bin) => [bin.index, bin.used, bin.items]),
  unplaced: result.unplaced,
});

export const mulberry32 = (seed) => () => {
  let state = (seed += 0x6d2b79f5);
  state = Math.imul(state ^ (state >>> 15), state | 1);
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
  return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
};
