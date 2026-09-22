# configmerge

分层配置合并：默认值 / 环境 / 用户三层按优先级深合并，数组整体覆盖、`null` 清空、
`undefined` 跳过，字符串里的 `${VAR}` 用环境变量补，顺便记下每个值是谁给的。
只用 Node 标准库，没有第三方包，`node >= 20`。

```
configmerge/
├── lib/
│   ├── config.js    mergeConfig 本体                         ← 还没实现
│   └── errors.js    ConfigError 与全部错误码
├── test/            merge / env 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 14 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 输入

`mergeConfig(layers, { env })`：

- `layers` 是数组，**从低优先级到高优先级**，每项是 `{ name, values }`：
  `name` 是非空字符串（同一批里不能重复），`values` 是普通对象（空对象也行）。
- `env` 是普通对象，默认 `{}`；`options` 不是对象、`env` 不是对象报 `ERR_BAD_CONFIG`；
  layers 不是数组、某一层不是对象、`name` 空或重复、`values` 不是对象报 `ERR_BAD_LAYER`。

### 合并规则

| 情况 | 结果 |
|---|---|
| 两边都是普通对象 | 递归往下合，**没被覆盖的兄弟键留着** |
| 其它任何情况（含数组、标量、`null`） | 右边整体盖掉左边，**数组不拼接** |
| 右边的值是 `undefined` | 这一层**不管**这个键，保留左边的值（新键也不会被创建） |
| 右边的值是 `null` | 显式清空 |
| 右边的值是空对象 `{}` | 不是清空，只是没有新东西，旧值还在 |

- 返回的 `values` 是**深拷贝**：改返回值不会影响传进来的 `layers`。

### 环境变量插值

- 合并完成之后，对最终值里的**字符串**做一次替换：`${VAR}` 用 `env[VAR]`，
  `${VAR:-默认}` 在 `env[VAR]` 缺失**或者为空串**时用默认值。
- `${VAR}` 缺失又没有默认值 → 抛 `ERR_MISSING_ENV`（`details.name` 是变量名）。
- 环境变量的值会按字符串贴进去，所以 `${PORT:-9000}` 的结果是 `'9000'` 而不是数字。
- **只替换一轮**：替换进去的内容不会再被扫一遍；不是 `${名字}` 形式的 `$` 原样留着。
- 数组里的字符串同样会被替换。

### 来源

`sources` 记录每个叶子最后是谁写的：键是路径（对象用 `.` 连接，数组当成一个叶子），
值是层名。某个键被后面的层整体覆盖（比如从对象变成 `null`）时，它下面的旧记录会被清掉。
`sources` 的键顺序不保证，按路径查就行。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `options` / `env` 不是普通对象 |
| `ERR_BAD_LAYER` | `layers` 不是数组、层不是 `{ name, values }`、层名空或重复、`values` 不是对象、值里有深拷贝不了的东西 |
| `ERR_MISSING_ENV` | 有 `${VAR}` 但 `env` 里没有这个变量，且没写默认值 |

## API

```js
import { mergeConfig } from './lib/config.js';

const { values, sources } = mergeConfig(
  [
    { name: 'defaults', values: { port: 8080, db: { host: 'localhost' } } },
    { name: 'env', values: { port: '${PORT:-9000}', db: { host: '${DB_HOST:-db.local}' } } },
    { name: 'user', values: { db: { host: 'db.internal' }, debug: true } },
  ],
  { env: {} },
);

values;   // -> { port: '9000', db: { host: 'db.internal' }, debug: true }
sources;  // -> { port: 'env', 'db.host': 'user', debug: 'user' }
```

出错一律抛 `ConfigError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的层和环境变量都是写死的，输出每一行都能对上：

```
configmerge demo
[1] 三层合出来的配置
    {"service":null,"port":"9000","db":{"host":"db.local","pool":{"size":16,"timeoutMs":1000}},"hosts":["db-1","db-2"],"debug":true,"extra":"x"}
[2] 每个值是谁给的
    db.host <- env
    db.pool.size <- user
    db.pool.timeoutMs <- defaults
    debug <- user
    extra <- user
    hosts <- env
    port <- env
    service <- user
[3] 环境变量能兜住缺省值
    url=https://api.example.com/v1 token=none pool=12
[4] 忘了给环境变量
    ERR_MISSING_ENV name=MISSING_HOST
[5] null 是清空，undefined 是没这回事
    service=null debug=true hosts=["db-1","db-2"]
```
