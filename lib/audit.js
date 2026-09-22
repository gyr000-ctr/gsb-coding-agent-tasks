// 审计日志。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/append|query）、演示脚本（scripts/demo.mjs）、
// 错误码（lib/errors.js）都已经按 README 的《口径》和《API》两节写好了。
// 那些约定不要改，把这里补出来。

export const DEFAULTS = {
  retentionMs: 2592000000,
  maxEvents: 10000,
  limit: 50,
};

export const SENSITIVE_KEYS = ['password', 'passwd', 'token', 'secret', 'authorization', 'api-key', 'apikey'];

const NOT_IMPLEMENTED = 'lib/audit.js 还没实现，口径见 README 的《口径》和《API》';

export function createAuditLog(config = {}) {
  void config;
  throw new Error(NOT_IMPLEMENTED);
}
