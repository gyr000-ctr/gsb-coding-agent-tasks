import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from '../lib/tplate.js';
import { code } from './util.js';

test('插值：名字两边空白不算，缺失就是空串', () => {
  assert.equal(render('Hi {{name}}!', { name: 'Ada' }), 'Hi Ada!');
  assert.equal(render('Hi {{ name }}!', { name: 'Ada' }), 'Hi Ada!');
  assert.equal(render('[{{a}}][{{nope}}][{{deep.missing}}]', { a: 1 }), '[1][][]');
  assert.equal(render('{{n}}/{{b}}/{{z}}', { n: 42, b: false, z: 0 }), '42/false/0');
  assert.equal(render('{{v}}', { v: null }), '');
  assert.equal(render('没有标签', {}), '没有标签');
  assert.equal(render('', {}), '');
});

test('插值默认过 HTML 转义', () => {
  assert.equal(render('{{v}}', { v: '<b>&"\'</b>' }), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  assert.equal(render('a{{v}}b', { v: 'x<y>z' }), 'ax&lt;y&gt;zb');
});

test('section：数组逐项、对象换上下文、falsy 跳过', () => {
  assert.equal(render('{{#items}}[{{.}}]{{/items}}', { items: [1, 2, 3] }), '[1][2][3]');
  assert.equal(render('{{#items}}*{{/items}}', { items: [] }), '');
  assert.equal(render('{{#u}}{{name}}{{/u}}', { u: { name: 'BOB' } }), 'BOB');
  assert.equal(render('{{#u}}{{.}}{{/u}}', { u: 'scalar' }), 'scalar');
  assert.equal(render('{{#flag}}yes{{/flag}}', { flag: true }), 'yes');
  assert.equal(render('{{#flag}}yes{{/flag}}', { flag: false }), '');
  assert.equal(render('{{#missing}}yes{{/missing}}', {}), '');
  assert.equal(render('{{#zero}}yes{{/zero}}', { zero: 0 }), '');
  assert.equal(render('{{#items}}{{#inner}}{{v}}{{/inner}}{{/items}}',
    { items: [{ inner: { v: 'a' } }, { inner: { v: 'b' } }] }), 'ab');
});

test('上下文栈：里层找不到再往外找', () => {
  assert.equal(render('{{#u}}{{name}}-{{outer}}{{/u}}', { outer: 'O', u: { name: 'N' } }), 'N-O');
  assert.equal(render('{{#a}}{{#b}}{{top}}{{/b}}{{/a}}', { top: 'T', a: { b: {} } }), 'T');
  assert.equal(render('{{#a}}{{#b}}{{name}}{{/b}}{{/a}}', { name: 'outer', a: { b: { name: 'inner' } } }), 'inner');
});

test('注释标签不吐东西', () => {
  assert.equal(render('a{{! 随便写点什么 }}b', {}), 'ab');
  assert.equal(render('{{!只注释}}{{v}}', { v: 'x' }), 'x');
});

test('键名里可以有 - _ $，名字不合法就报错', () => {
  assert.equal(render('{{first-name}}/{{last_name}}/{{$x}}', { 'first-name': 'a', last_name: 'b', $x: 'c' }), 'a/b/c');
  for (const template of ['{{a b}}', '{{}}', '{{ }}', '{{#}}x{{/}}']) {
    assert.equal(code(() => render(template, {})), 'ERR_BAD_TEMPLATE', template);
  }
});

test('模板写坏了报 ERR_BAD_TEMPLATE', () => {
  assert.equal(code(() => render('{{v', {})), 'ERR_BAD_TEMPLATE');
  assert.equal(code(() => render('{{#a}}x', { a: 1 })), 'ERR_BAD_TEMPLATE');
  assert.equal(code(() => render('{{#a}}{{/b}}', { a: 1 })), 'ERR_BAD_TEMPLATE');
  assert.equal(code(() => render('{{/a}}', {})), 'ERR_BAD_TEMPLATE');
  assert.equal(code(() => render('{{#a}}{{#b}}{{/a}}{{/b}}', {})), 'ERR_BAD_TEMPLATE');
});

test('入参类型', () => {
  for (const template of [7, null, undefined, {}, [], true]) {
    assert.equal(code(() => render(template, {})), 'ERR_BAD_ARGUMENT');
  }
  for (const data of [7, null, undefined, 'x', true]) {
    assert.equal(code(() => render('{{v}}', data)), 'ERR_BAD_ARGUMENT');
  }
});

test('渲染不改动传进来的数据', () => {
  const data = { name: 'Ada', items: [{ n: 1 }, { n: 2 }] };
  const snapshot = JSON.stringify(data);
  assert.equal(render('{{name}}{{#items}}{{n}}{{/items}}', data), 'Ada12');
  assert.equal(JSON.stringify(data), snapshot);
});