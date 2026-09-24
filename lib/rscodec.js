// GF(256) 上的 Reed-Solomon 纠删码：GF 四则、系统性编码、擦除求解。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/gf.test.js、test/codec.test.js）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）都已经按 README 的《口径》和《API》两节
// 写好了。那些约定不要改，把这里补出来。

const NOT_IMPLEMENTED = 'lib/rscodec.js 还没实现，口径见 README 的《口径》和《API》';

export function gfMul(left, right) {
  void left;
  void right;
  throw new Error(NOT_IMPLEMENTED);
}

export function gfDiv(left, right) {
  void left;
  void right;
  throw new Error(NOT_IMPLEMENTED);
}

export function gfPow(base, power) {
  void base;
  void power;
  throw new Error(NOT_IMPLEMENTED);
}

export function encode(data, options = {}) {
  void data;
  void options;
  throw new Error(NOT_IMPLEMENTED);
}

export function decode(shards, options = {}) {
  void shards;
  void options;
  throw new Error(NOT_IMPLEMENTED);
}
