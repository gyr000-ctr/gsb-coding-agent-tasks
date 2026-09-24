import test from 'node:test';
import assert from 'node:assert/strict';

import { codes, shapes } from './util.js';

test('标签、属性、文本的基本盘', () => {
  assert.deepEqual(shapes('<p class=hi>a &amp; b</p>'), [
    'startTag(p)[class="hi"]', '#text[a & b]', 'endTag(p)', 'eof',
  ]);
  assert.deepEqual(shapes('<P CLASS="Hi">x</P>'), [
    'startTag(p)[class="Hi"]', '#text[x]', 'endTag(p)', 'eof',
  ]);
  assert.deepEqual(shapes('<br/>'), ['startTag(br /)', 'eof']);
  assert.deepEqual(shapes('<img src="a" alt=\'b\'/>'), ['startTag(img /)[src="a" alt="b"]', 'eof']);
  assert.deepEqual(shapes('<a b c="">d</a>'), ['startTag(a)[b="" c=""]', '#text[d]', 'endTag(a)', 'eof']);
  assert.deepEqual(shapes('<a b = "c" >'), ['startTag(a)[b="c"]', 'eof']);
  assert.deepEqual(shapes('x<b>y</b>z'), ['#text[x]', 'startTag(b)', '#text[y]', 'endTag(b)', '#text[z]', 'eof']);
  assert.deepEqual(shapes('<div><p>a</p></div>'), [
    'startTag(div)', 'startTag(p)', '#text[a]', 'endTag(p)', 'endTag(div)', 'eof',
  ]);
  assert.deepEqual(codes('<p class=hi>a &amp; b</p>'), []);
});

test('doctype 的几种写法与 quirks', () => {
  assert.deepEqual(shapes('<!DOCTYPE html>'), ['doctype(html)[- -]', 'eof']);
  assert.deepEqual(shapes('<!doctype HTML>'), ['doctype(html)[- -]', 'eof']);
  assert.deepEqual(shapes('<!DOCTYPE html SYSTEM "about:legacy-compat">'),
    ['doctype(html quirks)[- about:legacy-compat]', 'eof']);
  assert.deepEqual(
    shapes('<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">'),
    ['doctype(html quirks)[-//W3C//DTD HTML 4.01//EN http://www.w3.org/TR/html4/strict.dtd]', 'eof'],
  );
  assert.deepEqual(shapes('<!DOCTYPE>'), ['doctype( quirks)[- -]', 'eof']);
  assert.deepEqual(codes('<!DOCTYPE html>'), []);
});

test('注释与 bogus comment', () => {
  assert.deepEqual(shapes('a<!--x-->b'), ['#text[a]', 'comment[x]', '#text[b]', 'eof']);
  assert.deepEqual(shapes('<!--a>b-->'), ['comment[a>b]', 'eof']);
  assert.deepEqual(shapes('<!-->'), ['comment[]', 'eof']);
  assert.deepEqual(shapes('<!--->'), ['comment[]', 'eof']);
  assert.deepEqual(shapes('<!x>'), ['comment[x]', 'eof']);
  assert.deepEqual(shapes('<?y>'), ['comment[y]', 'eof']);
  assert.deepEqual(codes('<!--x-->'), []);
  assert.deepEqual(codes('<!-->'), ['abrupt-closing-of-empty-comment']);
  assert.deepEqual(codes('<!--->'), ['abrupt-closing-of-empty-comment']);
  assert.deepEqual(codes('<!x>'), ['incorrectly-opened-comment']);
  assert.deepEqual(codes('<?y>'), ['unexpected-question-mark-instead-of-tag-name']);
});

test('字符引用', () => {
  assert.deepEqual(shapes('&amp;&lt;&gt;&quot;&apos;&nbsp;&copy;'),
    ['#text[&<>"\'\u00a0\u00a9]', 'eof']);
  assert.deepEqual(shapes('&#65;&#x41;&#X41;'), ['#text[AAA]', 'eof']);
  assert.deepEqual(shapes('&#65 &#x41'), ['#text[A A]', 'eof']);
  assert.deepEqual(codes('&#65 &#x41'), ['invalid-character-reference', 'invalid-character-reference']);
  assert.deepEqual(shapes('&#0;'), ['#text[\uFFFD]', 'eof']);
  assert.deepEqual(codes('&#0;'), ['null-character-reference']);
  assert.deepEqual(shapes('&#x110000;&#xD800;'), ['#text[\uFFFD\uFFFD]', 'eof']);
  assert.deepEqual(codes('&#x110000;&#xD800;'),
    ['character-reference-outside-unicode-range', 'character-reference-outside-unicode-range']);
  assert.deepEqual(shapes('&unknown;&amp;&#;'), ['#text[&unknown;&&;]', 'eof']);
  assert.deepEqual(codes('&unknown;&amp;&#;'),
    ['invalid-character-reference', 'invalid-character-reference']);
  assert.deepEqual(shapes('<a title="&amp;x" data-y=\'&lt;\'>'), ['startTag(a)[title="&x" data-y="<"]', 'eof']);
});

test('RAWTEXT / RCDATA / CDATA', () => {
  assert.deepEqual(shapes('<script>if (a < b) { x = "</div>"; }</script>'), [
    'startTag(script)', '#text[if (a < b) { x = "</div>"; }]', 'endTag(script)', 'eof',
  ]);
  assert.deepEqual(shapes('<script>a</scriptx>b</script>'), [
    'startTag(script)', '#text[a</scriptx>b]', 'endTag(script)', 'eof',
  ]);
  assert.deepEqual(shapes('<style>p {}</style >'), ['startTag(style)', '#text[p {}]', 'endTag(style)', 'eof']);
  assert.deepEqual(shapes('<script/>x'), ['startTag(script /)', '#text[x]', 'eof']);
  assert.deepEqual(shapes('<textarea>&amp; &lt;<b></textarea>'),
    ['startTag(textarea)', '#text[& <<b>]', 'endTag(textarea)', 'eof']);
  assert.deepEqual(shapes('<title>&amp;<b></title>'),
    ['startTag(title)', '#text[&<b>]', 'endTag(title)', 'eof']);
  assert.deepEqual(shapes('<![CDATA[raw <b> & </i>]]>'), ['cdata[raw <b> & </i>]', 'eof']);
  assert.deepEqual(codes('<script>1 < 2</script>'), []);
});

test('属性的边界情况', () => {
  assert.deepEqual(shapes('<a b="1" b="2">'), ['startTag(a)[b="1"]', 'eof']);
  assert.deepEqual(codes('<a b="1" b="2">'), ['duplicate-attribute']);
  assert.deepEqual(shapes('<a b=>'), ['startTag(a)[b=""]', 'eof']);
  assert.deepEqual(codes('<a b=>'), ['missing-attribute-value']);
  assert.deepEqual(shapes('<a b="1"c=2 =3 d>'),
    ['startTag(a)[b="1" c="2" 3="" d=""]', 'eof']);
  assert.deepEqual(codes('<a b="1"c=2 =3 d>'),
    ['missing-whitespace-between-attributes', 'unexpected-equals-sign-before-attribute-name']);
  assert.deepEqual(shapes('<a x=1/>'), ['startTag(a)[x="1/"]', 'eof']);
  assert.deepEqual(shapes('<a x="1"/>'), ['startTag(a /)[x="1"]', 'eof']);
  assert.deepEqual(shapes('<a / x>'), ['startTag(a)[x=""]', 'eof']);
  assert.deepEqual(codes('<a / x>'), ['unexpected-solidus-in-tag']);
  assert.deepEqual(shapes('<a b=x"y`z>'), ['startTag(a)[b="xyz"]', 'eof']);
  assert.deepEqual(codes('<a b=x"y`z>'), [
    'unexpected-character-in-unquoted-attribute-value',
    'unexpected-character-in-unquoted-attribute-value',
  ]);
});
