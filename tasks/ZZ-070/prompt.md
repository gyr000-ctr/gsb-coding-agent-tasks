抓回来的页面要先拆成 token 存一份，环境里没有现成的 HTML 解析，自己写个分词器：一边扫一边切出
doctype / 注释 / 标签 / 文本 / CDATA，遇到写坏的地方不抛错，记一条毛病接着往下走（我们要的是「原文
什么样、错在哪」都能对上，不是帮人修页面）。

入口就 tokenize，返回 { tokens, errors }，token 最后跟一个 eof。README 的《口径》和《API》两节是标准
答案：每种 token 有哪些字段、名字和值分别怎么处理大小写、挨着的文本合不合并、标签名到哪儿算读完、
属性的各种写法（重复、没名字先来等号、两个属性挨着、等号后面直接收尾、未加引号的值里哪些字符要报
要丢、斜杠怎么算）、结束标签后面剩的东西怎么办、注释和 bogus comment 怎么分、doctype 的
PUBLIC/SYSTEM 和 quirks 判据、CDATA 和 RAWTEXT / RCDATA 各自认什么、字符引用那张表怎么解、NUL 在
文本里和标签里的不同待遇、19 个错误码各自的触发条件和下标怎么数，都写死了，照着来。目录里
lib/errors.js、test 下两组用例、scripts/demo.mjs 都已经写好，就差 lib/htmlex.js，别的文件不动
（用例是标准，别改用例去迁就实现），也别引第三方包 —— 尤其别把 HTML 丢给正则切一遍了事，也别去
require 外面的解析库。

容易写歪的地方：挨着的文本要合成一个 text token；标签名 / 属性名小写但属性值不改大小写；未加引号的
值里斜杠是普通字符，所以 <a x=1/> 的值是 "1/" 而且 selfClosing 是 false，别当自闭合处理；未加引号的
值里遇到 " ' < = 反引号要报错并把这一个字符丢掉，剩下的接着当值；重复属性第一个留下后来的报
duplicate-attribute；startTag 里的 / 后面不是 > 要报 unexpected-solidus-in-tag 并把斜杠丢掉；
script / style 是 RAWTEXT（< 和 & 都是普通字符，只有匹配的 </name 才收尾，</scriptx> 不算），
textarea / title 是 RCDATA（解字符引用但不认标签），<script/> 这种自闭合的不进 RAWTEXT；自闭合和
结束标签后面剩下的内容忽略到 > 为止，但标签没收尾的时候已经解出来的属性照样要给；<!--> 和 <!---> 是
空注释加 abrupt-closing-of-empty-comment，<!x> 是 incorrectly-opened-comment 的 bogus comment，
<?y> 是 unexpected-question-mark-instead-of-tag-name，这两个读到结尾没 > 不额外报错；doctype 名字
是 html 且没有 PUBLIC/SYSTEM 才是 quirks false，<!DOCTYPE> 也是 true；字符引用名字大小写敏感、
必须带分号，&#0; 和越界 / 代理区都换成 U+FFFD 但报的码不一样，不成形的只吃掉 & 剩下当文本；
文本里的 \0 原样留着，属性值里的 \0 换成 U+FFFD，两种都报 unexpected-null-character；errors 里的
index 是触发错误那个字符的下标，标签没结束这种记输入长度；空串进来就只有 eof、没有错误。

跑法两条：npm test 全绿（11 条，里面有标签属性文本的基本盘、doctype 的几种写法与 quirks、注释与
bogus comment、字符引用、RAWTEXT/RCDATA/CDATA、属性的边界情况、源码断在半路、错误码带位置、
NUL 的两种待遇、名字大小写与边界、大输入与确定性），npm run demo 的输出跟 README 最后贴的那段
一行行对上。
