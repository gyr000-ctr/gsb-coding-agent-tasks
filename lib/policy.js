// HTTP 缓存新鲜度与再验证决策。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/directives|freshness|decide|revalidate）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）和头部/日期工具（lib/parse.js）
// 都已经按 README 的《口径》和《API》两节写好了。那些约定不要改，把这里补出来。

// 默认能进缓存的响应状态码。
export const CACHEABLE_STATUS = [200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501];

// 能用 Last-Modified 推启发式新鲜度的状态码。
export const HEURISTIC_STATUS = [200, 203, 300, 301, 308, 404, 405, 410, 414, 501];

// 304 合并时绝不覆盖的字段。
export const NEVER_UPDATED = ['connection', 'transfer-encoding', 'content-length', 'content-range'];

export const DEFAULTS = {
  shared: false,
  clock: () => Date.now(),
};

const NOT_IMPLEMENTED = 'lib/policy.js 还没实现，口径见 README 的《口径》和《API》';

export function createCachePolicy(options = {}) {
  void options;
  throw new Error(NOT_IMPLEMENTED);
}
