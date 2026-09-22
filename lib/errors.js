// 锁服务对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_ARGS',
  'ERR_BAD_TTL',
  'ERR_LOCKED',
  'ERR_UNKNOWN_LOCK',
  'ERR_BAD_TOKEN',
  'ERR_LEASE_LOST',
];

export class LeaseError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LeaseError';
    this.code = code;
    this.details = details;
  }
}
