# invoicer

订阅制产品的计费：按自然月把租用期和价格切成小段，每段按天摊钱、先舍入再相加；
价格改了要能倒查到已经出过的账单，把该补的补上、该退的退掉。
只用 Node 标准库，没有第三方包，`node >= 20`。

```
invoicer/
├── lib/
│   ├── invoicer.js   createInvoicer 本体                  ← 还没实现
│   └── errors.js     InvoiceError 与全部错误码
├── test/             billing / lifecycle 两组用例
├── scripts/demo.mjs  手工过一遍的演示脚本
└── package.json      npm test / npm run demo
```

```
npm test        # 12 条用例
npm run demo    # 打印下面那段固定输出
```

## 口径

### 时间与金额

- 时间一律是毫秒时间戳，自然月按 **UTC** 算（`2026-02` 是 28 天，`2028-02` 是 29 天）。
- 金额单位是**整数分**，**每条账单行先四舍五入到分，再求和**；`monthlyPrice` 必须是
  不小于 0 的整数。

### 套餐与价格段

`createInvoicer({ clock, plans })`：`plans` 是 `{ 套餐名: [{ from, monthlyPrice }, ...] }`，
`from` 是这段价格**生效的时刻（含）**，段之间不用连续。

某时刻的价格 = "`from <= 该时刻` 的最后一个价格段"；如果一个都没有 → `ERR_NO_PRICE`。

### 订阅

`subscribe({ id, planId, startAt, endAt })`：`endAt` 不给就是不限期；`endAt <= startAt` 不合法；
同一个 `id` 不能用两次。

### 出账

`invoice({ subscriptionId, periodStart, periodEnd })` → 账单：

```js
{ id: 'inv-1', subscriptionId, planId, periodStart, periodEnd,
  status: 'issued', total, previousTotal: null, lines: [{ from, to, monthlyPrice, amount }], adjustments: [] }
```

- 区间必须**完全落在租用期里**，否则 `ERR_OUT_OF_PERIOD`；
- 同一个订阅里，**完全相同的区间**再出一次 → `ERR_ALREADY_INVOICED`，
  和已有账单**部分重叠** → `ERR_OVERLAP`；
- 切法：先把区间按**自然月边界**切，再按**落在区间内的价格段边界**切，剩下的每个小块算一行，
  金额是 `round(monthlyPrice * 这一块的毫秒数 / 所在自然月的毫秒数)`。

### 追溯改价

`setPrice({ planId, from, monthlyPrice })`：插入（或覆盖同一个 `from` 的）一个价格段。
改完之后会把**这个套餐所有账单**按当前价格重算一遍：

- 重算金额和账单现在的 `total` 不一样 → 账单变 `status: 'stale'`，
  返回的 `stale` 里列出它的 id（下次 `rebill` 才能动它）；
- 已经 stale 的账单重算回来跟 `total` 一样（比如价格改回去了）→ 恢复成原来的状态，
  记在返回的 `restored` 里。

返回 `{ planId, from, monthlyPrice, stale, restored }`。

### 重算与调账

`rebill({ invoiceId })`：只有 `status === 'stale'` 的账单能重算（否则 `ERR_NOT_STALE`）：

- 按当前价格重新算 `lines` 和 `total`，原来的金额挪到 `previousTotal`，`status` 变 `'rebilled'`；
- 差额 `delta = 新 total - 旧 total`：大于 0 出一条 `charge`（补收），小于 0 出一条 `refund`（退款，
  `amount` 取正），等于 0 就没有调账；
- 返回 `{ invoiceId, delta, previousTotal, total, adjustments }`，`adjustments` 是
  `[{ id, kind: 'charge' | 'refund', amount }]`；调账会累计在 `stats()` 的 `charged` / `refunded` 里。

### 账号汇总

`statement({ subscriptionId, from, to })` → `{ subscriptionId, charges, refunds, net, invoiceIds }`：
取 `periodStart` 落在 `[from, to)` 里的账单，`charges` 是这些账单**当前** `total` 之和
（重算过就用新值），`refunds` 是它们产生过的退款之和，`net = charges - refunds`。

`listInvoices({ subscriptionId, status })` 可以按订阅、按状态过滤（都不给就是全部）。

### 统计

`stats()` → `{ plans, subscriptions, invoices, stale, rebilled, charged, refunded }`：
`invoices` 是出过的账单总数，`charged` / `refunded` 是调账累计金额。

### 错误码

| 错误码 | 什么时候 |
|---|---|
| `ERR_BAD_CONFIG` | 配置/套餐定义不合法：`plans` 不是对象、价格段缺字段、`monthlyPrice` 不是非负整数、`clock` 不是函数 |
| `ERR_BAD_PRICE` | `setPrice` 的参数不合法 |
| `ERR_UNKNOWN_PLAN` | 套餐没见过 |
| `ERR_UNKNOWN_SUBSCRIPTION` | 订阅没见过 |
| `ERR_DUPLICATE_SUBSCRIPTION` | 订阅 id 用过了 |
| `ERR_BAD_PERIOD` | 时间区间不合法（不是有限毫秒、`from > to`、`periodEnd <= periodStart`、`endAt` 不合法） |
| `ERR_OUT_OF_PERIOD` | 出账区间超出租用期 |
| `ERR_OVERLAP` | 与已有账单区间部分重叠 |
| `ERR_ALREADY_INVOICED` | 同一段已经出过账 |
| `ERR_NO_PRICE` | 那个时刻还没有生效的价格 |
| `ERR_UNKNOWN_INVOICE` | 账单没见过 |
| `ERR_NOT_STALE` | 不是待重算的账单却去 `rebill` |

## API

```js
import { createInvoicer, DEFAULTS } from './lib/invoicer.js';

const invoicer = createInvoicer({
  clock: () => Date.now(),
  plans: { basic: [{ from: 0, monthlyPrice: 2900 }] },
});

invoicer.subscribe({ id: 's1', planId: 'basic', startAt: Date.parse('2026-01-01T00:00:00Z') });
const invoice = invoicer.invoice({
  subscriptionId: 's1',
  periodStart: Date.parse('2026-01-01T00:00:00Z'),
  periodEnd: Date.parse('2026-03-01T00:00:00Z'),
});
invoice.total;                       // -> 5800（两个整月）

invoicer.setPrice({ planId: 'basic', from: Date.parse('2026-02-10T00:00:00Z'), monthlyPrice: 9900 });
invoicer.listInvoices({ status: 'stale' });
invoicer.rebill({ invoiceId: invoice.id });   // -> { delta, previousTotal, total, adjustments }
invoicer.statement({ subscriptionId: 's1', from, to });
invoicer.stats();
```

出错一律抛 `InvoiceError`（`lib/errors.js`），按 `code` 分流。

## demo 跑出来应该长这样

`npm run demo` 里时间是写死的，输出每一行都能对上：

```
invoicer demo
[1] 出两个月：按自然月切片
    2026-01-01:2900 2026-02-01:2900 合计 5800
[2] 月中出账按月长摊
    3/16 截止 1403 分（15/31 个月）
[3] 追溯把 2 月 10 号起的价格改成 99 元
    待重算 inv-1,inv-2
[4] rebill 把差额补收回来
    inv-1 5800 -> 10550（2900+932+6718），charge 4750
[5] 账号汇总
    {"subscriptionId":"s1","charges":11953,"refunds":0,"net":11953,"invoiceIds":["inv-1","inv-2"]}
[6] 统计
    {"plans":1,"subscriptions":1,"invoices":2,"stale":1,"rebilled":1,"charged":4750,"refunded":0}
```
