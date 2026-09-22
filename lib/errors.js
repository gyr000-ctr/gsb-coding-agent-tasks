// 缓存对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_KEY',
];

export class CacheError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CacheError';
    this.code = code;
    this.details = details;
  }
}
