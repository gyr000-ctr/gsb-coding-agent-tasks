// 确定性装箱：first-fit / best-fit / worst-fit / best-fit-decreasing，外加 maxBins 上限。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/pack.test.js、test/edge.test.js）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）都已经按 README 的《口径》和《API》两节
// 写好了。那些约定不要改，把这里补出来。

const NOT_IMPLEMENTED = 'lib/binpack.js 还没实现，口径见 README 的《口径》和《API》';

export function packBins(items, options = {}) {
  void items;
  void options;
  throw new Error(NOT_IMPLEMENTED);
}
