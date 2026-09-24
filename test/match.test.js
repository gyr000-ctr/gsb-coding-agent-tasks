import test from 'node:test';
import assert from 'node:assert/strict';

import { queryAll } from '../lib/selmatch.js';
import { code, h, ids, preorder, t, tags, tree } from './util.js';

const pick = (root, selector) => ids(queryAll(root, selector));

test('基础：标签、类、id 与通配', () => {
  const root = tree();
  assert.deepEqual(pick(root, '*'), ['lead', 'list', 'a', 'b', 'link', 'c', 'tail']);
  assert.deepEqual(pick(root, 'li'), ['a', 'b', 'c']);
  assert.deepEqual(pick(root, '.item'), ['a', 'b', 'c']);
  assert.deepEqual(pick(root, '.hot'), ['a', 'c']);
  assert.deepEqual(pick(root, '#list'), ['list']);
  assert.deepEqual(pick(root, 'li.hot.item'), ['a', 'c']);
  assert.deepEqual(pick(root, 'ul#list.menu'), ['list']);
  assert.deepEqual(pick(root, 'li.hot.item#b'), []);
  // 类名按空白切成词，连着的整体不算
  assert.deepEqual(pick(root, '.ite'), []);
  // 通配和复合一起用
  assert.deepEqual(pick(root, '*.hot'), ['a', 'c']);
  // 标签名大小写不敏感，类名和 id 敏感
  const wrapper = h('section', {}, h('DIV', { 'DATA-X': '1', class: 'Hot' }, h('SPAN')));
  assert.deepEqual(tags(queryAll(wrapper, 'div[data-x]')), ['DIV']);
  assert.deepEqual(tags(queryAll(wrapper, '.Hot')), ['DIV']);
  assert.deepEqual(queryAll(wrapper, '.hot'), []);
});

test('属性选择器的六种比较', () => {
  const root = tree();
  assert.deepEqual(pick(root, '[hidden]'), ['c']);
  assert.deepEqual(pick(root, '[data-kind]'), ['list', 'link']);
  assert.deepEqual(pick(root, '[data-kind=nav]'), ['list']);
  assert.deepEqual(pick(root, '[data-kind^=na]'), ['list']);
  assert.deepEqual(pick(root, '[data-kind$=y]'), ['link']);
  assert.deepEqual(pick(root, '[data-kind*=x-]'), ['link']);
  assert.deepEqual(pick(root, '[data-kind|=x]'), ['link']);
  assert.deepEqual(pick(root, '[data-kind|=nav]'), ['list']);
  assert.deepEqual(pick(root, '[data-kind~=nav]'), ['list']);
  assert.deepEqual(pick(root, '[class~=item]'), ['a', 'b', 'c']);
  assert.deepEqual(pick(root, '[href="/b"]'), ['link']);
  // 整体相等跟按词相等不是一回事
  assert.deepEqual(pick(root, '[class=item]'), ['b']);
  assert.deepEqual(pick(root, '[class="item hot"]'), ['a', 'c']);
  // 空值一律不匹配
  assert.deepEqual(pick(root, '[class~=""]'), []);
  assert.deepEqual(pick(root, '[href^=""]'), []);
  assert.deepEqual(pick(root, '[href*=""]'), []);
  // 属性名大小写不敏感
  assert.deepEqual(pick(root, '[HIDDEN]'), ['c']);
});

test('组合子：后代、子、相邻与一般兄弟', () => {
  const root = tree();
  assert.deepEqual(pick(root, 'ul li'), ['a', 'b', 'c']);
  assert.deepEqual(pick(root, 'ul > li'), ['a', 'b', 'c']);
  assert.deepEqual(pick(root, 'div li'), ['a', 'b', 'c']);
  assert.deepEqual(pick(root, 'div > li'), []);
  assert.deepEqual(pick(root, 'li a'), ['link']);
  assert.deepEqual(pick(root, 'li > a'), ['link']);
  assert.deepEqual(pick(root, 'ul > a'), []);
  // 相邻兄弟中间隔了文本节点也算相邻
  assert.deepEqual(pick(root, 'li + li'), ['b', 'c']);
  assert.deepEqual(pick(root, 'li ~ li'), ['b', 'c']);
  assert.deepEqual(pick(root, 'p + ul'), ['list']);
  assert.deepEqual(pick(root, 'ul + p'), ['tail']);
  assert.deepEqual(pick(root, 'p ~ p'), ['tail']);
  assert.deepEqual(pick(root, '#list ~ p'), ['tail']);
  assert.deepEqual(pick(root, '#lead + p'), []);
  // 查询根本身也算祖先，根不参与命中
  const list = queryAll(root, '#list')[0];
  assert.deepEqual(pick(list, 'ul > li'), ['a', 'b', 'c']);
  assert.deepEqual(pick(list, 'li + li'), ['b', 'c']);
  assert.deepEqual(pick(root, '#root'), []);
  assert.deepEqual(pick(root, 'div'), []);
  assert.deepEqual(pick(root, 'div > *'), ['lead', 'list', 'tail']);
  // 子组合子是后代组合子的子集
  const children = queryAll(root, 'ul > li');
  for (const node of children) assert.ok(queryAll(root, 'ul li').includes(node));
});

test('伪类：first / last / nth-child / nth-of-type / not', () => {
  const root = tree();
  assert.deepEqual(pick(root, 'li:nth-child(1)'), ['a']);
  assert.deepEqual(pick(root, 'li:nth-child(2)'), ['b']);
  assert.deepEqual(pick(root, 'li:nth-child(3)'), ['c']);
  assert.deepEqual(pick(root, 'li:nth-child(0)'), []);
  assert.deepEqual(pick(root, 'li:nth-child(odd)'), ['a', 'c']);
  assert.deepEqual(pick(root, 'li:nth-child(even)'), ['b']);
  assert.deepEqual(pick(root, 'li:nth-child(2n+1)'), ['a', 'c']);
  assert.deepEqual(pick(root, 'li:nth-child(-n+2)'), ['a', 'b']);
  assert.deepEqual(pick(root, 'li:nth-child(n+2)'), ['b', 'c']);
  assert.deepEqual(pick(root, 'li:first-child'), ['a']);
  assert.deepEqual(pick(root, 'li:last-child'), ['c']);
  assert.deepEqual(pick(root, 'p:first-child'), ['lead']);
  assert.deepEqual(pick(root, 'p:last-child'), ['tail']);
  assert.deepEqual(pick(root, 'p:nth-of-type(1)'), ['lead']);
  assert.deepEqual(pick(root, 'p:nth-of-type(2)'), ['tail']);
  assert.deepEqual(pick(root, 'li:nth-of-type(2)'), ['b']);
  assert.deepEqual(pick(root, ':first-child'), ['lead', 'a', 'link']);
  assert.deepEqual(pick(root, ':last-child'), ['link', 'c', 'tail']);
  assert.deepEqual(pick(root, ':not(.hot)'), ['lead', 'list', 'b', 'link', 'tail']);
  assert.deepEqual(pick(root, 'li:not(.hot)'), ['b']);
  assert.deepEqual(pick(root, 'li:not(:first-child)'), ['b', 'c']);
  assert.deepEqual(pick(root, ':not(:nth-child(1))'), ['list', 'b', 'c', 'tail']);
  assert.deepEqual(pick(root, 'ul :not(li)'), ['link']);
  assert.deepEqual(pick(root, ':not(:not(.hot))'), ['a', 'c']);
});

test('queryAll：文档顺序、命中多个组也只出现一次', () => {
  const root = tree();
  assert.deepEqual(pick(root, 'li, .hot'), ['a', 'b', 'c']);
  assert.deepEqual(pick(root, '.hot, #leaderless'), ['a', 'c']);
  assert.deepEqual(pick(root, 'p, ul, li, a'), ['lead', 'list', 'a', 'b', 'link', 'c', 'tail']);
  assert.deepEqual(pick(root, '#tail, #lead'), ['lead', 'tail']);
  // 和拍平出来的元素顺序一模一样
  assert.deepEqual(queryAll(root, '*'), preorder(root));
  // :not 就是补集（拿一个复合选择器试）
  const all = queryAll(root, '*');
  const without = all.filter((node) => !queryAll(root, '.hot').includes(node));
  assert.deepEqual(queryAll(root, ':not(.hot)'), without);
  // 写两次等价于写一次
  assert.deepEqual(queryAll(root, 'li.hot, li.hot'), queryAll(root, 'li.hot'));
});

test('入参：坏的 root 与坏的选择器', () => {
  const root = tree();
  for (const value of [null, 7, 'x', true, undefined]) {
    assert.equal(code(() => queryAll(value, 'li')), 'ERR_BAD_ARGUMENT');
  }
  for (const selector of [undefined, null, 7, 'li >> a', 'a:wrong', '', 'li, ']) {
    assert.equal(code(() => queryAll(root, selector)), selector === undefined || selector === null || selector === 7 ? 'ERR_BAD_ARGUMENT' : 'ERR_BAD_SELECTOR');
  }
});
