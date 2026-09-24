// 回溯正则引擎：解析成语法树，然后按「最左优先 + 贪婪优先」的顺序回溯着试。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/engine.test.js、test/edge.test.js）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）都已经按 README 的《口径》和《API》
// 两节写好了。那些约定不要改，把这里补出来。

const NOT_IMPLEMENTED = 'lib/regexpx.js 还没实现，口径见 README 的《口径》和《API》';

export function compile(pattern, options = {}) {
  void pattern;
  void options;
  throw new Error(NOT_IMPLEMENTED);
}