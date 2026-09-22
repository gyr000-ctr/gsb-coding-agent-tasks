# gateway

后端 HTTP 入口网关：路由（含 `:id` 路径参数）、静态段优先、405 带 Allow、请求体大小与
content-type 检查、必填头校验，handler 抛异常统一 500。只用 Node 标准库，没有第三方包，`node >= 20`。

```
gateway/
├── lib/
│   ├── gateway.js   createGateway 本体                       ← 还没实现
│   └── errors.js    GatewayError 与错误码
├── test/            route / guard 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 13 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 注册路由

`addRoute({ method, path, requireHeaders, handler })` → `{ method, path }`：

- `method` 大小写不敏感，统一大写；`path` 以 `/` 开头，段里的 `:name` 是路径参数
  （参数名不能为空、同一条路由里不能重复）。
- `handler` 必须是函数；`requireHeaders` 是可选的字符串数组（比对时按小写）。
- 任何一项不合法报 `ERR_BAD_ROUTE`（注册失败时不会留下半条路由）。
- `createGateway({ maxBodyBytes })`：`maxBodyBytes` 默认 1024，必须是正整数，否则 `ERR_BAD_CONFIG`。

### 处理请求

`handle({ method, path, headers, body })` → `{ status, headers, body }`，按顺序判断：

1. 按段数相等逐段匹配：静态段要严格相等，`:name` 匹配任意非空段并放进 `params`。
   **同一个方法有多条能匹配时，静态段多的优先**（最近的静态路由不会被 `:id` 抢走）。
2. 没有路径能匹配 → `404 { error: 'not-found' }`。
3. 路径能匹配但没有这个方法 → `405`，并且带上 `allow` 头（这个路径允许的方法，升序、逗号分隔）。
4. `body` 按 UTF-8 字节数算，超过 `maxBodyBytes` → `413 { error: 'payload-too-large' }`。
5. body 非空但 `content-type`（忽略 `; charset=...` 之后）不是 `application/json` →
   `415 { error: 'unsupported-media-type' }`。
6. body 非空但 JSON 解析失败 → `400 { error: 'invalid-json' }`。
7. `requireHeaders` 里有头缺失或为空 → `401 { error: 'missing-header', header: '<小写名>' }`。
8. 以上都过了才调 handler：`handler({ params, body, headers })`，headers 的键都是小写。

**第 4~7 步里 handler 一次都不会被调用**；`body` 为空串（或没给）时跳过 5、6 两步。

### handler 的返回值

- `{ status?, body?, headers? }`：`status` 不给就是 200；`body` 是对象时自动序列化并补上
  `content-type: application/json`，是字符串时原样返回，不给就是 `null`。
- handler 抛异常 → `500 { error: 'internal' }`，并记一次 `errors`（不算 rejected）。

### 统计

`stats()` → `{ requests, ok, notFound, methodNotAllowed, rejected, errors }`：
`rejected` 是被 413 / 415 / 400 / 401 挡掉的请求数。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `maxBodyBytes` 不是正整数、配置不是对象 |
| `ERR_BAD_ROUTE` | 注册路由时字段不合法，或者 `handle` 的参数不是对象 |

## API

```js
import { createGateway, DEFAULTS } from './lib/gateway.js';

const gateway = createGateway({ maxBodyBytes: 1024 });
gateway.addRoute({ method: 'GET', path: '/orders/:id', handler: ({ params }) => ({ body: { id: params.id } }) });
gateway.addRoute({
  method: 'POST',
  path: '/orders',
  requireHeaders: ['X-Api-Key'],
  handler: ({ body }) => ({ status: 201, body }),
});

gateway.handle({ method: 'GET', path: '/orders/A-9' });              // -> { status: 200, headers, body }
gateway.handle({ method: 'POST', path: '/orders', headers, body });  // -> { status: 201, ... }
gateway.routes();                                                    // -> [{ method, path }]
gateway.stats();                                                     // -> { requests, ok, ... }
```

出错一律抛 `GatewayError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的路由和请求都是写死的，输出每一行都能对上：

```
gateway demo
[1] 取路径参数
    GET /orders/A-9 -> 200 {"id":"A-9"}
[2] 静态段比参数段优先
    GET /orders/recent -> 200 {"recent":true}
[3] 带必填头才能写
    POST /orders -> 201 {"created":"A-10"}
[4] 方法不对 / 少头 / 体太大
    DELETE -> 405 allow=GET
    POST 少 X-Api-Key -> 401 {"error":"missing-header","header":"x-api-key"}
    POST 体太大 -> 413 {"error":"payload-too-large"}
[5] handler 真正收到过几次
    1 次 [{"id":"A-10"}]
[6] 统计
    {"requests":6,"ok":3,"notFound":0,"methodNotAllowed":1,"rejected":2,"errors":0}
```
