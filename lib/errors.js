// 引擎对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_REF',
  'ERR_UNKNOWN_SHEET',
];

export class SheetError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SheetError';
    this.code = code;
    this.details = details;
  }
}
