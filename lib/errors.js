// 求值器对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_RULES',
  'ERR_BAD_USER',
];

export class RolloutError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RolloutError';
    this.code = code;
    this.details = details;
  }
}
