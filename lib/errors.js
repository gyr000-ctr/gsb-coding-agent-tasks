// 签名器对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_LINK',
  'ERR_EXPIRED',
  'ERR_SIGNATURE',
];

export class LinkError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LinkError';
    this.code = code;
    this.details = details;
  }
}
