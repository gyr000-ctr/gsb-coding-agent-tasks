# cursorkit

稳定游标分页：多键排序、值的类型有固定先后、游标签名防篡改、翻页期间增删行不重不漏。
只用 Node 标准库，没有第三方包，`node >= 20`。

```
cursorkit/
├── lib/
│   ├── pager.js     createPager 本体                         ← 还没实现
│   ├── codec.js     固定键序 JSON、base64url、HMAC 与安全比较
│   └── errors.js    PageError 与全部错误码
├── test/            cursor / page / stability 三组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 17 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 配置

`createPager({ key, sort, filter?, clock?, ttlMs?, defaultLimit?, maxLimit? })`

- `key` 非空字符串，游标用它做 HMAC；`sort` 是非空数组，每项 `{ field, direction }`，
  `direction` 只能是 `asc` / `desc`（不给就是 `asc`），字段名不能重复、不能写 `id`
  （`id` 是自带的兜底排序键）。任何一项不合法报 `ERR_BAD_CONFIG`。
- `filter` 给了就得是函数；`clock` 不给就用系统时间，**游标的签发时间和过期判断都只走 clock**。
- `ttlMs` 默认 300000、`maxLimit` 默认 100、`defaultLimit` 默认 20，都是正整数，
  且 `defaultLimit <= maxLimit`。

### 行和值的先后

- 每一行是个对象，`id` 必须是非空字符串且**在当前这批 rows 里唯一**，
  否则报 `ERR_BAD_ROW`。
- 排序字段的值只收四种：`null` / `undefined`（排最前）、数字、字符串、布尔。
  先后顺序就是 **null < 数字 < 字符串 < 布尔**（`false` < `true`），
  数字和字符串按大小 / 字典序；别的类型（对象、数组、函数）报 `ERR_BAD_ROW`。
- 排序键比完之后一律再用 `id` 升序兜底，所以顺序是唯一的。

### 游标

游标是 `<base64url(固定键序 JSON)>.<HMAC-SHA256 十六进制>`，JSON 里是：

```js
{ v: 1, at: 签发时间, sort: [[字段, 方向, 值], ...], id }
```

- 解码时按顺序检查：格式、签名（十六进制按字节比）、能不能解析、`v === 1`、
  排序字段和方向跟本分页器完全一致、值的类型合法。任何一项不过都报 `ERR_BAD_CURSOR`。
- `now - at > ttlMs` 报 `ERR_EXPIRED`（正好等于 ttl 那一毫秒还算有效）。
- `decode(cursor)` 返回 `{ id, at, expiresAt, position: { values, id } }`；
  `cursorFor(row)` 直接给某一行生成游标。

### 翻页

`page({ rows, limit, after })` 返回 `{ rows, nextCursor, hasMore, total }`：

1. 先校验每一行，再用 `filter` 过一遍，最后排序；`total` 是过滤之后的行数。
2. `limit` 不给就是 `defaultLimit`，必须是 `1 ~ maxLimit` 的整数，否则报 `ERR_BAD_LIMIT`。
3. `after` 给了就解码游标，然后从**严格大于游标位置**的第一行开始取——
   这里只比"键值 + id"，**跟游标那一行还在不在没关系**。
4. 取够 `limit` 行后，`hasMore` 表示后面还有没有行；`nextCursor` 是这一页最后一行的游标，
   没有下一页就是 `null`。

于是翻页期间：游标之前插进来的行不会重复出现，游标之后插进来的行会出现在后面的页里，
游标那一行被删掉也不会影响下一页从哪里开始。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | 配置缺项、`sort` 不合法、`filter` 不是函数、`clock` 没返回时间、三个 limit/ttl 不是正整数、`defaultLimit > maxLimit` |
| `ERR_BAD_ROW` | rows 不是数组、某一行不是对象、`id` 为空或重复、排序字段的值类型不支持 |
| `ERR_BAD_LIMIT` | `limit` 不是 `1 ~ maxLimit` 的整数 |
| `ERR_BAD_CURSOR` | 游标不是字符串、格式或签名不对、内容解不开、版本不认识、排序键或值的类型对不上 |
| `ERR_EXPIRED` | 游标签发时间超过 `ttlMs` |

## API

```js
import { createPager, DEFAULTS } from './lib/pager.js';

const pager = createPager({
  key: 'secret',
  sort: [{ field: 'score', direction: 'desc' }, { field: 'name' }],
  clock: () => Date.now(),
  defaultLimit: 20,
});

pager.page({ rows, limit: 20, after: cursor });  // -> { rows, nextCursor, hasMore, total }
pager.cursorFor(row);                            // -> 游标字符串
pager.decode(cursor);                            // -> { id, at, expiresAt, position }
pager.now();                                     // -> 毫秒时间戳
pager.sort();                                    // -> 生效的排序规格
```

出错一律抛 `PageError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的时间和数据都是写死的，输出每一行都能对上：

```
cursorkit demo
[1] 第一页（score 降序、name 升序，键值一样按 id）
    u01,u03,u02 total=12 hasMore=true
[2] 第二页：只带游标，不带 offset
    u04,u05,u06 hasMore=true
    游标里存的是 score/name/id：{"values":[88,"bo"],"id":"u02"}
[3] 游标之前插进来一行 99 分，第二页不变
    u04,u05,u06
[4] 把游标那一行删掉，第二页还是不变
    u04,u05,u06
[5] 游标是签过名的，过期和篡改都能认出来
    改一个字符：ERR_BAD_CURSOR
    五分钟之后：ERR_EXPIRED
```
