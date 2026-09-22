// JWT 校验器。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/token|claims）、演示脚本（scripts/demo.mjs）、
// 错误码（lib/errors.js）和 JOSE 编解码/验签工具（lib/jose.js）都已经按 README 的
// 《口径》和《API》两节写好了。那些约定不要改，把这里补出来。

export const DEFAULTS = {
  algorithms: ['RS256'],
  clockSkewMs: 0,
  requiredClaims: ['exp'],
};

const NOT_IMPLEMENTED = 'lib/verifier.js 还没实现，口径见 README 的《口径》和《API》';

export function createVerifier(config = {}) {
  void config;
  throw new Error(NOT_IMPLEMENTED);
}
