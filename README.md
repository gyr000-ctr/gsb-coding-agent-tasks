# shardring

一致性哈希分片环：节点按权重铺虚拟节点，key 落到环上第一个点，加一个节点只挪该挪的那部分。
只用 Node 标准库，没有第三方包，`node >= 20`。

```
shardring/
├── lib/
│   ├── ring.js      createRing 本体                          ← 还没实现
│   ├── hash.js      32 位 FNV-1a 与十六进制格式化
│   └── errors.js    RingError 与全部错误码
├── test/            lookup / move / plan 三组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 21 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 环是怎么铺的

- 节点写成 `{ name, weight }`，`weight` 是正数，不给就是 1。名字不能空、不能重复。
- `replicas`（默认 64）是"一个单位的权重铺几个虚拟节点"：
  **每个节点的虚拟节点数 = `max(1, round(replicas * weight))`**。
- 第 `i` 个虚拟节点的名字是 `` `${name}#${i}` ``（`i` 从 0 起），
  环上的位置 `point = hash32(那个名字)`，是 0 ~ 2^32-1 的整数。
- 环上的点按 `point` 升序排；`point` 撞了的话按虚拟节点名字字典序排（保证两个进程排出来一样）。
- 哈希就用 `lib/hash.js` 的 `hash32`，别换别的（换了两边算出来的分片就不一样了）。

### 怎么查

- `lookup(key)`：从 `hash32(key)` 往后找**第一个 `point >= hash`** 的点，取它的节点；
  都比完了就绕回第一个点。环上一个节点都没有，报 `ERR_NO_NODES`。
- `lookupReplicas(key, count)`：从 `lookup` 那个点开始沿环往后走，**同一个节点只取一次**，
  凑够 `count` 个；节点不够就有几个给几个；`count` 给 0 就是空数组，
  给了非负整数以外的东西报 `ERR_BAD_COUNT`。

### 加节点 / 去节点

- `addNode({ name, weight })`：名字已经在环上报 `ERR_BAD_NODE`，权重不合法报 `ERR_BAD_WEIGHT`。
- `removeNode(name)`：名字不在环上报 `ERR_BAD_NODE`。
- 加一个节点只应该"接管"它自己那几个虚拟节点后面的一段：原来归别的节点的 key 不动；
  去掉一个节点，原来归它的 key 会落到剩下的环上，别的 key 不动。
- 环是重新铺的，所以 `removeNode` 再把同一个节点加回来，环必须跟原来一模一样。

### 迁移计划

`plan(keys, nextNodes)` 按 `nextNodes` 另建一个环（`replicas` 用当前这个环的），
把 `keys` 在新旧两个环上各查一次：

```js
{
  moved: [{ key, from, to }],  // from 跟 to 不一样的，按 key 升序；旧环是空的时 from 是 null
  stayed: 68,                  // 没动的条数
  load: { old: { shard-a: 344, ... }, new: { shard-a: 344, ..., shard-d: 320 } },
}
```

`keys` 里重复的只算一条；`load` 里新旧两边每个节点都给一行（没分到就是 0），
两边各自加总都等于去重后的 key 数。`nextNodes` 是空环就报 `ERR_NO_NODES`。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `replicas` 不是正整数、`nodes` 不是数组、节点不是 `{ name, weight }`、`keys` 不是字符串数组 |
| `ERR_BAD_NODE` | 节点名空、重名（含 `addNode` 撞名、`removeNode` 找不到） |
| `ERR_BAD_WEIGHT` | 权重不是正数 |
| `ERR_BAD_COUNT` | `lookupReplicas` 的 `count` 不是非负整数 |
| `ERR_NO_NODES` | 空环上做 `lookup` / `lookupReplicas`，或者 `plan` 的目标环是空的 |

## API

```js
import { createRing, DEFAULTS } from './lib/ring.js';

const ring = createRing({
  replicas: 64,
  nodes: [{ name: 'shard-a' }, { name: 'shard-b', weight: 2 }],
});

ring.lookup('user-1');                 // -> 'shard-a'
ring.lookupReplicas('user-1', 2);      // -> ['shard-a', 'shard-b']
ring.addNode({ name: 'shard-c', weight: 0.5 });   // -> { name, weight, vnodes }
ring.removeNode('shard-c');                       // -> { name, weight, vnodes }
ring.names();                          // -> 节点名，字典序
ring.points();                         // -> [{ point, node, vnode }]，按环序
ring.size();                           // -> 虚拟节点总数
ring.stats();                          // -> { nodes, vnodes, minVnodes, maxVnodes, replicas }
ring.distribution(keys);               // -> { [节点名]: 分到几个 key }
ring.plan(keys, nextNodes);            // -> { moved, stayed, load }
```

出错一律抛 `RingError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的节点和 key 都是写死的，输出每一行都能对上：

```
shardring demo
[1] 三个节点铺出来多少虚拟节点
    nodes=3 vnodes=192 min=64 max=64
    环上第一个点是 shard-c#17 point=00ab6abc
[2] 同一个 key 每次都落在同一个分片
    user-1 -> shard-a
    user-2 -> shard-c
    user-3 -> shard-a
    重开一个环再查 user-1 -> shard-a
[3] 一个 key 要两个不同分片
    user-7 的副本 shard-a,shard-c
[4] 加一个节点，看看到底挪了多少
    moved=320 stayed=680
    新环各分片分到的是 shard-a=344 shard-b=167 shard-c=169 shard-d=320
[5] 去掉一个节点，挪动的 key 原来都归它
    moved=169 stayed=831
    挪走的 key 原来都归 shard-c
[6] 权重不一样，分到的 key 也不一样
    small=221 big=779
```
