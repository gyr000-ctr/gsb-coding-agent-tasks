后台接口收上来的 JSON 得先校验一遍再入库，现在代码里到处是手写的 if，想换成一份 schema 加一个 validate。

入口一个 validate，README 的《口径》和《API》两节把 API 形状、schema 支持哪些关键字、类型怎么判、检查顺序、错误路径怎么写、errors 里能用哪几种 code、schema 写错时抛什么异常都写死了，照着来。目录里 lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/check.js，别的文件别动，也别引第三方包。

错误要能定位到具体位置：根是空路径，对象字段用 a.b，数组用 list[0]，套起来就是 list[0].id；每条错误都要有 path、code、message。值不合法不抛异常，只返回 errors；只有 schema 自己写错才抛 ERR_BAD_SCHEMA。

检查顺序要稳：先看 type，类型不对就只报这一条、不再往下钻；然后 enum、长度、范围；object 先报 required 再查 properties 最后报多余字段，array 按索引查 items。integer 和 number 要分开，1.5 过不了 integer；enum 用严格相等，1 和 '1' 不是一回事。schema 树必须整棵先查一遍，哪怕值里没有那个字段，嵌套的 schema 写错也得被发现。

跑法两条：npm test 全绿（12 条，里面有 required 顺序、嵌套和数组路径、多余字段、长度/范围/枚举边界、integer 与 number、any 的行为、schema 各种写错的情况），npm run demo 的输出跟 README 最后贴的那段一行行对上。
