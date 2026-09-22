我们前面挂了一层自研的缓存，现在毛病不少：有的响应明明写着不许存还是存了，有的过期了还在用，带 Vary 的接口更是动不动就串味。想在这仓库里按 HTTP 那套语义重新写一层。

入口一个 createHttpCache，README 的《口径》和《API》两节把请求响应长什么样、哪些响应不许存、新鲜期怎么算、Age 头怎么算进去、Vary 怎么分条目、什么时候必须回源、什么时候可以先拿旧的顶、回源 304 怎么续命、每种错误报哪个码都写死了，照着来。目录里 lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/httpcache.js，别的文件别动，也别引第三方包。

几个我特别在意的地方。新鲜度是严格小于才算新鲜，ageMs 正好等于 freshnessMs 就已经过期了。优先级是 s-maxage 压过 max-age，两个都没有才轮到 Expires，再没有才用 Last-Modified 的启发式，什么都没有就是零、一存下来就过期。Age 头要算进年龄里，所以一份响应存进来的那一刻就可能已经是过期的。

no-cache、must-revalidate、stale-while-revalidate 这三件事别混：no-cache 是"用之前必须回源"，哪怕它还新鲜；must-revalidate 过期之后不许拿旧的顶；只有带 stale-while-revalidate 的才在窗口里允许 stale 复用，而且窗口是从新鲜期结束那一刻往后算的。请求自己带 no-cache 或 no-store 的时候，缓存这边的行为也不一样，一个是强制回源，一个是根本不碰缓存。

Vary 要比对的是存的时候和查的时候请求头的值，缺头就按空值比；Vary 是星号的那种直接别存。拿出来给调用方的响应头必须是拷贝，外面改了不能影响缓存里那份；条目超过上限按最近最少使用踢。

跑法两条：npm test 全绿（18 条，里面有 max-age 与到点过期、各种不能存的 reason、s-maxage 与 Expires、Age 头、启发式新鲜度、no-cache 与 must-revalidate、stale 复用窗口、请求侧的 no-cache / no-store、Vary 分条目、返回拷贝、304 续命与整份替换、204/无条目、purge、LRU 与统计口径、各条参数校验），npm run demo 的输出跟 README 最后贴的那段一行行对上。
