// 迁移编排对外只抛这一个错误类型，调用方按 code 分流。
export const CODES = [
  'ERR_BAD_CONFIG',
  'ERR_BAD_ARGS',
  'ERR_BAD_MIGRATION',
  'ERR_DUPLICATE_MIGRATION',
  'ERR_UNKNOWN_DEPENDENCY',
  'ERR_DEPENDENCY_CYCLE',
  'ERR_MISSING_MIGRATION',
  'ERR_CHECKSUM_DRIFT',
  'ERR_UNKNOWN_MIGRATION',
  'ERR_MIGRATION_FAILED',
  'ERR_ROLLBACK_FAILED',
  'ERR_NOT_ENOUGH_HISTORY',
];

export class MigrationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MigrationError';
    this.code = code;
    this.details = details;
  }
}
