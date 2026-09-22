# flagroll

灰度规则求值：按顺序找到第一条命中的规则，用 `salt + 规则 + 用户` 稳定分桶，决定这个人进不进灰度、进哪个变体。
只用 Node 标准库，没有第三方包，`node >= 20`。

```
flagroll/
├── lib/
│   ├── roll.js      createRoller 本体                        ← 还没实现
│   ├── hash.js      32 位 FNV-1a 分桶哈希
│   └── errors.js    RolloutError 与全部错误码
├── test/            roll / rules 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 12 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 配置

`createRoller({ salt })`：`salt` 是非空字符串（默认 `'v1'`），不合法报 `ERR_BAD_CONFIG`；
`salt()` 能把当前的值读出来。**换 salt 等于重新洗牌**，同一个人的桶号会变。

### 规则长这样

```js
{
  id: 'pro-rollout',                  // 非空字符串，同一批规则里不能重复
  when: { plan: 'pro', country: ['cn', 'sg'] },   // 不给或者给 {} 就是全匹配
  percent: 40,                        // 0 ~ 100 的整数，默认 100
  variants: [                          // 可选
    { name: 'new-ui', percent: 20 },
    { name: 'old-ui', percent: 20 },
  ],
}
```

- `when` 里每个字段都要和用户对上：期望值是数组时表示"在名单里"，否则要求**严格相等**
  （允许 `null` / 布尔这种原始值）；用户没有这个字段就是不匹配。
- `percent` 管的是"这条规则的人里放多少进灰度"；`variants` 是在**已经进灰度的这一段**里
  按顺序累加百分比来切，切不到就是 `null`。
- 规则写错（不是数组、缺 `id`、`id` 重复、`percent` 越界或者不是整数、`when` 不是对象、
  数组值是空的、`when` 里塞了对象、`variants` 是空数组 / 变体名重复 / 变体 percent 不是
  非负整数）一律报 `ERR_BAD_RULES`。

### roll

`roll(rules, user)` 返回 `{ enabled, variant, rule, bucket }`：

1. `user` 必须是对象且 `id` 是非空字符串，否则报 `ERR_BAD_USER`。
2. rules 从上往下找第一条 `when` 全匹配的规则；**一条都不匹配**就返回
   `{ enabled: false, variant: null, rule: null, bucket: null }`。
3. 分桶：`bucket = hash32(`${salt}:${ruleId}:${user.id}`) % 100`，落在 `0 ~ 99`。
   哈希只用 `lib/hash.js` 那个，保证换进程、换机器结果都一样。
4. `bucket < percent` 就是 `enabled: true`，否则 `enabled: false`——
   **两种情况下都会把命中的 `rule` 和 `bucket` 带出来**，方便排查"为什么这个人没进来"。
5. 进灰度之后如果有 `variants`，按累加百分比找这个 bucket 属于哪个变体；都对不上就是 `null`。
   没给 `variants` 的规则，`variant` 就是 `null`。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | `salt` 不是非空字符串、配置不是对象 |
| `ERR_BAD_RULES` | rules 不是数组，或者某条规则/变体的字段不合法 |
| `ERR_BAD_USER` | user 不是对象，或者 `id` 不是非空字符串 |

## API

```js
import { createRoller, DEFAULTS } from './lib/roll.js';
import { hash32, BUCKETS } from './lib/hash.js';

const roller = createRoller({ salt: 'v1' });
const rules = [
  { id: 'staff', when: { role: 'staff' } },
  { id: 'pro-rollout', when: { plan: 'pro' }, percent: 40, variants: [{ name: 'new-ui', percent: 20 }] },
  { id: 'default-on' },
];

roller.roll(rules, { id: 'u-1002', plan: 'pro' });
// -> { enabled: true, variant: 'new-ui', rule: 'pro-rollout', bucket: 14 }
roller.roll(rules, { id: 'u-1004', plan: 'free' });
// -> { enabled: true, variant: null, rule: 'default-on', bucket: 86 }
roller.salt();   // -> 'v1'
```

出错一律抛 `RolloutError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的用户和 salt 都是写死的，输出每一行都能对上：

```
flagroll demo
[1] 不同的人命中不同的规则
    u-1001: rule=pro-rollout bucket=95 enabled=false variant=null
    u-1002: rule=pro-rollout bucket=14 enabled=true variant=new-ui
    u-1003: rule=staff bucket=70 enabled=true variant=null
    u-1004: rule=default-on bucket=86 enabled=true variant=null
[2] 同一个人每次问结果都一样
    rule=pro-rollout bucket=95 enabled=false variant=null
    rule=pro-rollout bucket=95 enabled=false variant=null
[3] percent 给 0：规则命中，但人没进灰度
    pro-rollout 那条：rule=pro-rollout bucket=95 enabled=false variant=null
    no-roll 那条：rule=no-roll bucket=66 enabled=false variant=null
[4] 200 个人按变体分布
    new-ui=40
    not-enabled=119
    old-ui=41
[5] 换一个 salt，桶号就变了
    demo: rule=pro-rollout bucket=95 enabled=false variant=null
    demo-v2: rule=pro-rollout bucket=6 enabled=true variant=new-ui
```
