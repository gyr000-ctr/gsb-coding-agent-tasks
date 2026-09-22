订单导出、邮件推送这些慢活儿现在是同步做的，接口经常卡住，想在这仓库里写个内存任务队列，让 worker 自己去取。

入口一个 createQueue，README 的《口径》和《API》两节把配置、投递、取任务的可见性超时、ack/nack 怎么判、重试次数和死信、统计口径、每种错误报哪个码都写死了，照着来。目录里 lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/queue.js，别的文件别动，也别引第三方包。

取走的任务要给个 receipt，ack 和 nack 都得拿对receipt 才认，拿上一轮的或者重复 ack 都是 false，不要抛异常。可见性超时算一次投递：没人处理的时候任务自己会回来，attempts 继续加，超过 maxAttempts 就进死信，下一次 receive 不该再把它给出去。nack 到上限也是一样直接进死信。

"现在几点"只能从 clock 拿，别在代码里偷偷 Date.now()，不然超时边界测不了；payload 进队要存副本，取出来改它不能污染队列。统计里 ready 是现在就能取的（包括可见性已经超时的），inflight 是还在可见性窗口里的，delayed 是延迟没到点的。

跑法两条：npm test 全绿（11 条，里面有先入先出与 max 上限、延迟可见、visibility 超时后重新投递与换 receipt、ack/nack 的凭证校验、超时和 nack 两条死信路径、统计口径），npm run demo 的输出跟 README 最后贴的那段一行行对上。
