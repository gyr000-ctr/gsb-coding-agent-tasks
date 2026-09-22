# fieldcheck

轻量 JSON 校验：类型、必填、长度/范围、枚举、数组元素、多余字段，错的地方给出可以定位的路径。
只用 Node 标准库，没有第三方包，`node >= 20`。

```
fieldcheck/
├── lib/
│   ├── check.js     validate 本体                            ← 还没实现
│   └── errors.js    SchemaError 与错误码
├── test/            check / schema 两组用例
├── scripts/demo.mjs 手工过一遍的演示脚本
└── package.json     npm test / npm run demo
```

```
npm test        # 12 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### API 形状

`validate(schema, value)` 返回 `{ valid, errors }`：

- `errors` 里每条是 `{ path, code, message }`，`valid` 就是"一条错都没有"。
- **值不合法不抛异常**，只有 schema 自己写错才抛 `ERR_BAD_SCHEMA`。
- 路径：根是空字符串 `''`，对象字段 `a.b`，数组元素 `list[0]`，套起来就是 `list[0].id`。

### schema 支持的关键字

```js
{
  type: 'object',                    // 必填：object / array / string / number / integer / boolean / any
  required: ['name'],                // 只对 object 有效
  properties: { name: { type: 'string' } },
  additionalProperties: false,       // false 表示 properties 之外的字段都算多出来
  enum: ['free', 'pro'],             // 严格相等（1 和 '1' 不是一回事）
  minLength: 2, maxLength: 8,        // 只对字符串
  minimum: 0, maximum: 150,          // 只对数字，含边界
  items: { type: 'string' },         // 只对数组
}
```

- `any` 只看别的关键字（`enum` / 长度 / 范围），不限制类型。
- `integer` 与 `number` 分得开：`1.5` 过不了 `integer`。
- schema 树**整棵先检查一遍**（哪怕值里没有那个字段），所以嵌套的 schema 写错也一定被发现。

### 检查顺序

1. 先看 `type`：不匹配就只报一条 `type`，**不再往下钻**（不对的东西没有"字段"可查）。
2. 再看 `enum`，然后是字符串的 `minLength` / `maxLength`、数字的 `minimum` / `maximum`。
3. `object`：先按 `required` 的顺序报缺字段，再按 `properties` 里定义的顺序逐个查，
   最后（`additionalProperties: false` 时）按值里出现的顺序报多出来的字段。
4. `array`：按索引从 0 开始查 `items`。

### errors 里的 code

只用这八种：`required` / `type` / `enum` / `minLength` / `maxLength` / `minimum` / `maximum` / `unexpected`。

### schema 不合法就抛 ERR_BAD_SCHEMA

这些都要抛（`details.path` 指出是哪个 schema 节点，根节点是空字符串）：

- schema 不是对象、`type` 缺失或者不认识；
- `required` 不是非空字符串组成的数组、`properties` 不是对象、`items` 不是对象、
  `additionalProperties` 不是布尔；
- `enum` 是空数组、`minLength` / `maxLength` / `minimum` / `maximum` 不是数字。

## API

```js
import { validate, TYPES, ERROR_CODES } from './lib/check.js';

validate(
  { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 2 } } },
  { name: 'a' },
);
// -> { valid: false, errors: [{ path: 'name', code: 'minLength', message: '长度不能小于 2' }] }
```

出错（schema 写错）一律抛 `SchemaError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里的 schema 和数据都是写死的，输出每一行都能对上：

```
fieldcheck demo
[1] 一份合法的数据
    valid
[2] 缺字段和类型不对
    name:required age:type
[3] 数组里第几个元素错了
    items[1].id:type
[4] 范围和枚举都卡边界
    age:minimum plan:enum
[5] 多出来的字段
    extra:unexpected other:unexpected
[6] schema 自己写错就抛异常
    ERR_BAD_SCHEMA path=age
```
