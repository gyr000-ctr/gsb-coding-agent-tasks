// 编解码对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_ARGUMENT',
  'ERR_TOO_MANY_ERASURES',
];

export class RsCodecError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RsCodecError';
    this.code = code;
    this.details = details;
  }
}
