// DNS 报文编解码对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_ARGUMENT',
  'ERR_TRUNCATED',
  'ERR_BAD_NAME',
  'ERR_BAD_RECORD',
];

export class DnsCodecError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DnsCodecError';
    this.code = code;
    this.details = details;
  }
}
