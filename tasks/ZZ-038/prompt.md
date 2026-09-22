内网几个 worker 抢同一批订单，现在是"自己写个文件当锁"，进程卡死了别人也看不出来，等它醒过来接着写，就把新持有者的改动盖掉了。想在这仓库里写一个带租约和 fencing token 的锁服务。

入口一个 createLockService，README 的《口径》和《API》两节把时间怎么算、租约到期怎么判、token 怎么发、重入算不算新持有者、过期是懒判定还是定时扫、fencing 放行谁、每种错误报哪个码都写死了，照着来。目录里 lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/leaselock.js，别的文件别动，也别引第三方包。

几个我特别在意的地方。token 是每个 key 一条线，只增不减也不复用，释放和过期都不能让它回退，不然下游拿老 token 还能写进去。刚好到点（expiresAt 等于 now）就算过期，不是"还没到期"。过期是懒判定的：谁碰到这个 key 谁结算，同一个租约只记一次；记录不能删，删了 token 线就断了。同一个持有者再来一次是重入，token 不变、只把租约顺延，别当成换人发了新票。

租约已经不在的时候（过期或者释放过了），续租和释放都得先报 ERR_LEASE_LOST，别拿 token 对不上来搪塞；查询类的 status / isHeld / checkFence 碰到没见过的 key 不抛异常。

跑法两条：npm test 全绿（17 条，里面有重入不换 token、到点算过期、过期让位换 token、释放后 token 继续加、fencing 挡旧票、sweep 只记一次、懒判定、list 排序、统计口径与各条参数校验），npm run demo 的输出跟 README 最后贴的那段一行行对上。
