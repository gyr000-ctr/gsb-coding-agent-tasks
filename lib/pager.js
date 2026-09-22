// 稳定游标分页器。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/cursor|page|stability）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）和编码摘要工具（lib/codec.js）
// 都已经按 README 的《口径》和《API》两节写好了。那些约定不要改，把这里补出来。

export const DEFAULTS = {
  ttlMs: 300000,
  defaultLimit: 20,
  maxLimit: 100,
};

const NOT_IMPLEMENTED = 'lib/pager.js 还没实现，口径见 README 的《口径》和《API》';

export function createPager(config = {}) {
  void config;
  throw new Error(NOT_IMPLEMENTED);
}
