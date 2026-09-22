// 签名器对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_REQUEST',
  'ERR_BAD_AUTHZ',
  'ERR_BAD_EXPIRES',
  'ERR_CLOCK_SKEW',
  'ERR_SIGNATURE_MISMATCH',
  'ERR_EXPIRED',
  'ERR_BAD_PAYLOAD_HASH',
];

export class SignError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SignError';
    this.code = code;
    this.details = details;
  }
}
