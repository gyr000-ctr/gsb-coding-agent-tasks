// 分页器对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_ROW',
  'ERR_BAD_LIMIT',
  'ERR_BAD_CURSOR',
  'ERR_EXPIRED',
];

export class PageError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PageError';
    this.code = code;
    this.details = details;
  }
}
