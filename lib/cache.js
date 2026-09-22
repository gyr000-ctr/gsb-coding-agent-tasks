// 带 TTL 与容量上限的本地缓存。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/cache|expire）、演示脚本（scripts/demo.mjs）、
// 错误码（lib/errors.js）都已经按 README 的《口径》和《API》两节写好了。
// 那些约定不要改，把这里补出来。

export const DEFAULTS = {
  capacity: 3,
  ttlMs: 60000,
};

const NOT_IMPLEMENTED = 'lib/cache.js 还没实现，口径见 README 的《口径》和《API》';

export function createCache(config = {}) {
  void config;
  throw new Error(NOT_IMPLEMENTED);
}
