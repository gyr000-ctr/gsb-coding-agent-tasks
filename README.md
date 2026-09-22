# sigv4

给自家网关和对象存储用的 SigV4 风格请求签名：把请求按固定口径规范化、派生出签名密钥、
签出 `Authorization`，也能验别人递过来的签名和预签名 URL。只用 Node 标准库，
没有第三方包，`node >= 20`。

```
sigv4/
├── lib/
│   ├── signer.js    createSigner 本体                        ← 还没实现
│   ├── encode.js    RFC3986 百分号编码、sha256、hmac、安全比较
│   └── errors.js    SignError 与全部错误码
├── test/            canonical / sign / presign 三组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 30 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 凭证与时钟

- `createSigner({ region, service, accessKeyId, secretAccessKey, clock })`：前四个都是非空字符串，
  少一个报 `ERR_BAD_CONFIG`。`clock` 不给就用系统时间，**测试和 demo 都靠它注入固定时刻**。
- 签名时间一律由 `clock` 现算，格式是 UTC 的 `YYYYMMDDTHHMMSSZ`（例如 `20150830T123600Z`），
  写进 `x-amz-date`；调用方自己传的 `x-amz-date` 会被顶掉，免得两边时间不一致。
- 凭证作用域（scope）固定写成 `<签名日期>/<region>/<service>/aws4_request`。

### 规范 URI

- 取 URL 的 pathname（空的就是 `/`），**先整体解一次百分号转义、再按 `/` 分段重编码**，
  所以 `/a%20b` 和 `/a b` 出来都是 `/a%20b`，不会编两遍；解不开的百分号按原样待着。
- 每段的编码口径是 RFC3986：`A-Za-z0-9-._~` 之外全编成大写十六进制 `%XX`，中文按 UTF-8 字节编。

### 规范查询串

- 键和值都按 RFC3986 编码，空值写成 `key=`，然后**按键、再按值**的编码结果升序排，用 `&` 接起来。
- 查询串按 URL 解析：`+` 当空格处理，所以值里真的要加号得写 `%2B`。
- 预签名的规范化会**把 `X-Amz-Signature` 自己排除掉**，其余 `X-Amz-*` 参数照常参与。

### 规范头部

- 头部名统一小写；值先去掉首尾空白，再把中间连续的空白压成一个空格；同名头（大小写不同）
  按出现顺序用 `,` 连成一行。值里还夹着换行直接报 `ERR_BAD_REQUEST`。
- 下面这批头**永不参与签名**：`authorization`、`connection`、`content-length`、`expect`、
  `proxy-authorization`、`transfer-encoding`、`user-agent`、`x-amzn-trace-id`；
  调用方还能用 `unsignedHeaders` 再加几个。
- `host` 一定要签：请求头里没有就按 URL 的 host 补（默认端口会被 URL 去掉，非默认端口留着）。
- 参与签名的头按名字升序排，写成 `name:value\n` 一串，签名头列表用 `;` 连接。

### 规范请求与签名

规范请求是六段，用 `\n` 连接：

```
<METHOD>\n<规范URI>\n<规范查询串>\n<每个头部 name:value 各一行，末尾有 \n>\n<签名头列表>\n<载荷摘要>
```

- 方法统一大写；载荷摘要是 body 的 sha256 十六进制（没有 body 就是空串的摘要），
  但如果请求头里给了 `x-amz-content-sha256` 就**用调用方给的那个**（可以写 `UNSIGNED-PAYLOAD`），
  签名器自己不会替你加这个头。
- 待签字符串是 `AWS4-HMAC-SHA256\n<签名时间>\n<scope>\n<规范请求的 sha256>`。
- 签名密钥用 HMAC 链派生：`AWS4<secret>` → 日期 → region → service → `aws4_request`。
- `Authorization` 固定长这样：
  `AWS4-HMAC-SHA256 Credential=<accessKeyId>/<scope>, SignedHeaders=<签名头列表>, Signature=<64 位十六进制>`

### 校验

- 请求头里有 `authorization`，或者 URL 上带预签名参数，二选一；**两个一起给报 `ERR_BAD_AUTHZ`**，
  一个都没有也报 `ERR_BAD_AUTHZ`。
- 头签名这条路：凭证里的 access key、region、service 都要和签名器一致（不然 `ERR_BAD_AUTHZ`）；
  签名头里必须同时有 `host` 和 `x-amz-date`；`x-amz-date` 格式不对报 `ERR_BAD_REQUEST`；
  和当前时间差超过 `skewMs`（默认 5 分钟）报 `ERR_CLOCK_SKEW`。
- 请求里带了 `x-amz-content-sha256` 且不是 `UNSIGNED-PAYLOAD` 时，先拿 body 复核这个摘要，
  对不上报 `ERR_BAD_PAYLOAD_HASH`。
- 签名对不上统一报 `ERR_SIGNATURE_MISMATCH`（十六进制按字节比，不要用 `===` 短路）。

### 预签名

`presign(url, { method = 'GET', expiresIn = 900, headers })` 把参数挂到 URL 上再签，
返回完整 URL，签名参数依次是 `X-Amz-Algorithm`、`X-Amz-Credential`、`X-Amz-Date`、
`X-Amz-Expires`、`X-Amz-SignedHeaders`、`X-Amz-Signature`。

- `expiresIn` 得是 `1 ~ 604800` 的整数秒，否则报 `ERR_BAD_EXPIRES`（校验时 `X-Amz-Expires`
  不是纯数字也一样）。
- 载荷摘要固定按 `UNSIGNED-PAYLOAD` 算；`X-Amz-SignedHeaders` 至少是 `host`，
  `headers` 里额外给的头会被规范化后一起签进去，校验时得原样带上，缺一个报 `ERR_BAD_AUTHZ`。
- 预签名**只按 `X-Amz-Expires` 判过期**（`现在 > 签名时间 + 有效期` 报 `ERR_EXPIRED`），
  不再叠加 5 分钟那个时间偏移限制。
- 原来的查询参数保留并参与签名，所以签完再往 URL 上挂东西就验不过了。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | 配置缺项、`clock` 不是函数、`skewMs` 不是非负数 |
| `ERR_BAD_REQUEST` | 请求不是对象、method / url / body 不合规、头部值里有换行、时间戳格式不对 |
| `ERR_BAD_AUTHZ` | 没签名或签名方式冲突、凭证/签名头不合法、签名头缺项、access key 或 scope 对不上 |
| `ERR_BAD_EXPIRES` | `expiresIn` 或 `X-Amz-Expires` 不是 `1 ~ 604800` 的整数秒 |
| `ERR_CLOCK_SKEW` | 头签名的 `x-amz-date` 和当前时间差超过 `skewMs` |
| `ERR_SIGNATURE_MISMATCH` | 重算出来的签名和请求里的不一样 |
| `ERR_EXPIRED` | 预签名过了有效期 |
| `ERR_BAD_PAYLOAD_HASH` | body 和请求里 `x-amz-content-sha256` 对不上 |

## API

```js
import { createSigner, SKIP_HEADERS, DEFAULTS } from './lib/signer.js';

const signer = createSigner({
  region: 'us-east-1',
  service: 'service',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  clock: () => new Date('2015-08-30T12:36:00Z'),
});

signer.sign({ method: 'GET', url: 'https://example.amazonaws.com/x', headers, body });
// -> { method, url, headers, authorization, signedHeaders, signature, dateTime, scope,
//      payloadHash, canonicalRequest, stringToSign }

signer.canonical({ method: 'POST', url, headers, body }, { unsignedHeaders: ['x-trace'] });
// -> { method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash, text }

signer.verify({ method: 'GET', url, headers, body }, { skewMs: 300000 });
// -> { accessKeyId, scope, dateTime, signedHeaders, signature, payloadHash }

signer.presign('https://example.amazonaws.com/report.csv?format=csv', { expiresIn: 300 });
// -> 'https://example.amazonaws.com/report.csv?...&X-Amz-Signature=...'
```

出错一律抛 `SignError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的凭证、请求和时钟都是写死的，输出每一行都能对上：

```
sigv4 demo
[1] 官方 get-vanilla 向量
    signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31
    签进去的头 host,x-amz-date
[2] 大小写、多空格、多出来的查询参数都按同一套口径摆平
    请求行 POST | /Items | a=&a=1&b=2
    头部 content-type:application/json ; charset=utf-8
    载荷摘要 037c9214eef74cc3887f3a4f085b4e17d76280dafd273b0ee160c09c4ba1cfd4
[3] 同一个请求签两次一模一样
    true 81a0aebbafcf61ec008ac54fd7f99b6bf369b3a709aada6e740b8383d66e43ba
[4] 改一个字节，验证直接报错
    ERR_SIGNATURE_MISMATCH
[5] 时钟偏了十分钟
    ERR_CLOCK_SKEW
[6] 预签名 URL 也有期限
    签了 host 有效期 300 秒
    签名 28ab7bdd166c07b5...
    五分钟后 ERR_EXPIRED
```
