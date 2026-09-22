// LSM 层级压缩计划器。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/config|score|plan）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）和键/区间工具（lib/keys.js）
// 都已经按 README 的《口径》和《API》两节写好了。那些约定不要改，把这里补出来。

export const DEFAULTS = {
  levelCount: 4,
  l0TriggerFiles: 4,
  levelSizeBase: 4096,
  fanout: 4,
  targetFileSize: 1024,
  maxInputBytes: 8192,
  tombstoneBytes: 64,
};

const NOT_IMPLEMENTED = 'lib/planner.js 还没实现，口径见 README 的《口径》和《API》';

export function createPlanner(options = {}) {
  void options;
  throw new Error(NOT_IMPLEMENTED);
}
