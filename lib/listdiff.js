// 键控列表 diff 与回放：算增删改挪，挪位置的那批要尽量少。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/diff.test.js、test/apply.test.js）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）都已经按 README 的《口径》和《API》两节
// 写好了。那些约定不要改，把这里补出来。

const NOT_IMPLEMENTED = 'lib/listdiff.js 还没实现，口径见 README 的《口径》和《API》';

export function diffLists(prev, next, options = {}) {
  void prev;
  void next;
  void options;
  throw new Error(NOT_IMPLEMENTED);
}

export function applyOps(list, ops, options = {}) {
  void list;
  void ops;
  void options;
  throw new Error(NOT_IMPLEMENTED);
}
