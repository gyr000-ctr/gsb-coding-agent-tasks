# linkguard

私有下载链接的签名与校验：把路径和查询串规范化后用 HMAC 签个短签名，带上过期时间，谁改一个字符都验不过。
只用 Node 标准库，没有第三方包，`node >= 20`。

```
linkguard/
├── lib/
│   ├── link.js      createLinkSigner 本体                    ← 还没实现
│   ├── encode.js    RFC3986 百分号编码、HMAC、安全比较
│   └── errors.js    LinkError 与全部错误码
├── test/            sign / verify 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 13 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 配置

`createLinkSigner({ secret, clock, ttlMs })`

- `secret` 是非空字符串，`ttlMs` 是正整数（默认 3600000），`clock` 不给就用系统时间。
  任何一项不合法报 `ERR_BAD_CONFIG`；**"现在几点"只走 clock**。
- `clock` 返回 `Date` 或者毫秒数字都行，返回别的报 `ERR_BAD_CONFIG`。

### 签名素材

四行，用 `\n` 连接：

```
<方法>\n<规范路径>\n<规范查询串>\n<过期时间>
```

- 方法是 `GET` / `POST` 这种，统一大写；每次调用可以用 `options.method` 覆盖，默认 `GET`。
- 规范路径：取 URL 的 pathname（空的就是 `/`），**先整体解一次百分号转义、再按 `/` 分段重编码**，
  所以 `/a%20b` 和 `/a b` 出来一样；每段的编码口径是 RFC3986（`A-Za-z0-9-._~` 之外全编成大写 `%XX`）。
- 规范查询串：键和值都按 RFC3986 编码，空值写成 `key=`，然后**按键、再按值**的编码结果升序排，
  用 `&` 连接。查询串按 URL 解析，`+` 当空格。
- 过期时间是整数秒：`e = floor((now + ttlMs) / 1000)`。
- 签名 = `HMAC-SHA256(secret, 素材)` 的十六进制**前 16 位**。

### sign

`sign(url, { method?, ttlMs? })` 返回带上 `e`（过期时间）和 `s`（签名）的完整 URL 字符串：

1. url 必须是完整的 http/https 地址，否则报 `ERR_BAD_LINK`。
2. 先把 URL 上原有的 `e`、`s` 参数删掉（重复签不会越积越多），再把新算出来的 `e` 挂上去。
3. 按上面的素材算签名，把 `s` 挂上去，返回 `url.toString()`；原来的其他参数照旧保留。

### verify

`verify(url, { method? })` 按顺序检查，返回 `{ expiresAt }`（毫秒）：

1. url 要能解析成 http/https 地址，否则 `ERR_BAD_LINK`。
2. 缺 `e` 或 `s`、或者 `e` 不是纯整数秒，报 `ERR_BAD_LINK`。
3. `now >= e × 1000` 就报 `ERR_EXPIRED`（**正好到点那一刻算过期**）。
4. 重算签名并按字节比较（不要用 `===` 短路），对不上报 `ERR_SIGNATURE`。

`s` 自己不参与签名素材——算之前先从查询串里摘掉。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | 配置缺项或类型不对、`clock` 没返回时间、`ttlMs` 不是正整数 |
| `ERR_BAD_LINK` | url 不是完整 http/https 地址、缺 `e` 或 `s`、`e` 不是整数秒 |
| `ERR_EXPIRED` | 当前时间到了或过了过期时间 |
| `ERR_SIGNATURE` | 重算出来的签名和链接上的不一样 |

## API

```js
import { createLinkSigner, PARAMS, DEFAULTS } from './lib/link.js';

const signer = createLinkSigner({ secret: 's3cret', ttlMs: 300000, clock: () => Date.now() });

signer.sign('https://files.example.com/report.csv?download=1');
// -> 'https://files.example.com/report.csv?download=1&e=1767225900&s=404d35cd0f5f880a'

signer.verify(signedUrl);   // -> { expiresAt: 1767225900000 }
signer.now();               // -> 毫秒时间戳
```

出错一律抛 `LinkError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的时间和链接都是写死的，输出每一行都能对上：

```
linkguard demo
[1] 给一份报告签一条下载链接
    路径 /report/2026 q1.csv
    签名 404d35cd0f5f880a 过期 1767225900
[2] 参数顺序和空格写法换一下，签名不变
    true
[3] 改一个参数就验不过
    ERR_SIGNATURE
[4] 五分钟之后链接过期
    299 秒时 1767225900000
    300 秒时 ERR_EXPIRED
[5] 把签名参数删掉就是坏链接
    ERR_BAD_LINK
```
