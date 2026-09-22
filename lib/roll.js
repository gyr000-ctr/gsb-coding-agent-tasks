// 灰度规则求值。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/roll|rules）、演示脚本（scripts/demo.mjs）、
// 错误码（lib/errors.js）和分桶哈希（lib/hash.js）都已经按 README 的《口径》和《API》
// 两节写好了。那些约定不要改，把这里补出来。

export const DEFAULTS = {
  salt: 'v1',
  percent: 100,
};

const NOT_IMPLEMENTED = 'lib/roll.js 还没实现，口径见 README 的《口径》和《API》';

export function createRoller(config = {}) {
  void config;
  throw new Error(NOT_IMPLEMENTED);
}
