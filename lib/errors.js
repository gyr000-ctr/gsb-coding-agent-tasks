// 计划器对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_STATE',
  'ERR_BAD_FILE',
  'ERR_OVERLAP',
];

export class PlanError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PlanError';
    this.code = code;
    this.details = details;
  }
}
