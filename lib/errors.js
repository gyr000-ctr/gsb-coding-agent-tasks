// 时间轮对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_ARGUMENT',
  'ERR_DEADLINE_PAST',
  'ERR_DEADLINE_TOO_FAR',
];

export class WheelError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WheelError';
    this.code = code;
    this.details = details;
  }
}
