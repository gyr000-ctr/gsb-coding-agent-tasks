// 登录会话仓库。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/login|refresh）、演示脚本（scripts/demo.mjs）、
// 错误码（lib/errors.js）都已经按 README 的《口径》和《API》两节写好了。
// 那些约定不要改，把这里补出来。

export const DEFAULTS = {
  idleTtlMs: 1800000,
  absoluteTtlMs: 86400000,
  maxDevices: 3,
};

const NOT_IMPLEMENTED = 'lib/vault.js 还没实现，口径见 README 的《口径》和《API》';

export function createVault(config = {}) {
  void config;
  throw new Error(NOT_IMPLEMENTED);
}
