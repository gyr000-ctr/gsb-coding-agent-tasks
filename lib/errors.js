// 执行器对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_KEY',
  'ERR_FINGERPRINT_MISMATCH',
];

export class IdempotencyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'IdempotencyError';
    this.code = code;
    this.details = details;
  }
}
