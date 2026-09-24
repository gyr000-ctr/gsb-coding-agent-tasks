// HyperLogLog 内核：稀疏 / 稠密两种寄存器表示，加上合并与基数估计。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/basic.test.js、test/merge.test.js）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）都已经按 README 的《口径》和《API》
// 两节写好了。那些约定不要改，把这里补出来。

const NOT_IMPLEMENTED = 'lib/hllset.js 还没实现，口径见 README 的《口径》和《API》';

export function hashOf(value, precision) {
  void value;
  void precision;
  throw new Error(NOT_IMPLEMENTED);
}

export class Hll {
  constructor(precision, sparseLimit) {
    this.precision = precision;
    this.sparseLimit = sparseLimit;
  }

  add(value) {
    void value;
    throw new Error(NOT_IMPLEMENTED);
  }

  count() {
    throw new Error(NOT_IMPLEMENTED);
  }

  registers() {
    throw new Error(NOT_IMPLEMENTED);
  }

  representation() {
    throw new Error(NOT_IMPLEMENTED);
  }

  merge(other) {
    void other;
    throw new Error(NOT_IMPLEMENTED);
  }

  clone() {
    throw new Error(NOT_IMPLEMENTED);
  }
}

export function createHll(options = {}) {
  void options;
  throw new Error(NOT_IMPLEMENTED);
}