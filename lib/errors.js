// 列表对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_ARGUMENT',
  'ERR_DUPLICATE_KEY',
  'ERR_BAD_OPERATION',
];

export class ListDiffError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ListDiffError';
    this.code = code;
    this.details = details;
  }
}
