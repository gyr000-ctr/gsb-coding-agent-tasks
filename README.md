# jwksguard

JWT 校验：JWKS 多密钥轮换、算法白名单、声称者/受众校验、时钟偏移与最大签龄。
只用 Node 标准库，没有第三方包，`node >= 20`。

```
jwksguard/
├── lib/
│   ├── verifier.js  createVerifier 本体                      ← 还没实现
│   ├── jose.js      base64url、JWK 导入、RS*/ES* 验签
│   └── errors.js    JwtError 与全部错误码
├── test/            token / claims 两组用例（helpers.js 里现生成 RSA/EC 密钥）
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 15 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 配置

`createVerifier({ issuer, audience, algorithms?, jwks, clock?, clockSkewMs?, maxTokenAgeMs?, requiredClaims? })`

- `issuer` 非空字符串、`audience` 是非空字符串或字符串数组，缺一个报 `ERR_BAD_CONFIG`。
- `algorithms` 默认 `['RS256']`，只能出现 `jose.js` 支持的那几种（`RS256/384/512`、`ES256/384/512`），
  去重后一个都不剩报 `ERR_BAD_CONFIG`；**`none` 和 `HS*` 永远不在白名单里**。
- `clockSkewMs` 默认 0（非负数），`maxTokenAgeMs` 可选（非负数）。
- `requiredClaims` 默认 `['exp']`，里头每个声明都必须存在且不是 `null`。
- `jwks` 是数组或者 `{ keys: [...] }`，不能是空的；每把钥匙要有非空 `kid`，`kid` 不能重复，
  必须能用 `importPublicKey` 导进来；`alg` 给了就得是字符串。这些不合法分别报
  `ERR_BAD_CONFIG` / `ERR_BAD_JWK`。

### 校验顺序

`verify(token)` 一步步来，**先过前面的才看后面的**：

1. token 是非空字符串、正好三段、每段都能 base64url 解码并解析成对象 → 不然 `ERR_MALFORMED`。
2. `header.alg` 是非空字符串、在白名单里 → 不然 `ERR_UNSUPPORTED_ALG`。
3. `header.kid` 非空 → 不然 `ERR_KID_MISSING`；能在当前 keys 里找到 → 不然 `ERR_KID_UNKNOWN`；
   钥匙上写了 `alg` 就必须和 token 一致 → 不然 `ERR_UNSUPPORTED_ALG`。
4. 用这把钥匙验签名（`RS*` / `ES*`，EC 签名按 `ieee-p1363` 比）→ 不对就 `ERR_SIGNATURE`。
5. 检查声明（见下）。**签名没过就不看声明**，反之亦然。

返回值是 `{ header, claims, kid, alg, expiresAt, issuedAt }`，后两个是**毫秒**时间戳
（`exp` / `iat` 本身还是秒），没这两个声明就是 `null`。

`rotate(jwks)` 直接换掉整套钥匙（旧的 `kid` 立刻变 `ERR_KID_UNKNOWN`），
`keys()` 给出当前的 `kid` 列表，`now()` 给出 clock 上的毫秒时间戳。

### 声明

时间声明 `exp` / `iat` / `nbf` 允许缺席（要不要必填由 `requiredClaims` 说了算），
给了就必须是有限数字，否则 `ERR_BAD_CLAIMS`：

- `nbf`：`now < nbf × 1000 - clockSkewMs` → `ERR_NOT_YET_VALID`。
- `iat`：比现在还晚（超出偏移）→ `ERR_BAD_CLAIMS`；配了 `maxTokenAgeMs` 且
  `now - iat × 1000 > maxTokenAgeMs + clockSkewMs` → `ERR_TOKEN_TOO_OLD`。
- `exp`：`now > exp × 1000 + clockSkewMs` → `ERR_EXPIRED`（正好落在偏移边界上算有效）。
- `iss` 必须严格等于配置的 issuer → `ERR_BAD_ISSUER`。
- `aud` 是字符串或字符串数组（别的类型直接 `ERR_BAD_AUDIENCE`），
  和配置的 audience 至少有一个交集 → 没交集或没这个声明就 `ERR_BAD_AUDIENCE`。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | 配置缺项或类型不对、`clock` 不合法、`jwks` 为空或形状不对 |
| `ERR_BAD_JWK` | 钥匙不是对象、没有 `kid`、`kid` 重复、`alg` 不是字符串、导不出公钥 |
| `ERR_MALFORMED` | token 不是字符串、不是三段、某段解不开或不是对象 |
| `ERR_UNSUPPORTED_ALG` | 没有 `alg`、不在白名单、`none` / `HS*`、钥匙的 `alg` 和 token 不一致 |
| `ERR_KID_MISSING` | header 里没有 `kid` |
| `ERR_KID_UNKNOWN` | 当前 keys 里找不到这个 `kid`（包括轮换之后） |
| `ERR_SIGNATURE` | 签名验不过 |
| `ERR_EXPIRED` | `exp` 超出偏移已经过期 |
| `ERR_NOT_YET_VALID` | `nbf` 还没到 |
| `ERR_TOKEN_TOO_OLD` | `iat` 距现在超过 `maxTokenAgeMs` |
| `ERR_BAD_ISSUER` | `iss` 对不上 |
| `ERR_BAD_AUDIENCE` | `aud` 类型不对、缺失或交集为空 |
| `ERR_BAD_CLAIMS` | `requiredClaims` 缺项、时间声明不是数字、`iat` 比现在还晚 |

## API

```js
import { createVerifier, DEFAULTS } from './lib/verifier.js';

const verifier = createVerifier({
  issuer: 'https://auth.example.com',
  audience: ['api', 'web'],
  algorithms: ['RS256'],
  jwks: [{ kty: 'RSA', kid: 'k1', alg: 'RS256', n: '...', e: 'AQAB' }],
  clock: () => Date.now(),
  clockSkewMs: 30000,
});

verifier.verify(token);        // -> { header, claims, kid, alg, expiresAt, issuedAt }
verifier.rotate(nextJwks);     // 换一整套钥匙
verifier.keys();               // -> ['k1', ...]
verifier.algorithms();         // -> ['RS256']
verifier.now();                // -> 毫秒时间戳
```

出错一律抛 `JwtError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 用的密钥是现场生成的，但打印出来的都是固定字段，每一行都能对上：

```
jwksguard demo
[1] 一个正常的 RS256 token
    sub=user-42 kid=demo-1 alg=RS256 expiresAt=1767229200000
[2] 过期边界：偏移 30 秒之内还认，之外就拒
    90 秒后（正好差 30 秒）：demo-1
    再多 1 毫秒：ERR_EXPIRED
[3] 受众不对、算法不对、签名不对分别报什么
    aud=mobile：ERR_BAD_AUDIENCE
    alg=HS256：ERR_UNSUPPORTED_ALG
    改了 payload：ERR_SIGNATURE
[4] 轮换钥匙之后旧的 kid 就不认了
    现在挂着 demo-2
    旧 kid：ERR_KID_UNKNOWN
```
