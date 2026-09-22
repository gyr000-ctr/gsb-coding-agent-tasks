后台要过审计，谁在什么时候动了什么必须能查，但日志里不能躺着明文密码和 token，另外日志也不能无限涨。

入口一个 createAuditLog，README 的《口径》和《API》两节把配置、append 的字段与脱敏口径、写入时的裁剪、query 的过滤与排序、limit 与时间范围校验、prune 的边界、统计口径、每种错误报哪个码都写死了，照着来。目录里 lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/audit.js，别的文件别动，也别引第三方包。

脱敏要在写进去的时候就做掉：password、passwd、token、secret、authorization、api-key/apikey 这些键名（大小写不敏感）值一律换成 ***，meta 里的嵌套对象和数组要继续往下走，别的位置不动。写进去和查出来的都必须是深拷贝，外面改它不能影响库里存的那份。

查询按时间升序，同一时刻按写入顺序；actor 和 action 精确匹配，from/to 含边界，limit 默认 50、上限 200，参数不合法报 ERR_BAD_QUERY。裁剪有两条路：保留期按 now 减事件时间严格大于 retentionMs 才清（正好到点不算过期），条数超过 maxEvents 就丢最老的；append 时顺手做一次，prune 可以手动调。

跑法两条：npm test 全绿（12 条，里面有默认字段、嵌套脱敏、深拷贝、保留期与条数两条裁剪路径、排序与并列顺序、过滤与边界、limit 校验），npm run demo 的输出跟 README 最后贴的那段一行行对上。
