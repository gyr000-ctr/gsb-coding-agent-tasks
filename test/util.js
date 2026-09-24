import { TplError } from '../lib/errors.js';

export const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof TplError ? err.code : `NOT_TPL:${err.message}`;
  }
};