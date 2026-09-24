后台要个定时器轮子：几十万个「多久之后干点什么」的记录，不能一条一个 setTimeout，也不能每次时间变化都全量排序。
要分层的：细活放细层，远的先扔粗层，时间往前走的时候再一层层往下落。环境里没有现成的，自己写一份。

入口一个 createWheel，外加 schedule / scheduleIn / cancel / advance / now / nextDeadline / stats。
README 的《口径》和《API》两节是标准答案：每层一个格子盖多少毫秒、整层跨度多少、最远能排多远、
delay 落在哪一层哪个格子怎么算、deadline 和 scheduleIn 各有什么限制、一次 advance 里到点的按什么顺序跑、
跑的过程中新排进来的怎么算、跑完为什么要重新铺一遍、cancel 和 nextDeadline 的返回值、stats 里每个字段
什么意思、错误码和 details 各带什么，都写死了，照着来。目录里 lib/errors.js、test 下两组用例、
scripts/demo.mjs 都已经写好，就差 lib/timewheel.js，别的文件不动（用例是标准，别改用例去迁就实现），
也别引第三方包 —— 更不是让你用一个数组每次排序糊过去，会有一套跟朴素模型对拍的用例顺手把你抓出来。

容易写歪的地方：时钟是虚拟的，从 0 开始，只有 advance 会让它走，别去碰真实时间；schedule 的 deadline 必须
比当前时间大，等于或者小于报 ERR_DEADLINE_PAST，而 scheduleIn 的延迟可以是 0，那种记录 deadline 就等于当前
时间、排进去先不跑，要等一次 drain；落层规则是「取最小的 L 让 delay < spanMs(L)」，边界上别搞错 —— 默认参数
下差 8 毫秒是第 1 层不是第 0 层，差 64 毫秒是第 2 层，等于 maxDelay（默认 512）排得下、多 1 毫秒就是
ERR_DEADLINE_TOO_FAR，details 里给 delay 和 maxDelay；格子号是 floor(deadline / slotMs(L)) % wheelSize，
别拿 delay 去除。一次 advance 里到点的先比 deadline、再比排进来的先后；任务里新排的如果也到点了，这一趟
接着跑，顺序仍然排在后面（所以 drain 得是个循环，不是扫一遍完事）；跑完记得把剩下的按「离现在还有多久」
重新铺一遍，不然粗层里的永远落不下来 —— 级联是能被 stats 看见的。cancel 已经跑过的记录要返回 false，
nextDeadline 一条都没有要返回 null。stats 的 slots 是每层每个格子里各有几条，长度就是 wheelSize，
别只给个总数；levels 里 slotMs / spanMs 也得是那个公式算出来的实际值。入参校验别偷懒：tickMs 得是正整数，
wheelSize 和 levels 得不小于 2（levels 至少两层），advance 的毫秒数得是非负整数，task 得是函数。

跑法两条：npm test 全绿（9 条，里面有默认参数与建轮入参、落层与格子号、同 deadline 的先后、
任务里新排的当趟跑掉、级联过程中各层的分布、取消与 nextDeadline、过去和太远的 deadline，
还有跟朴素模型对拍以及几千个定时器各自正好跑一次），npm run demo 的输出跟 README 最后贴的那段一行行对上。
