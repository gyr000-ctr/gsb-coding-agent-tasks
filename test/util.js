import { GridError } from '../lib/errors.js';

export const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof GridError ? err.code : `NOT_GRID:${err.message}`;
  }
};

export const values = (sheet, addresses) =>
  addresses.map((address) => sheet.value(address));
