import test from 'node:test';
import assert from 'node:assert/strict';

import { compile } from '../lib/regexpx.js';
import { code, shape } from './util.js';

test('写坏的模式一律 ERR_BAD_PATTERN', () => {
  const broken = [
    '(', ')', 'a)', '(a', '[a', '[z-a]', '[\\d-x]', '[',
    '*a', '+', '?', 'a**', 'a+*', 'a*??', '{2}', 'a{', 'a{3,2}', 'a{2,',
    '\\q', '\\0', '\\1', '(a)\\2', 'a\\', '[\\q]', '(|',
  ];
  for (const pattern of broken) {
    assert.equal(code(() => compile(pattern)), 'ERR_BAD_PATTERN', `模式 ${JSON.stringify(pattern)}`);
  }
  // 这些是合法的，别跟着一起报错
  for (const pattern of ['', 'a', '(a)', '(?:a)', 'a|', '|a', '[]', '[^]', 'a{2,}', '\\d', '\\*', '[-a]', '[a-]']) {
    assert.equal(code(() => compile(pattern)), null, `模式 ${JSON.stringify(pattern)}`);
  }
});

test('模式和输入的类型检查', () => {
  for (const pattern of [7, null, undefined, {}, [], true]) {
    assert.equal(code(() => compile(pattern)), 'ERR_BAD_ARGUMENT');
  }
  for (const options of ['x', 7, [], true]) {
    assert.equal(code(() => compile('a', options)), 'ERR_BAD_ARGUMENT');
  }
  for (const maxSteps of [0, -1, 1.5, '100', true]) {
    assert.equal(code(() => compile('a', { maxSteps })), 'ERR_BAD_ARGUMENT');
  }
  const compiled = compile('a');
  for (const input of [7, null, undefined, {}, true]) {
    assert.equal(code(() => compiled.exec(input)), 'ERR_BAD_ARGUMENT');
    assert.equal(code(() => compiled.test(input)), 'ERR_BAD_ARGUMENT');
  }
});

test('回溯爆掉的时候要被步数预算拦住，正常模式不许误报', () => {
  const bomb = compile('(a*)(a*)(a*)(a*)b');
  assert.equal(code(() => bomb.exec('a'.repeat(40))), 'ERR_STEPS_EXCEEDED');
  assert.deepEqual(shape(compile('(a*)(a*)(a*)(a*)b').exec('a'.repeat(40) + 'b')), {
    index: 0, match: 'a'.repeat(40) + 'b', groups: ['a'.repeat(40), '', '', ''],
  });

  const tight = compile('(a|b)+c', { maxSteps: 20 });
  assert.equal(code(() => tight.exec('ab' + 'a'.repeat(60))), 'ERR_STEPS_EXCEEDED');
  assert.deepEqual(shape(tight.exec('abc')), { index: 0, match: 'abc', groups: ['b'] });

  const big = 'a'.repeat(5000) + 'b';
  assert.deepEqual(shape(compile('a*b').exec(big)), { index: 0, match: big, groups: [] });
  assert.deepEqual(shape(compile('(a|b)*c').exec(big.replace('b', 'c'))), {
    index: 0, match: big.replace('b', 'c'), groups: ['a'],
  });
});

test('零宽量词与空匹配不会转不出来', () => {
  assert.deepEqual(shape(compile('(a*)*').exec('b')), { index: 0, match: '', groups: [undefined] });
  assert.deepEqual(shape(compile('(a*)*').exec('bbb')), { index: 0, match: '', groups: [undefined] });
  assert.deepEqual(shape(compile('(a?)*b').exec('aab')), { index: 0, match: 'aab', groups: ['a'] });
  assert.deepEqual(shape(compile('(){0}').exec('')), { index: 0, match: '', groups: [undefined] });
  assert.deepEqual(shape(compile('(?:a*)*').exec('c')), { index: 0, match: '', groups: [] });
});

test('反向引用指向没参与的组时整条都配不上，但不报错', () => {
  assert.equal(compile('(a)?b\\1').exec('b'), null);
  assert.equal(compile('(x)|y\\1').exec('y'), null);
  assert.deepEqual(shape(compile('(x)|y\\1').exec('yx')), { index: 1, match: 'x', groups: ['x'] });
  assert.deepEqual(shape(compile('(a)?b\\1').exec('aba')), { index: 0, match: 'aba', groups: ['a'] });
});