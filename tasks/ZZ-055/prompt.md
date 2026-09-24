Raft 里日志复制那块想自己写一份：任期、prevIndex/prevTerm 对不上时回哪个冲突下标、
冲突截断、多数派提交、日志压缩和 InstallSnapshot、还有单步的成员变更，全都要能按消息
一步一步走下来，同样的消息序列必须走出同样的结果。选举和投票不要，谁是 leader 建节点的时候
直接指定就行。

入口就 createNode，README 的《口径》和《API》两节把日志下标怎么算、快照之后 termAt/commandAt
什么口径、四种消息各带什么字段、任期更小和更大的消息分别怎么处理、follower 收到 append
的每一步（四种 prevIndex/prevTerm 的分支、怎么截断、leaderCommit 怎么挪、提交之后怎么应用
配置条目）、leader 怎么更新 matchIndex/nextIndex、提交候选怎么取中位数那一条、什么时候必须
是当前任期的条目才提交、快照怎么装和怎么留尾巴、broadcast 和 propose 各发什么、成员变更
什么时候生效、每种错误报哪个码都写死了。目录里 lib/errors.js、test 下两组用例、
scripts/demo.mjs 都已经写好，就差 lib/raftlog.js，别的文件不动，也别引第三方包。

容易写歪的地方：任期更大的消息一到，leader 得立刻不再是 leader，matchIndex/nextIndex 全丢掉；
冲突截断是「下标一样但 term 不一样，把那条和它后面全删掉」，别只删一条或者不删；
提交候选是所有成员报上来的 matchIndex（自己用 lastIndex）排完取 floor(成员数/2) 那一个，
而且只有 termAt(候选) 等于当前任期才真的挪 commitIndex —— 所以上一个任期的条目要等当前任期
有条目提交了才会跟着提交；leader 收到失败的响应要把 nextIndex 退回去，退到快照前面就改发
snapshot；成员变更 leader 立刻生效、follower 要等提交，而且一次只能动一个成员。

跑法两条：npm test 全绿（12 条，里面有建节点与 state 口径、四种 prevIndex/prevTerm 分支、
冲突截断、心跳与 leaderCommit、任期规则与降级、消息形状错误码、多数派提交与下发 leaderCommit、
只提交当前任期、失败响应退 nextIndex 与改发快照、snapshotNow 的口径、InstallSnapshot
留尾巴或清空、成员变更的两种生效时机），npm run demo 的输出跟 README 最后贴的那段一行行对上。
