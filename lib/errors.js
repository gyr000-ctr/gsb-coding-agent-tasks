// 审计日志对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_EVENT',
  'ERR_BAD_QUERY',
];

export class AuditError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AuditError';
    this.code = code;
    this.details = details;
  }
}
