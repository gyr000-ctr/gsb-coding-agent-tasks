import test from 'node:test';
import assert from 'node:assert/strict';

import { parse } from '../lib/selmatch.js';
import { code, details } from './util.js';

const shape = (tag, id, classes, attrs, pseudos) => ({ tag, id, classes, attrs, pseudos });

test('解析：单个复合选择器与优先级', () => {
  assert.deepEqual(parse('div'), {
    groups: [{
      specificity: [0, 0, 1],
      parts: [{ combinator: null, compound: shape('div', null, [], [], []) }],
    }],
  });
  assert.deepEqual(parse('*').groups[0].parts[0].compound, shape(null, null, [], [], []));
  assert.deepEqual(parse('*').groups[0].specificity, [0, 0, 0]);
  assert.deepEqual(parse('#a.b[c]:first-child').groups[0].specificity, [1, 3, 0]);
  assert.deepEqual(parse('.a.b.c').groups[0].specificity, [0, 3, 0]);
  assert.deepEqual(parse('#a#b'.replace('#b', '.b')).groups[0].specificity, [1, 1, 0]);
  // 标签名、属性名统一小写，类名和属性值保持原样
  const mixed = parse('DIV.Hot[HREF="/X"]').groups[0].parts[0].compound;
  assert.deepEqual(mixed, shape('div', null, ['Hot'], [{ name: 'href', op: '=', value: '/X' }], []));
});

test('解析：组合子与选择器列表', () => {
  const { groups } = parse('ul.menu > li:nth-child(2n+1) ~ li[hidden], div *, p#x');
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].specificity, [0, 3, 3]);
  assert.deepEqual(groups[0].parts.map((part) => part.combinator), [null, 'child', 'sibling']);
  assert.deepEqual(groups[0].parts.map((part) => part.compound.tag), ['ul', 'li', 'li']);
  // 空白就是后代组合子，第一个 part 的组合子固定是 null
  assert.deepEqual(groups[1].parts.map((part) => part.combinator), [null, 'descendant']);
  assert.deepEqual(groups[1].specificity, [0, 0, 1]);
  assert.deepEqual(groups[2].specificity, [1, 0, 1]);
  // 显式组合子前后有没有空白都一样
  for (const text of ['a>b', 'a >b', 'a> b', 'a > b', 'a  b', 'a\n\tb']) {
    const parsed = parse(text);
    assert.deepEqual(parsed.groups[0].parts.map((part) => part.combinator),
      text.includes('>') ? [null, 'child'] : [null, 'descendant']);
  }
});

test('解析：属性选择器的六种比较', () => {
  assert.deepEqual(parse('[hidden]').groups[0].parts[0].compound.attrs, [{ name: 'hidden', op: null, value: null }]);
  assert.deepEqual(parse('[href="/a"]').groups[0].parts[0].compound.attrs, [{ name: 'href', op: '=', value: '/a' }]);
  assert.deepEqual(parse("[href='/a']").groups[0].parts[0].compound.attrs, [{ name: 'href', op: '=', value: '/a' }]);
  assert.deepEqual(parse('[href ^= "/a"]').groups[0].parts[0].compound.attrs, [{ name: 'href', op: '^=', value: '/a' }]);
  for (const [op, value] of [['~=', 'a'], ['^=', 'a'], ['$=', 'a'], ['*=', 'a'], ['|=', 'a'], ['=', 'a']]) {
    const compound = parse(`[x${op}${value}]`).groups[0].parts[0].compound;
    assert.deepEqual(compound.attrs, [{ name: 'x', op, value }]);
  }
  // 同一个复合选择器里的顺序照写下来的顺序记
  const many = parse('a[href][title][href^=x].b:first-child').groups[0].parts[0].compound;
  assert.deepEqual(many.attrs.map((attr) => attr.name), ['href', 'title', 'href']);
  assert.deepEqual(many.pseudos, [{ name: 'first-child', arg: null }]);
});

test('解析：nth 表达式', () => {
  const arg = (text) => parse(`:nth-child(${text})`).groups[0].parts[0].compound.pseudos[0].arg;
  assert.deepEqual(arg('odd'), { a: 2, b: 1 });
  assert.deepEqual(arg('EVEN'), { a: 2, b: 0 });
  assert.deepEqual(arg('3'), { a: 0, b: 3 });
  assert.deepEqual(arg('+5'), { a: 0, b: 5 });
  assert.deepEqual(arg('-2'), { a: 0, b: -2 });
  assert.deepEqual(arg('n'), { a: 1, b: 0 });
  assert.deepEqual(arg('2n'), { a: 2, b: 0 });
  assert.deepEqual(arg('-n+3'), { a: -1, b: 3 });
  assert.deepEqual(arg('n-1'), { a: 1, b: -1 });
  assert.deepEqual(arg(' 2n + 1 '), { a: 2, b: 1 });
  assert.deepEqual(parse(':nth-of-type(2n)').groups[0].parts[0].compound.pseudos,
    [{ name: 'nth-of-type', arg: { a: 2, b: 0 } }]);
  // :not 里只能放一个复合选择器，优先级算它自己的
  const not = parse(':not(.a#b) span');
  assert.deepEqual(not.groups[0].parts[0].compound.pseudos[0].name, 'not');
  assert.deepEqual(not.groups[0].parts[0].compound.pseudos[0].arg.tag, null);
  assert.deepEqual(not.groups[0].specificity, [1, 1, 1]);
});

test('解析：不合法的选择器都报 ERR_BAD_SELECTOR，位置是出问题的那个字符', () => {
  const cases = [
    ['', 0],
    ['   ', 0],
    [',a', 0],
    ['a,', 2],
    ['a,,b', 2],
    [']', 0],
    ['a %', 2],
    ['a > > b', 4],
    ['a >', 3],
    ['> a', 0],
    ['*div', 1],
    ['div.', 4],
    ['div#a#b', 5],
    [':hover', 1],
    [':nth-child()', 10],
    [':nth-child(2n+)', 10],
    [':nth-child(2n+1', 10],
    [':nth-child(n n)', 10],
    [':nth-of-type', 12],
    [':not()', 4],
    [':not(div p)', 4],
    ['[href', 0],
    ['[href=]', 6],
    ['[href="x]', 6],
    ['[href x]', 0],
    ['[data-x=1]', 8],
    ['a:first-child()', 13],
    ['a\x5cb', 1],
  ];
  for (const [text, position] of cases) {
    assert.equal(code(() => parse(text)), 'ERR_BAD_SELECTOR', `${text} 应该报错`);
    assert.deepEqual(details(() => parse(text)), { position }, `${text} 的位置应该是 ${position}`);
  }
  for (const value of [undefined, null, 7, [], {}, true, Symbol('s')]) {
    assert.equal(code(() => parse(value)), 'ERR_BAD_ARGUMENT');
  }
});

