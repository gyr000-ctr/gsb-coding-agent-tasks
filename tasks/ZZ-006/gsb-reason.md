# ZZ-006 GSB 理由（结论：B 更好）

两边的交付面完全一样：`git diff --stat zz-006/base..zz-006/a` 和 `..zz-006/b` 都只有 `src/cache.js`
一个文件，`npm test` 都是 13/13 全绿，`node bin/cachedemo.js --config configs/dev.json` 的输出和
README 里那 19 行逐字一致（200 并发只回源 1 次、回源途中失效被栅栏拦下、counters
202/0/202/3/0/1/1/0）。差别落在共享存储抖掉时的降级路径、计数器口径，以及 `invalidateTag`
遇到存储故障时的处理这三处。

## A

**过程**：模型先把目录、README、`src/` 骨架、`test/cachegate.test.js`、`test/support/`
（假时钟、假 loader、harness）、`bin/cachedemo.js`、`configs/dev.json` 一次读完，再用一次
`apply_patch` 把 `src/cache.js` 写完，然后跑 `npm test`（13/13）和演示入口对输出，收尾按
「命中判定 / 失效栅栏 / 世代只增 / 防击穿 / 锁安全」逐条汇报。整轮 8 次工具调用（7 次读文件与
跑命令 + 1 次补丁），没有失败调用，8 分 50 秒、约 17.2 万 token，只碰了 `src/cache.js`。
过程本身没毛病，问题在验证边界：`test/cachegate.test.js` 里"共享存储抖掉"那两条都是**一开始
就挂**（先 `store.setDown(true)` 再发请求），所以"已经有一次回源在飞的时候抖动"这条路径没有
被它自己的验证覆盖，下面两个产物问题就是这么漏过去的。

**产物**：主体是对的——命中判定逐个比对条目里的世代快照、失效走原子 `incr` 只增不减、回源前
先拍世代快照、回源后世代变了就丢弃写回并计 `cache_fenced_writes_total`、锁 token 用共享 `incr`
发号并按 `compareAndDel` 释放、负缓存用 `negativeTtlMs` 且能被失效、回源抛错什么都不写、回源
成功只是写缓存失败时照常返回值并计降级，这些我都单独用探针压过，和 B 等价。站不住的是降级路径：

- **fail_open 的降级把本地单飞拆掉了**：A 把"共享存储挂了就直连回源"放在 `get()` 的 catch 里
  （`src/cache.js:194-202`，落点是 `degradedLoad`，`:155-165`），而实例内的单飞 promise 是上面
  那个 `resolveMiss(...)`（`:177-192`）。抖动只要发生在"已经有一次 load 在飞"之后，等在同一个
  promise 上的调用方就会全部落进**各自的** catch、各自调一次 `degradedLoad`，一次回源被拆成
  N 次。探针一：同一个 key 三个并发 `get`，让第 2 次 `store.get`（回源前取 tag 世代快照那一步）
  挂一次、origin 每次返回不同值 —— A 打了 2 次 origin，三个调用方分别拿到 `v#0` / `v#1` /
  `v#1`；B 只打 1 次，三个调用方都拿到 `v#0`。探针二：抖动落在抢锁那一次，4 个并发 `get`
  变成 4 次 origin（B 是 1 次）。README 的口径是"同一个实例里同一个 key 的并发 get 只允许真
  回源一次，等着的那几个拿同一次结果（值或者错误都一样）"，A 在降级路径上这两条都没兜住。
  而这题的出发点就是"大 key 一被打穿、几百个请求同时回源、库当场被拖死"——共享存储抖一下正是
  最容易触发它的时刻。
- **`cache_loads_total` 记在取快照之前，会多记**：`loadAndMaybeWrite()` 第一行就
  `counters.inc('cache_loads_total')`（`src/cache.js:91`），下一行才 `readGens`（`:92`）。
  快照这步挂掉时，这次根本没打到 origin，也被算成"真回源一次"。同一条探针里 A 报
  `cache_loads_total=3`，而真实 origin 调用只有 2 次；B 是 3 对 3（另一组 1 对 1），和真实
  调用数对得上。你原话说计数器是拿来看线上卡在哪一步的，这一格多记会把排查带偏。
- 小分歧，不算硬伤：`invalidateTag` 上 A 是按 failMode 分流的（`src/cache.js:205-217`），
  fail_fast 抛 `CacheUnavailableError` 这部分符合 README 和 `errors.js`；但 fail_open 下它静默
  返回成功（只加一次 `cache_degraded_total`），而那次 `incr` 根本没执行、世代号没动，调用方会
  以为失效成功了，别的实例还在命中旧值，只能等 TTL 过去。README 没写死 invalidate 的 failMode
  行为，两种取舍都说得通，我记一笔。

## B

**过程**：读法跟 A 一致（先列目录，再 README + 全部骨架 + 用例 + support），中间多花了一次调用：
第一条 exec 把 workdir 猜成 `...\ZZ-006\B\cachegate`，被工具以
`Failed to create unified exec process: 目录名称无效。 (os error 267)` 退回，改成列上级目录后
才找到代码。之后一次 `apply_patch` 落地，`npm test` 13/13、演示输出逐行对上，收尾也说明了只动
`src/cache.js`。整轮 10 次工具调用（9 + 1 次补丁，其中 1 次失败）、7 分 48 秒、约 21.9 万 token，
调用数和 token 都比 A 多（模型推理段数 8 段 vs A 的 3 段），只是墙钟时间短一截。验证边界和 A
一样停在"给定用例 + 演示输出"，没有额外压边界。

**产物**：把降级入口放进了单飞任务里面，这是它比 A 强的地方：`startLoad()` 先把 job 包成
promise 再塞进 `inflight`（`src/cache.js:202-218`），job 内部 catch 到 `StoreDownError` 才转
`originWithoutCache`（`:206-211`），所以等待者拿到的是**同一份**降级结果。上面两条探针在 B 上
都不成立：抖动那次只打 1 次 origin，三个并发调用方拿到的值一模一样，`cache_loads_total` 也等于
真实 origin 调用次数（`populate()` 里快照先取、`cache_loads_total` 放在调 loader 之前，
`:112-116`）。其余口径（世代快照写在回源前、栅栏计数、锁 token 走共享 `incr`、`finally` 里
`compareAndDel` 只删自己那把、锁 TTL 到点能被别的实例接手、回源抛错不写负缓存、写缓存失败只计
降级）逐条验过，和 A 等价。

B 站不住的是失效路径：`invalidateTag()` 直接把 `store.incr()` 抛出去，没有按 failMode 分流
（`src/cache.js:244-248`）。fail_fast 下抛的是原始 `StoreDownError`，而 README 和 `errors.js`
都写明"fail_fast 时共享存储不可用就直接抛 `CacheUnavailableError`"——failMode 这个开关对失效
路径完全不起作用；fail_open 下同样抛错（README 那段 fail_open 是写给读路径的，这条算口径分歧）。
另外 `get()` 里 `options.tags ?? []` 没做数组校验（`src/cache.js:222`），调用方传个非数组会直接
TypeError，A 用 `Array.isArray` 兜了一下，属于很小的差异。

## 结论

我选 **B 更好**。两边在正常路径上完全等价：同样的命中判定、同样的失效栅栏、同样的锁语义、同样的
13/13 和逐字一致的演示输出，光看交付面分不出高下。分野在共享存储抖动的那一刻——A 把 fail_open
的降级放在单飞 promise 外面，抖动一起来，同一个 key 的并发会退化成各自回源（4 并发 → 4 次
origin；3 并发 → 2 次 origin，而且两个调用方拿到的是不同版本的值），`cache_loads_total` 还会把
没打出去的回源记成一次；B 把降级放在单飞任务里，同样的抖动只打 1 次 origin、所有调用方拿到同一次
结果、计数器和真实调用数一致。这题要收掉的正是"几百个并发同时回源把库拖死"和"计数不对没法定位"，
所以我把票投给 B。

B 的缺口我也认：`invalidateTag` 不分 failMode（fail_fast 没抛 `CacheUnavailableError`，
fail_open 也把错误直接抛给调用方），这一格 A 更贴 README；但它是个没写死的角落，影响范围限于
失效调用方拿到的错误类型，而 A 的问题发生在核心读写路径的并发语义上。过程上 A 更干净（8 次调用、
零失败），B 多花了一次猜错工作目录的调用，这点我承认，但不足以改变上面的判断。
