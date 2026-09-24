// 模板这边对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_ARGUMENT',
  'ERR_BAD_TEMPLATE',
];

export class TplError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TplError';
    this.code = code;
    this.details = details;
  }
}