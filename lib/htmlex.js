// 一小段 HTML 的分词器：把源码切成 token，顺手把毛病记下来。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/token.test.js、test/edge.test.js）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）都已经按 README 的《口径》和《API》 两节
// 写好了。那些约定不要改，把这里补出来。

const NOT_IMPLEMENTED = 'lib/htmlex.js 还没实现，口径见 README 的《口径》和《API》';

export function tokenize(html) {
  void html;
  throw new Error(NOT_IMPLEMENTED);
}
