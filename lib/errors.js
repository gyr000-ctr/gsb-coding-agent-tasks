// 分片环对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_NODE',
  'ERR_BAD_WEIGHT',
  'ERR_BAD_COUNT',
  'ERR_NO_NODES',
];

export class RingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RingError';
    this.code = code;
    this.details = details;
  }
}
