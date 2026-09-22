网关现在要自己验业务方递过来的 JWT，想在这仓库里把这套校验补出来。

入口一个 createVerifier，README 的《口径》和《API》两节把配置怎么校验、JWKS 怎么读、
校验顺序、返回什么、exp/iat/nbf 三个时间声明怎么算、iss 和 aud 怎么比、每种错误报哪个码
都写死了，照着来。目录里 lib/jose.js、lib/errors.js、test 下两组用例和 helpers.js、
scripts/demo.mjs 都已经写好，就差 lib/verifier.js，别的文件别动，也别引第三方包。

顺序不能乱：先判 token 形状，再判算法，再找 kid，再验签名，最后才看
声明；签名没过就绝不能去看 claims，claims 不过也不能掩盖签名问题。算法只认白名单，
none 和 HS256 这种对称算法一个都不能过，钥匙上写的 alg 和 token 不一致也要拒——这是防
算法混淆的关键一步。

kid 缺失和 kid 陌生要分开报错，轮换钥匙之后旧 kid 必须立刻变成陌生。时间全走注入的 clock，
exp 过期要按 clockSkewMs 放宽，边界上那一下（now 正好等于 exp + skew）算有效；nbf 早了报
ERR_NOT_YET_VALID，iat 比现在还晚报 ERR_BAD_CLAIMS，配了 maxTokenAgeMs 还得拦住太老的 token。
aud 支持字符串和字符串数组，交集为空、类型不对、干脆没有这个声明，都算受众不匹配。

跑法两条：npm test 全绿（15 条，里面有 none/HS256 与白名单、kid 缺失/陌生/钥匙 alg 不一致、
签名被篡改、exp 偏移边界、nbf 与 iat、maxTokenAge、iss 与 aud、钥匙轮换和坏 JWKS），
npm run demo 的输出跟 README 最后贴的那段一行行对上。
