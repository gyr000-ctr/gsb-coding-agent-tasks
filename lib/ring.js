// 一致性哈希分片环。
//
// 这个文件是仓库里唯一还没实现的部分：用例（test/lookup|move|plan）、
// 演示脚本（scripts/demo.mjs）、错误码（lib/errors.js）和哈希（lib/hash.js）
// 都已经按 README 的《口径》和《API》两节写好了。那些约定不要改，把这里补出来。

export const DEFAULTS = {
  replicas: 64, // 每个单位的权重铺多少个虚拟节点
  nodes: [],
};

const NOT_IMPLEMENTED = 'lib/ring.js 还没实现，口径见 README 的《口径》和《API》';

export function createRing(config = {}) {
  void config;
  throw new Error(NOT_IMPLEMENTED);
}
