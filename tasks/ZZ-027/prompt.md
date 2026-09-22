后台的登录态现在只有一张表存 token，压根不管空闲多久、一个人开了几台设备，刷新令牌被人拿去重放也看不出来，想在这仓库里重写一层会话仓库。

入口一个 createVault，README 的《口径》和《API》两节把配置、登录与顶号、设备数上限、两种过期的判定、touch/refresh/logout/revokeUser 的行为、刷新令牌轮换与复用检测、查询和统计、每种错误报哪个码都写死了，照着来。目录里 lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/vault.js，别的文件别动，也别引第三方包。

过期必须卡在点上：空闲到期按 now - lastSeen 算，绝对上限按 createdAt 算，都是到了就等于过期；touch 和 refresh 会把空闲计时往后推。同一台设备再登录要顶掉旧会话，设备数超过 maxDevices 就按最久没用过的踢，撤销的会话要记进 evicted，并且之后再用就报 ERR_BAD_SESSION。

刷新令牌是一次性的：对得上就轮换（代次加一，旧的立刻作废），对不上就当成复用，把这个会话和这个用户其它活跃会话全部撤销，再抛 ERR_REFRESH_REUSED。会话不存在或已撤销报 ERR_BAD_SESSION，过期报 ERR_SESSION_EXPIRED，logout 对不存在/已撤销的返回 false 而不是抛异常。"现在几点"只能从 clock 拿。

跑法两条：npm test 全绿（15 条，里面有顶号、设备上限踢最久没用、滑动过期与绝对上限的边界、轮换、旧令牌复用导致整条链撤销、排序与统计），npm run demo 的输出跟 README 最后贴的那段一行行对上。
