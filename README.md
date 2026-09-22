# ttlcache

带 TTL 和容量上限的本地缓存：写满按 LRU 淘汰、过期只在被碰到时才发现、命中/淘汰/过期都记数。
只用 Node 标准库，没有第三方包，`node >= 20`。

```
ttlcache/
├── lib/
│   ├── cache.js     createCache 本体                         ← 还没实现
│   └── errors.js    CacheError 与全部错误码
├── test/            cache / expire 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 14 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 配置

`createCache({ capacity, ttlMs, clock })`

- `capacity` 是正整数（默认 3），`ttlMs` 是 0 或者正整数（默认 60000），`clock` 不给就用系统时间；
  不合法报 `ERR_BAD_CONFIG`。**"现在几点"只走 clock**。
- `ttlMs` 给 0 表示**永不过期**；构造时给的 ttlMs 是默认值，`set` 可以按次覆盖。
- key 必须是非空字符串，否则报 `ERR_BAD_KEY`。

### 使用顺序与淘汰

- 内部就按"从最久没用到最近用过"排队：`set` 和命中的 `get` 都会把那个 key 挪到最新，
  `has` **不**改顺序。
- `set` 放完之后如果条数超过 `capacity`，就从最旧的开始挤，直到不超过为止；
  返回 `{ evicted: [...] }`（按被挤掉的先后），每挤一个记一次 `evictions`。
- 覆盖一个已经存在的 key 是"更新"：值替换、TTL 重算、顺序挪到最新，**不算淘汰**。
- 只有 `get` 会动命中统计：命中记 `hits`，没命中（包括已经过期的）记 `misses`。

### 过期

- 条目的过期时刻是 `写入时间 + ttlMs`，**`now >= 过期时刻` 就算过期**（正好到点那一刻已经过期）。
- 过期是惰性发现的：`get` / `has` / `keys` / `prune` 碰到过期条目就删掉并记一次 `expirations`。
  `size()` 不清理，所以它可能包含"已经过期但还没被发现"的条目——**这些条目照样占容量，
  也可能被 LRU 挤掉**。
- `prune()` 清掉所有已过期的条目并返回清掉的条数；`keys()` 先 prune 再返回，
  顺序是**从最近用到最久没用**。
- `delete(key)` 返回这个 key 在不在（过期的也算在），不记 `expirations`。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `capacity` 不是正整数、`ttlMs` 不是 0 或正整数、`clock` 不是函数或没返回时间 |
| `ERR_BAD_KEY` | key 不是非空字符串 |

## API

```js
import { createCache, DEFAULTS } from './lib/cache.js';

const store = createCache({ capacity: 2, ttlMs: 1000, clock: () => Date.now() });

store.set('user:1', { name: 'an' });          // -> { evicted: [] }
store.set('token', 'abc', { ttlMs: 0 });      // 这一格永不过期
store.get('user:1');                          // -> 值 / undefined
store.has('user:1');                          // -> true / false
store.delete('user:1');                       // -> true / false
store.keys();                                 // -> 从最近用到最久没用
store.size();                                 // -> 当前条数（不清理过期）
store.prune();                                // -> 清掉几个
store.stats();                                // -> { hits, misses, evictions, expirations, size }
```

出错一律抛 `CacheError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的时间都是写死的，输出每一行都能对上：

```
ttlcache demo
[1] 容量 2，塞第三个先把最久没用的挤掉
    evicted=["user:1"]
    剩下的 user:3,user:2
[2] 读过的键会被挪到最新
    读 user:3 之后 hit
    再塞一个挤掉 ["user:1"]
    现在有 user:4,user:3
[3] TTL 到点
    999 毫秒时 abc
    1000 毫秒时 undefined
[4] 统计
    hits=2 misses=1 evictions=4 expirations=1 size=1
[5] prune 会返回清掉几个
    2
```
