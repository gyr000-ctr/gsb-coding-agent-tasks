import test from 'node:test';
import assert from 'node:assert/strict';

import { compile } from '../lib/regexpx.js';
import { jsExec, shape } from './util.js';

const exec = (pattern, input, options) => compile(pattern, options).exec(input);

test('无锚定时从最左的位置开始配', () => {
  assert.deepEqual(exec('abc', 'xxabcabcxx'), { index: 2, match: 'abc', groups: [] });
  assert.deepEqual(exec('abc', 'xxabcabcxx').index, 2);
  assert.equal(exec('abc', 'abd'), null);
  assert.deepEqual(exec('c', 'abc'), { index: 2, match: 'c', groups: [] });
  assert.deepEqual(exec('', 'abc'), { index: 0, match: '', groups: [] });
  assert.deepEqual(exec('', ''), { index: 0, match: '', groups: [] });
});

test('^ 和 $ 只认整串的开头和结尾', () => {
  assert.deepEqual(shape(exec('^ab', 'abc')), { index: 0, match: 'ab', groups: [] });
  assert.equal(exec('^b', 'abc'), null);
  assert.deepEqual(shape(exec('bc$', 'abc')), { index: 1, match: 'bc', groups: [] });
  assert.equal(exec('b$', 'abc'), null);
  assert.equal(exec('^abc$', 'abc\n'), null);
  assert.deepEqual(shape(exec('^$', '')), { index: 0, match: '', groups: [] });
  assert.deepEqual(shape(exec('b$', 'b\nb')), { index: 2, match: 'b', groups: [] });
  assert.equal(exec('b$', 'b\nb\n'), null);
});

test('字符类：范围、取反、简写、类里的转义', () => {
  assert.deepEqual(shape(exec('[a-c]+', 'zzabcab')), { index: 2, match: 'abcab', groups: [] });
  assert.deepEqual(shape(exec('[^a-c]+', 'abcxyzab')), { index: 3, match: 'xyz', groups: [] });
  assert.deepEqual(shape(exec('[\\d]+', 'ab1234cd')), { index: 2, match: '1234', groups: [] });
  assert.deepEqual(shape(exec('[\\w._-]+', '  a_b.c-d ')), { index: 2, match: 'a_b.c-d', groups: [] });
  assert.equal(exec('[]]+', 'x]]y'), null);
  assert.equal(exec('[]', 'x'), null);
  assert.deepEqual(shape(exec('[^]', 'x')), { index: 0, match: 'x', groups: [] });
  assert.deepEqual(shape(exec('[^]', '\n')), { index: 0, match: '\n', groups: [] });
  assert.deepEqual(shape(exec('[.]+', 'a.b')), { index: 1, match: '.', groups: [] });
  assert.deepEqual(shape(exec('[\\]]', 'a]b')), { index: 1, match: ']', groups: [] });
  assert.deepEqual(shape(exec('[\\n]', 'a\nb')), { index: 1, match: '\n', groups: [] });
  assert.equal(exec('.', '\n'), null);
});

test('量词：贪婪、非贪婪、区间与嵌套', () => {
  assert.deepEqual(shape(exec('a+', 'baaab')), { index: 1, match: 'aaa', groups: [] });
  assert.deepEqual(shape(exec('a+?', 'baaab')), { index: 1, match: 'a', groups: [] });
  assert.deepEqual(shape(exec('a*', 'bbb')), { index: 0, match: '', groups: [] });
  assert.deepEqual(shape(exec('<.*>', '<a><b>')), { index: 0, match: '<a><b>', groups: [] });
  assert.deepEqual(shape(exec('<.*?>', '<a><b>')), { index: 0, match: '<a>', groups: [] });
  assert.deepEqual(shape(exec('a{2}', 'aaaa')), { index: 0, match: 'aa', groups: [] });
  assert.deepEqual(shape(exec('a{2,}', 'aaaa')), { index: 0, match: 'aaaa', groups: [] });
  assert.deepEqual(shape(exec('a{2,3}', 'aaaaa')), { index: 0, match: 'aaa', groups: [] });
  assert.deepEqual(shape(exec('a{2,3}?', 'aaaaa')), { index: 0, match: 'aa', groups: [] });
  assert.deepEqual(shape(exec('(ab){2}', 'xababab')), { index: 1, match: 'abab', groups: ['ab'] });
  assert.deepEqual(shape(exec('(a|b)*?c', 'aabcc')), { index: 0, match: 'aabc', groups: ['b'] });
  assert.deepEqual(shape(exec('(?:ab)+c', 'zababc')), { index: 1, match: 'ababc', groups: [] });
});

test('分组与反向引用，没参与匹配的组是 undefined', () => {
  assert.deepEqual(shape(exec('(a)(b)(c)?', 'ab')), { index: 0, match: 'ab', groups: ['a', 'b', undefined] });
  assert.deepEqual(shape(exec('(a)(b)?c', 'ac')), { index: 0, match: 'ac', groups: ['a', undefined] });
  assert.deepEqual(shape(exec('(.)\\1', 'xabb')), { index: 2, match: 'bb', groups: ['b'] });
  assert.deepEqual(shape(exec('(ab)\\1', 'xabab')), { index: 1, match: 'abab', groups: ['ab'] });
  assert.equal(exec('(a)?b\\1', 'b'), null);
  assert.deepEqual(shape(exec('(a)?b\\1', 'aba')), { index: 0, match: 'aba', groups: ['a'] });
  assert.deepEqual(shape(exec('((a)|b)+', 'ab')), { index: 0, match: 'ab', groups: ['b', 'a'] });
  assert.deepEqual(shape(exec('a|ab', 'ab')), { index: 0, match: 'a', groups: [] });
  assert.deepEqual(shape(exec('(?:x)|(y)', 'y')), { index: 0, match: 'y', groups: ['y'] });
  assert.equal(compile('(a)').groupCount, 1);
  assert.equal(compile('(?:a)(b)(c)').groupCount, 2);
});

test('和 JS 自带的 RegExp 逐项对比', () => {
  const cases = [
    ['abc', 'xxabcyy'], ['a|ab', 'ab'], ['(a)(b)?c', 'ac'], ['a.c', 'abc'], ['^ab$', 'ab'],
    ['[^a-c]+', 'xyz'], ['\\d{2,3}', 'x1234'], ['(ab)+', 'ababx'], ['(a|b)*?c', 'aabcc'],
    ['\\w+', '  hello_world  '], ['a{2,}', 'aaaa'], ['(.)\\1', 'abb'], ['[\\d-]+', 'a1-2-3'],
    ['[a-c\\d]+', 'zz123abc'], ['(?:ab)+c', 'ababc'], ['a+?b', 'aaab'], ['(a+)(b+)', 'aabbb'],
    ['\\s+', 'a  b'], ['[.]', 'x'], ['\\.', 'a.b'], ['(a|b)+', 'abab'], ['[^\\d]+', '12ab34'],
    ['^(a|ab)c?', 'abc'], ['(a)(b)(c)?', 'ab'], ['(\\w+)@(\\w+)', 'mail: a_b@host!'],
    ['(ab)*', 'ababab'], ['[A-Za-z_]+', '9var_9'], ['a{2}b{1,2}', 'aabbb'], ['(x)?y', 'y'],
    ['(a+)+', 'aaa'], ['[^\\s]+', ' a b '], ['(.)(.)\\2\\1', 'abba'], ['\\w{3}\\d', 'abc7'],
    ['x*y*z', 'yyyz'], ['(a|(b))c', 'bc'],
  ];
  for (const [pattern, input] of cases) {
    const mine = shape(compile(pattern).exec(input));
    const theirs = jsExec(pattern, input);
    assert.deepEqual(mine, theirs, `/${pattern}/ 配 ${JSON.stringify(input)}`);
  }
});

test('exec 和 test 一致，而且同一个 compiled 反复用互不影响', () => {
  const compiled = compile('(\\w+)@(\\w+)');
  const first = compiled.exec('mail to: ab@cd or ef@gh');
  const second = compiled.exec('mail to: ab@cd or ef@gh');
  assert.deepEqual(first, second);
  assert.deepEqual(shape(first), { index: 9, match: 'ab@cd', groups: ['ab', 'cd'] });
  assert.deepEqual(shape(compiled.exec('no address here')), null);
  assert.equal(compiled.test('ab@cd'), true);
  assert.equal(compiled.test('nope'), false);
  assert.equal(compiled.source, '(\\w+)@(\\w+)');
});