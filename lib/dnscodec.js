// DNS 报文编解码：头部、问询、资源记录、名字压缩指针、rdata 解析与 TC 截断。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/decode.test.js、test/encode.test.js）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）都已经按 README 的《口径》和《API》两节
// 写好了。那些约定不要改，把这里补出来。

const NOT_IMPLEMENTED = 'lib/dnscodec.js 还没实现，口径见 README 的《口径》和《API》';

export function encodeMessage(message, options = {}) {
  void message;
  void options;
  throw new Error(NOT_IMPLEMENTED);
}

export function decodeMessage(bytes) {
  void bytes;
  throw new Error(NOT_IMPLEMENTED);
}
