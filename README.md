# freshcache

HTTP 缓存的新鲜度与再验证决策：算当前年龄和新鲜期、按 Vary 比值、判断这次是命中还是必须
回源、304 回来以后怎么合并。只用 Node 标准库，没有第三方包，`node >= 20`。

```
freshcache/
├── lib/
│   ├── policy.js    createCachePolicy 本体                   ← 还没实现
│   ├── parse.js     头部取值、列表拆分、HTTP 日期解析
│   └── errors.js    CacheError 与全部错误码
├── test/            directives / freshness / decide / revalidate 四组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 30 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 时间都从 clock 来

- `createCachePolicy({ shared = false, clock })`：`shared` 是共享缓存（CDN / 网关）还是私有缓存，
  `clock` 不给就用系统时间；**所有"现在几点"都只走 clock**，测试和 demo 靠它注入固定时刻。
- `now()` 返回毫秒时间戳；clock 返回 `Date` 或者数字都行，返回别的东西报 `ERR_BAD_CONFIG`。

### 缓存条目长这样

```js
entry = {
  request:  { method, url, headers },   // 当初那条请求
  response: { status, headers },        // 存下来的响应
  storedAt,                             // 毫秒时间戳，必填
  responseTime,                         // 不给就是 storedAt
  requestTime,                          // 不给就是 responseTime，不能晚于 responseTime
}
```

### Cache-Control 怎么解析

- 逗号分隔，**引号里的逗号不算分隔**；名字大小写不敏感、两边空白去掉。
- 不带 `=` 的是开关指令，值给 `true`；带引号的值先去引号再解释。
- 数值指令（`max-age`、`s-maxage`、`min-fresh`、`max-stale`、`stale-while-revalidate`、
  `stale-if-error`）的值必须是纯非负整数，否则**整条指令当没写**；
  只有 `max-stale` 例外，不带值时算 `true`（多久都行）。
- 同一个指令出现多次，**只认第一个**。

### 当前年龄

按 RFC 9111 那套取大的那个：

```
apparent_age    = max(0, responseTime - Date 头)
response_delay  = max(0, responseTime - requestTime)
age_value       = Age 头（纯整数秒，解不开当 0）× 1000
初始年龄        = max(apparent_age, age_value + response_delay)
当前年龄        = 初始年龄 + max(0, now - responseTime)
```

Date 头缺省就拿 responseTime 当基准。

### 新鲜期

`freshnessLifetime(response)` 返回 `{ seconds, source }`，按下面的顺序取第一个命中的：

1. `no-cache` → `{ 0, 'no-cache' }`（能存但每次都要再验证）
2. 共享缓存且 `s-maxage` 合法 → `'s-maxage'`
3. `max-age` 合法 → `'max-age'`
4. 有 `Expires` → 和 Date 头相减向下取整到秒，负数算 0，解不开算 0，source 是 `'expires'`
5. 状态码在 `HEURISTIC_STATUS` 里、且 Date 比 Last-Modified 晚：
   `floor((Date - Last-Modified) / 10000)` 秒，最多一天（86400），source 是 `'heuristic'`
6. 都没有 → `{ 0, 'none' }`

`isFresh(entry)` 就是 `新鲜期 > 0 且 当前年龄 < 新鲜期 × 1000`，正好卡在新鲜期那一秒算过期。

### Vary

- 响应上没 `Vary` 就算匹配；`Vary: *` 永远不匹配。
- 列出来的头逐个比值：两边都按"去首尾空白 + 连续空白压成一个空格"比，
  **缺省的头当空串**，所以一边有值一边没有就是不匹配。

### 能不能存

`storable({ request, response })` 返回 `{ storable, reason?, ttlMs? }`，按顺序判：

1. 请求方法不是 GET / HEAD → `method`
2. 请求 `no-store` → `request-no-store`
3. 响应 `no-store` → `response-no-store`
4. 共享缓存碰上 `private` → `private`
5. 共享缓存、请求带 `Authorization`，而响应既没有 `public` 也没有合法的 `s-maxage` → `authorized`
6. 状态码不在 `CACHEABLE_STATUS` 里 → `status`
7. `Vary: *` → `vary-star`
8. 能存 → `{ storable: true, ttlMs: 新鲜期 × 1000 }`

`store({ request, response, now })` 在能存时多返回一个 entry：`request`、`response` 各存一份副本，
`requestTime`、`responseTime`、`storedAt` 都等于 `now`（不给 `now` 就用 `now()`）。

### 这次该怎么办

`decide({ request, entry })` 返回 `{ action, reason, age, staleBy, lifetime, warnings }`，
`action` 只有 `hit` / `miss` / `revalidate` / `stale-while-revalidate` / `only-if-cached-miss`。
判断顺序写死了，照着走：

1. 请求 `no-store` → `miss` / `request-no-store`
2. 没有 entry → `miss` / `no-entry`（请求带 `only-if-cached` 就是 `only-if-cached-miss`）
3. 方法不是 GET / HEAD → `miss` / `method`
4. 共享缓存碰上响应 `private` → `miss` / `private`
5. 共享缓存、带 `Authorization`、响应不 `public` 也没 `s-maxage` → `miss` / `authorized`
6. Vary 不匹配 → `miss` / `vary`
7. 请求 `no-cache` → `revalidate` / `request-no-cache`
8. 请求 `max-age=N` 且当前年龄 > N 秒 → `revalidate` / `request-max-age`
9. 请求 `min-fresh=N` 且 `新鲜期 - 当前年龄 < N` 秒 → `revalidate` / `request-min-fresh`
10. 还新鲜 → `hit` / `fresh`
11. 过期了（`staleBy` 是超出新鲜期多少毫秒）：
    - 请求 `only-if-cached` → `only-if-cached-miss` / `only-if-cached`
    - 响应 `no-cache` / `must-revalidate`，或者共享缓存碰上 `proxy-revalidate` → `revalidate`，reason 用对应指令名
    - 请求带 `max-stale`（不带值，或 `staleBy <= max-stale × 1000`）→ `hit` / `max-stale`
    - 响应 `stale-while-revalidate=W` 且 `staleBy <= W` 秒 → `stale-while-revalidate`
    - 其余 → `revalidate` / `stale`

`warnings` 是给响应头用的字符串：给过期内容时带 `110 - "Response is Stale"`，
新鲜期是启发式算出来的又拿它做了决定时带 `113 - "Heuristic Expiration"`。

### 304 合并

`revalidate({ entry, response, now })` 只接 `status === 304`，别的状态码报 `ERR_BAD_REQUEST`。
合并规则：先把旧响应的头名统一小写，再用 304 里的头覆盖，**但 `NEVER_UPDATED`
（`connection`、`transfer-encoding`、`content-length`、`content-range`）里的字段一律不动**。
返回 `{ entry, updated, kept }`：`updated` / `kept` 是排过序的头名，新 entry 的状态码沿用旧的，
三个时间戳都重置成 `now`（新鲜期从这次重新算），原 entry 不能被改动。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `shared` 不是布尔、`clock` 不是函数或没返回时间 |
| `ERR_BAD_REQUEST` | request / response / headers 形状不对、method 或 url 不合法、status 不在 100~599、304 之外的状态码走 revalidate |
| `ERR_BAD_ENTRY` | entry 形状不对：不是对象、`storedAt` 不是时间戳、没有 `response`、`responseTime` 早于 `requestTime` |

## API

```js
import { createCachePolicy, CACHEABLE_STATUS, HEURISTIC_STATUS, NEVER_UPDATED, WARNINGS } from './lib/policy.js';

const policy = createCachePolicy({ shared: false, clock: () => Date.now() });

policy.now();                                  // -> 毫秒时间戳
policy.parseCacheControl('max-age=60, no-cache');
policy.ageOf(entry);                           // -> 毫秒
policy.freshnessLifetime(response);            // -> { seconds, source }
policy.isFresh(entry);                         // -> true / false
policy.varyMatches(request, entry);            // -> true / false
policy.storable({ request, response });        // -> { storable, reason?, ttlMs? }
policy.store({ request, response, now });      // -> { storable, reason?, ttlMs?, entry? }
policy.decide({ request, entry });             // -> { action, reason, age, staleBy, lifetime, warnings }
policy.revalidate({ entry, response: notModified, now });   // -> { entry, updated, kept }
```

出错一律抛 `CacheError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的时间、请求和响应都是写死的，输出每一行都能对上：

```
freshcache demo
[1] 一条 max-age 响应现在还新鲜吗
    hit/fresh 年龄 10 秒 新鲜期 60 秒
[2] 过期两分钟，但还在 stale-while-revalidate 窗口里
    stale-while-revalidate 过期 60 秒 警告 110 - "Response is Stale"
    窗口只有 30 秒时 stale
[3] Vary 变了就得重新取
    同一个 accept-encoding：hit
    换成 br：vary
[4] 共享缓存还要看 private 和 Authorization
    private：private
    带 Authorization：authorized
[5] 304 回来，只更新该更新的
    updated=cache-control,date,etag
    kept=content-length
    合并后还新鲜吗 true 新鲜期 300 秒
```
