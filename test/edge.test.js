import test from 'node:test';
import assert from 'node:assert/strict';

import { tokenize } from '../lib/htmlex.js';
import { code, codes, located, shapes } from './util.js';

test('源码断在半路', () => {
  assert.deepEqual(codes('<p'), ['eof-in-tag']);
  assert.deepEqual(shapes('<p'), ['startTag(p)', 'eof']);
  assert.deepEqual(codes('<p '), ['eof-in-tag']);
  assert.deepEqual(codes('<p a="1'), ['eof-in-tag']);
  assert.deepEqual(shapes('<p a="1'), ['startTag(p)[a="1"]', 'eof']);
  assert.deepEqual(codes('<a href='), ['eof-in-tag']);
  assert.deepEqual(codes('<!--'), ['eof-in-comment']);
  assert.deepEqual(shapes('<!--'), ['comment[]', 'eof']);
  assert.deepEqual(codes('<!DOCTYPE'), ['eof-in-doctype']);
  assert.deepEqual(shapes('<!DOCTYPE'), ['doctype( quirks)[- -]', 'eof']);
  assert.deepEqual(codes('<![CDATA['), ['eof-in-cdata']);
  assert.deepEqual(shapes('<![CDATA['), ['cdata[]', 'eof']);
  assert.deepEqual(codes('</'), ['missing-end-tag-name', 'eof-in-tag']);
  assert.deepEqual(shapes('</'), ['endTag()', 'eof']);
  assert.deepEqual(codes('</>'), ['missing-end-tag-name']);
  assert.deepEqual(shapes('</>'), ['endTag()', 'eof']);
  assert.deepEqual(codes('<'), []);
  assert.deepEqual(shapes('<'), ['#text[<]', 'eof']);
  assert.deepEqual(codes('<!'), ['incorrectly-opened-comment']);
  assert.deepEqual(codes('<?'), ['unexpected-question-mark-instead-of-tag-name']);
});

test('错误码带位置', () => {
  assert.deepEqual(located('<a b="1" b="2">'), [{ code: 'duplicate-attribute', index: 9 }]);
  assert.deepEqual(located('x<3y'), [{ code: 'invalid-first-character-of-tag-name', index: 1 }]);
  assert.deepEqual(located('x<3y').length, 1);
  assert.deepEqual(shapes('x<3y'), ['#text[x<3y]', 'eof']);
  assert.deepEqual(located('<a b=>'), [{ code: 'missing-attribute-value', index: 5 }]);
  assert.deepEqual(located('&#x110000;'), [{ code: 'character-reference-outside-unicode-range', index: 0 }]);
  assert.deepEqual(located('<a b="\0">'), [{ code: 'unexpected-null-character', index: 6 }]);
  assert.deepEqual(shapes('<a b="\0">'), ['startTag(a)[b="\uFFFD"]', 'eof']);
  assert.deepEqual(located('<a x=1/>'), []);
  assert.deepEqual(located('&#65 &#x41'), [
    { code: 'invalid-character-reference', index: 0 },
    { code: 'invalid-character-reference', index: 5 },
  ]);
});

test('NUL 在文本里留着、在标签里换成 U+FFFD', () => {
  assert.deepEqual(shapes('a\0b'), ['#text[a\0b]', 'eof']);
  assert.deepEqual(codes('a\0b'), ['unexpected-null-character']);
  assert.deepEqual(shapes('<a b="x\0y">'), ['startTag(a)[b="x\uFFFDy"]', 'eof']);
  assert.deepEqual(codes('<a b=x\0y>'), ['unexpected-null-character']);
  assert.deepEqual(shapes('<textarea>a\0b</textarea>'), ['startTag(textarea)', '#text[a\0b]', 'endTag(textarea)', 'eof']);
});

test('名字的大小写与边界', () => {
  assert.deepEqual(shapes('<DIV CLASS = "a" />'), ['startTag(div /)[class="a"]', 'eof']);
  assert.deepEqual(codes('<DIV CLASS = "a" />'), []);
  assert.deepEqual(shapes('</P >'), ['endTag(p)', 'eof']);
  assert.deepEqual(shapes('</ >'), ['endTag()', 'eof']);
  assert.deepEqual(codes('</ >'), ['missing-end-tag-name']);
  assert.deepEqual(shapes('<!-- -- -->'), ['comment[ -- ]', 'eof']);
  assert.deepEqual(shapes('<a b = c>'), ['startTag(a)[b="c"]', 'eof']);
  assert.deepEqual(shapes('<div a-b_c:d=1>x</div>'),
    ['startTag(div)[a-b_c:d="1"]', '#text[x]', 'endTag(div)', 'eof']);
  assert.deepEqual(codes('<script></scriptx></script>'), []);
});

test('大输入、确定性与入参检查', () => {
  const parts = [];
  for (let index = 0; index < 500; index += 1) {
    parts.push(`<li id="i${index}" class='row ${index}'>第 ${index} 条 &amp; 备注</li>`);
  }
  const html = `<ul>${parts.join('')}</ul>`;
  const first = tokenize(html);
  const second = tokenize(html);
  assert.deepEqual(first, second);
  assert.equal(first.errors.length, 0);
  assert.equal(first.tokens.length, 500 * 3 + 3);
  assert.equal(first.tokens[0].type, 'startTag');
  assert.equal(first.tokens[first.tokens.length - 1].type, 'eof');

  const messy = tokenize('<a b="1"c=2></a><p>&unknown;</p><!--');
  const indexes = messy.errors.map((item) => item.index);
  assert.deepEqual(indexes, [...indexes].sort((left, right) => left - right));
  assert.deepEqual(messy.errors.map((item) => item.code), [
    'missing-whitespace-between-attributes', 'invalid-character-reference', 'eof-in-comment',
  ]);

  for (const bad of [7, null, undefined, {}, [], true]) {
    assert.equal(code(() => tokenize(bad)), 'ERR_BAD_ARGUMENT');
  }
  assert.deepEqual(tokenize(''), { tokens: [{ type: 'eof' }], errors: [] });
});
