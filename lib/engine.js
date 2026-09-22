// 表格公式引擎。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/formula|recalc）、演示脚本（scripts/demo.mjs）、
// 错误码（lib/errors.js）和 A1 记法工具（lib/cells.js）都已经按 README 的《口径》和《API》
// 两节写好了。那些约定不要改，把这里补出来。

export const ERROR_VALUES = ['#DIV/0!', '#VALUE!', '#NAME?', '#REF!', '#CYCLE!', '#ERROR!'];

export const FUNCTIONS = ['SUM', 'MIN', 'MAX', 'COUNT', 'IF', 'ROUND', 'ABS', 'AND', 'OR', 'NOT', 'LEN'];

export const DEFAULTS = {
  sheets: {},
};

const NOT_IMPLEMENTED = 'lib/engine.js 还没实现，口径见 README 的《口径》和《API》';

export function createEngine(config = {}) {
  void config;
  throw new Error(NOT_IMPLEMENTED);
}
