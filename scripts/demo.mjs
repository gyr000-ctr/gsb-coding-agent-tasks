import { createRing } from '../lib/ring.js';
import { hex8 } from '../lib/hash.js';

const keys = (count) => Array.from({ length: count }, (_, index) => `user-${index}`);
const three = [{ name: 'shard-a' }, { name: 'shard-b' }, { name: 'shard-c' }];

console.log('shardring demo');

console.log('[1] 三个节点铺出来多少虚拟节点');
const ring = createRing({ nodes: three });
const stats = ring.stats();
console.log(`    nodes=${stats.nodes} vnodes=${stats.vnodes} min=${stats.minVnodes} max=${stats.maxVnodes}`);
const first = ring.points()[0];
console.log(`    环上第一个点是 ${first.vnode} point=${hex8(first.point)}`);

console.log('[2] 同一个 key 每次都落在同一个分片');
for (const key of ['user-1', 'user-2', 'user-3']) {
  console.log(`    ${key} -> ${ring.lookup(key)}`);
}
const again = createRing({ nodes: three });
console.log(`    重开一个环再查 user-1 -> ${again.lookup('user-1')}`);

console.log('[3] 一个 key 要两个不同分片');
console.log(`    user-7 的副本 ${ring.lookupReplicas('user-7', 2).join(',')}`);

console.log('[4] 加一个节点，看看到底挪了多少');
const list = keys(1000);
const grown = ring.plan(list, [...three, { name: 'shard-d' }]);
console.log(`    moved=${grown.moved.length} stayed=${grown.stayed}`);
console.log(
  `    新环各分片分到的是 ${Object.entries(grown.load.new)
    .map(([name, count]) => `${name}=${count}`)
    .join(' ')}`,
);

console.log('[5] 去掉一个节点，挪动的 key 原来都归它');
const shrunk = ring.plan(list, [{ name: 'shard-a' }, { name: 'shard-b' }]);
console.log(`    moved=${shrunk.moved.length} stayed=${shrunk.stayed}`);
console.log(`    挪走的 key 原来都归 ${[...new Set(shrunk.moved.map((one) => one.from))].join(',')}`);

console.log('[6] 权重不一样，分到的 key 也不一样');
const weighted = createRing({ nodes: [{ name: 'small', weight: 1 }, { name: 'big', weight: 3 }] });
const spread = weighted.distribution(list);
console.log(`    small=${spread.small} big=${spread.big}`);
