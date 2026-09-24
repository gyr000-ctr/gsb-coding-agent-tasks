// 表格这边对外的错误：地址 / 入参不对是抛的，格子算出来的错是字符串值（见 README）。
export const CODES = [
  'ERR_BAD_ARGUMENT',
  'ERR_BAD_ADDRESS',
];

export const ERROR_VALUES = [
  '#ERROR!',
  '#NAME?',
  '#REF!',
  '#VALUE!',
  '#DIV/0!',
  '#CYCLE!',
];

export class GridError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'GridError';
    this.code = code;
    this.details = details;
  }
}
