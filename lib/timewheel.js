// 分层时间轮：格子、层级选择、级联与虚拟时钟。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/wheel.test.js、test/oracle.test.js）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）都已经按 README 的《口径》和《API》两节
// 写好了。那些约定不要改，把这里补出来。

const NOT_IMPLEMENTED = 'lib/timewheel.js 还没实现，口径见 README 的《口径》和《API》';

export function createWheel(options = {}) {
  void options;
  throw new Error(NOT_IMPLEMENTED);
}
