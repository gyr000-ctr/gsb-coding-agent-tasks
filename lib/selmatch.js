// CSS 选择器引擎：把选择器文本解析成 AST，再按优先级和组合子去节点树上找节点。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/parse.test.js、test/match.test.js）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）都已经按 README 的《口径》和《API》两节
// 写好了。那些约定不要改，把这里补出来。

const NOT_IMPLEMENTED = 'lib/selmatch.js 还没实现，口径见 README 的《口径》和《API》';

export function parse(selector) {
  void selector;
  throw new Error(NOT_IMPLEMENTED);
}

export function queryAll(root, selector) {
  void root;
  void selector;
  throw new Error(NOT_IMPLEMENTED);
}
