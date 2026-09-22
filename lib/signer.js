// SigV4 风格的请求签名器。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/canonical|sign|presign）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）和编码摘要工具
// （lib/encode.js）都已经按 README 的《口径》和《API》两节写好了。
// 那些约定不要改，把这里补出来。

export const ALGORITHM = 'AWS4-HMAC-SHA256';
export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

export const DEFAULTS = {
  expiresIn: 900,
  skewMs: 300000,
};

// 这些头永远不参与签名（传输层自己会改，签了反而校验不过）。
export const SKIP_HEADERS = [
  'authorization',
  'connection',
  'content-length',
  'expect',
  'proxy-authorization',
  'transfer-encoding',
  'user-agent',
  'x-amzn-trace-id',
];

const NOT_IMPLEMENTED = 'lib/signer.js 还没实现，口径见 README 的《口径》和《API》';

export function createSigner(config = {}) {
  void config;
  throw new Error(NOT_IMPLEMENTED);
}
