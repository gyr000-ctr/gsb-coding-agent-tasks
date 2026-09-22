// 会话仓库对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_SESSION',
  'ERR_SESSION_EXPIRED',
  'ERR_REFRESH_REUSED',
];

export class SessionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SessionError';
    this.code = code;
    this.details = details;
  }
}
