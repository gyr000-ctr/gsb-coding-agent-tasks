// 正则这边对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_ARGUMENT',
  'ERR_BAD_PATTERN',
  'ERR_STEPS_EXCEEDED',
];

export class RegexError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RegexError';
    this.code = code;
    this.details = details;
  }
}