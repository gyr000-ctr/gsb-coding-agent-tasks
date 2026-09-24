import { RegexError } from '../lib/errors.js';

export const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof RegexError ? err.code : `NOT_REGEX:${err.message}`;
  }
};

// 跟 JS 自带的 RegExp 对齐形状：{ index, match, groups }，没匹配上就是 null
export const jsExec = (pattern, input) => {
  const found = new RegExp(pattern).exec(input);
  if (found === null) return null;
  return { index: found.index, match: found[0], groups: found.slice(1) };
};

export const shape = (result) => (result === null ? null : {
  index: result.index,
  match: result.match,
  groups: result.groups,
});