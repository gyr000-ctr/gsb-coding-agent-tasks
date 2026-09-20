# ZZ-007 GSB 理由（结论：A 更好）

两边的交付面是一样的：`git diff --stat zz-007/base..zz-007/a` 和 `..zz-007/b` 都只有 `src/hub.js`
一个文件，`npm test` 都是 13/13 全绿，`node bin/eventpush.js --config configs/dev.json` 的输出和
README 里那段逐行一致（published=4、delivered=5、replay=1，其余为 0）。差别在过程效率，以及
README 里写了、但 `test/eventpush.test.js` 没覆盖到的那几条口径上。

## A

**过程**：模型先把 README、`src/hub.js` 骨架、`config/counters/errors/sse/server`、`bin`、
`test/eventpush.test.js` 和 `test/support/`（harness、fake-clock）一次读完再动手，没有反复重读。
问题出在落盘那一步：它用一个全文件重写的补丁改 `src/hub.js`，补丁里手抄的文件头注释和仓库里的
原文不一致（写成 `createHub({ config, counters, now, sleep }) -> { subscribe, publish, close, stats }`，
实际文件是 `subscribe(subscription), publish(topic, event), close(), stats()`），`apply_patch` 直接
报 `Failed to find expected lines`。随后 A 把原因归到换行符上，说"文件是 CRLF 换行导致匹配失败"，
为此连查了 `Format-Hex` 和 CRLF 两次都没打中真正的错处；中间还试过在同一个补丁里 `Delete File` +
`Add File` 同名文件，被工具以 `invalid patch: multiple operations target ...` 退回，最后才用
Delete、Add 两步落地。把文件换进去这一件事，A 一共用了 6 次调用（1 次失败的全文件补丁 + 2 次
换行符排查 + 1 次被工具拒掉的 Delete/Add 合并补丁 + 正常的 Delete、Add），比 B 多花 4 次；
整轮 13 分 50 秒、约 39.2 万 token，token 是 B 的两倍（见下）。不过它没影响交付纪律：全程只碰
`src/hub.js`，改完先跑 `npm test` 再去跑演示入口对输出。

**产物**：优点集中在"别人出问题也不能把我带崩"这类边界上，四条都验证过：

- 订阅方回调被隔离：`terminate()` 用 try/catch 包住订阅方的 `close(reason)` 回调。我构造"某条
  订阅的 close 回调抛错 + `overflowPolicy: 'disconnect'` 触发 overflow"，A 的 `publish()` 正常
  返回，同一个 topic 的第二个订阅者照常收到第 3 帧。
- 计数器加在真正交付之后：`delivered / replay / replay_gap` 全部在 `await send(frame)` 成功之后才
  `inc`，符合 README 里"补发出去的事件帧数"。同样的探针下（`lastEventId='1'` 重连、`send` 立刻
  reject），A 报 `replay_total=0`、`delivered_total=0`、`disconnected_total=1`。
- 会校验 `overflowPolicy`：非 `drop_oldest`/`disconnect` 的值回落到 `config.defaultOverflowPolicy`。
  配置默认 `disconnect`、调用方传了错拼的 `'dropoldest'` 时，A 按配置断开这条订阅
  （`close('overflow')`、`disconnected_total=1`、`dropped_total=0`）。
- 订阅 topic 在 `subscribe` 时就快照成 Set，`handle.topics` 返回副本：订阅之后调用方再往原数组里
  `push` 一个 topic，不会改变这条订阅的收件范围。
- 小瑕疵：`stats()` 在 replay 窗口为空时返回 `oldestSeq/newestSeq = 0`（B 返回 `null`）。README
  没写死，但 0 容易被读成"存在第 0 号事件"。

## B

**过程**：读法跟 A 一致（README、骨架、`test/eventpush.test.js` 和 support、`src/server.js`、`bin`
都读了），然后一个补丁把 `src/hub.js` 写完，第一次 `npm test` 就是 13/13 全绿，没有任何失败的
调用，8 分 31 秒、约 19.5 万 token，用时和 token 都只有 A 的一半；收尾汇报也逐条对上了口径，
并说明了只动 `hub.js`。短板是验证停在"给定用例 + 演示输出"这一层，README 里用例没覆盖到的口径
就没有兜住。

**产物**：结构上有写得清楚的地方——`pump()` 里用 `sub.sending` 明确"正在发的那一帧不占队列名额"，
`drainSubscription()` 用 `Promise.race(sleep(drainTimeoutMs))`，并且只在超时且队列非空/正在发时
才 `close('drain_timeout')`；`eventpush_published_total` 放在 `publish` 入口自增，比 A 更贴
README"每次 `publish()` 进来加一"的字面（代价是关闭后被拒的调用也会计进 published，这点两边
解读不同，我不当硬伤算）。但下面四处站不住：

- **订阅方回调抛错会外溢**：`disconnect()` 直接调 `sub.close(reason)`，没有 try/catch。同一探针里，
  B 的 `hub.publish()` 把订阅方的 `close boom` 抛给了调用方，扇出循环被打断，第二个订阅者少收
  一帧（只拿到 `id=1`、`id=2`）；更重的是 `hub.close()` 也被同一个回调带崩——`await hub.close()`
  直接 reject，而 `closePromise` 已经缓存，之后每次 `close()` 还是同一个 rejected promise，
  等于关停永远收不了尾。README 要求的是"所有订阅都处理完 `close()` 才 resolve"。
- **补发计数加在排队时刻，不是发出去之后**：`replay_total`/`replay_gap_total` 在 `subscribe` 里
  入队时就 `inc`。构造"重连后 `send` 立刻 reject"，B 报 `replay_total=2`、`delivered_total=0`；
  而 README 里 delivered 是"成功交给某个订阅者的帧数（补发的也算）"、replay 是"补发出去的
  事件帧数"，replay 大于 delivered 自相矛盾，监控会把没送出去的补发当成补发成功。
- **`overflowPolicy` 不校验、还丢掉了配置默认值**：`policy` 直接取
  `subscription.overflowPolicy ?? config.defaultOverflowPolicy`，遇到非法值既不报错也不回落，
  直接按"非 disconnect 即 drop_oldest"走。配置默认 `disconnect`、传 `'dropoldest'` 的探针里，
  B 的 `dropped_total=1` 且订阅还活着，配置里"缓冲满了就断开这条订阅"直接失效。
- **订阅 topic 不做快照，`handle.topics` 漏出内部数组**：`subscribe` 之后调用方
  `topics.push('payments')`，这条订阅马上开始收 payments 的帧，`handle.topics` 也变成
  `['orders','payments']`。订阅范围本该在 `subscribe` 那一刻定死。

另外两处是解读差异，我不算硬伤，但记一笔：客户端发 `?lastEventId=`（空串）时，B 按
`Number('')=0` 把整个保留窗口重放一遍（3 帧全发），A 视为没带 id、不补发；B 的 `replay_gap` 帧
生成的是 `id: ` 空值，SSE 里空 id 会清掉客户端的 last event id，A 用的是 `id: <requested>`，
重连时不会丢位置。

## 结论

我选 **A 更好**。B 的过程确实更漂亮：一次落地、零失败调用，工具调用数 10 比 15、token 约为 A
的一半，这一点我认可，也承认 A 那次抄错注释、又把原因误判成 CRLF 是实打实的效率损失。但 B 的"一次成功"
是拿给定用例当验收边界换来的：我用 README 里同一条口径继续往它没覆盖的角落压，B 在四个点上
站不住——订阅方回调抛错会打断 `publish` 的扇出、还会让 `close()` 变成收不了尾的 rejected
promise，补发计数比真实投递还大，非法 `overflowPolicy` 会让配置里的 disconnect 静默失效，
订阅范围还能被外部数组改掉；A 在这些点上给出的都是符合 README 的结果。A 剩下的问题
（`stats()` 空窗口返 0）只是口径未定义的小瑕疵，不影响这题的核心语义。所以我更偏好 A。
