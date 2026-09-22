// 队列对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_OPTION',
  'ERR_BAD_PAYLOAD',
];

export class QueueError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'QueueError';
    this.code = code;
    this.details = details;
  }
}
