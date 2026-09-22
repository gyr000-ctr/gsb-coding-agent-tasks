// 计费模块对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_PRICE',
  'ERR_UNKNOWN_PLAN',
  'ERR_UNKNOWN_SUBSCRIPTION',
  'ERR_DUPLICATE_SUBSCRIPTION',
  'ERR_BAD_PERIOD',
  'ERR_OUT_OF_PERIOD',
  'ERR_OVERLAP',
  'ERR_ALREADY_INVOICED',
  'ERR_NO_PRICE',
  'ERR_UNKNOWN_INVOICE',
  'ERR_NOT_STALE',
];

export class InvoiceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'InvoiceError';
    this.code = code;
    this.details = details;
  }
}
