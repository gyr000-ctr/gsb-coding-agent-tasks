// 重试策略。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/next|config）、演示脚本（scripts/demo.mjs）、
// 错误码（lib/errors.js）都已经按 README 的《口径》和《API》两节写好了。
// 那些约定不要改，把这里补出来。

export const DEFAULTS = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
  jitter: 'none',
};

export const REASONS = ['not-retryable', 'attempts-exhausted', 'retry-after', 'backoff'];

const NOT_IMPLEMENTED = 'lib/retry.js 还没实现，口径见 README 的《口径》和《API》';

export function createRetryPolicy(config = {}) {
  void config;
  throw new Error(NOT_IMPLEMENTED);
}
