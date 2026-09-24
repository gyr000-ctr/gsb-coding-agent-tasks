import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from '../lib/tplate.js';
import { code } from './util.js';

test('三花括号和 {{&x}} 原样吐出来，不转义', () => {
  const data = { html: '<b class="x">a&b</b>' };
  assert.equal(render('{{html}}', data), '&lt;b class=&quot;x&quot;&gt;a&amp;b&lt;/b&gt;');
  assert.equal(render('{{{html}}}', data), '<b class="x">a&b</b>');
  assert.equal(render('{{&html}}', data), '<b class="x">a&b</b>');
  assert.equal(render('{{& html }}', data), '<b class="x">a&b</b>');
  assert.equal(render('{{&nope}}', {}), '');
});

test('反向 section：假值和空数组才渲染', () => {
  const template = '{{^items}}empty{{/items}}';
  assert.equal(render(template, { items: [] }), 'empty');
  assert.equal(render(template, { items: [1] }), '');
  assert.equal(render(template, {}), 'empty');
  assert.equal(render(template, { items: null }), 'empty');
  assert.equal(render(template, { items: false }), 'empty');
  assert.equal(render(template, { items: 0 }), 'empty');
  assert.equal(render(template, { items: '' }), 'empty');
  assert.equal(render('{{^items}}{{name}}{{/items}}', { items: 0, name: 'n' }), 'n');
  assert.equal(render('{{^a}}A{{/a}}{{#a}}B{{/a}}', { a: 'x' }), 'B');
});

test('点路径', () => {
  assert.equal(render('{{a.b.c}}', { a: { b: { c: 'deep' } } }), 'deep');
  assert.equal(render('{{a.b}}', { a: { b: 0 } }), '0');
  assert.equal(render('{{a.zz.b}}', { a: {} }), '');
  assert.equal(render('{{a.zz.b}}', { a: { zz: 3 }, b: 4 }), '');
  assert.equal(render('{{#x}}{{a.b}}{{/x}}', { a: { b: 'outer' }, x: {} }), 'outer');
  assert.equal(render('{{#x}}{{a.b}}{{/x}}', { a: { b: 'outer' }, x: { a: { b: 'inner' } } }), 'inner');
  assert.equal(render('{{#x}}{{a.b}}{{/x}}', { a: { b: 'outer' }, x: { a: {} } }), '');
  assert.equal(render('{{a.b}}', { a: [1, 2] }), '');
});

test('片段：基本、嵌套与找不到就空着', () => {
  const partials = { row: '<li>{{name}}</li>' };
  assert.equal(render('<ul>{{#items}}{{> row}}{{/items}}</ul>',
    { items: [{ name: 'a' }, { name: 'b' }] }, { partials }), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(render('A{{> nope}}B', {}, { partials }), 'AB');
  assert.equal(render('A{{> nope}}B', {}), 'AB');
  assert.equal(render('{{> outer}}', { v: 'x' },
    { partials: { outer: '[{{> inner}}]', inner: '{{v}}' } }), '[x]');
  assert.equal(render('{{> row}}', { name: 'n' }, { partials }), '<li>n</li>');
});

test('片段的缩进会贴到每一行上', () => {
  assert.equal(render('A\n  {{> p}}\nB\n', {}, { partials: { p: 'l1\nl2' } }), 'A\n  l1\n  l2B\n');
  assert.equal(render('A\n  {{> p}}\nB\n', {}, { partials: { p: 'only\n' } }), 'A\n  only\nB\n');
  assert.equal(render('A\n{{> p}}\nB\n', {}, { partials: { p: 'x\ny\n' } }), 'A\nx\ny\nB\n');
  assert.equal(render('A {{> p}} B', {}, { partials: { p: 'p\nq' } }), 'A p\nq B');
  assert.equal(render('{{#items}}\n  {{> row}}\n{{/items}}',
    { items: [{ n: 1 }, { n: 2 }] }, { partials: { row: '{{n}}\n' } }), '  1\n  2\n');
});

test('独立成行的结构标签，整行连换行一起删掉', () => {
  assert.equal(render('{{#a}}\nX\n{{/a}}\n', { a: true }), 'X\n');
  assert.equal(render('start\n  {{#a}}\n  X\n  {{/a}}\nend\n', { a: true }), 'start\n  X\nend\n');
  assert.equal(render('{{^a}}\nempty\n{{/a}}\n', { a: [] }), 'empty\n');
  assert.equal(render('a\n{{! 注释 }}\nb', {}), 'a\nb');
  assert.equal(render('a\n  {{! 注释 }}', {}), 'a\n');
  assert.equal(render('a\n{{! 注释 }}', {}), 'a\n');
  assert.equal(render('{{! 注释 }}\nb', {}), 'b');
});

test('值标签和「一行里还有别的东西」都不算独立行', () => {
  assert.equal(render('a\n  {{v}}\n', { v: 'X' }), 'a\n  X\n');
  assert.equal(render('a\n  x{{v}}y\n', { v: 'X' }), 'a\n  xXy\n');
  assert.equal(render('x {{!c}} y', {}), 'x  y');
  assert.equal(render('  {{#a}}inline{{/a}}  \n', { a: true }), '  inline  \n');
  assert.equal(render('{{#a}}X{{/a}}\n', { a: true }), 'X\n');
});

test('这一版新加的东西写坏了也报 ERR_BAD_TEMPLATE', () => {
  assert.equal(code(() => render('{{{v}}', { v: 1 })), 'ERR_BAD_TEMPLATE');
  assert.equal(code(() => render('{{&}}', {})), 'ERR_BAD_TEMPLATE');
  assert.equal(code(() => render('{{> }}', {})), 'ERR_BAD_TEMPLATE');
  assert.equal(code(() => render('{{> a b}}', {})), 'ERR_BAD_TEMPLATE');
  assert.equal(code(() => render('{{^a}}{{/b}}', { a: 1 })), 'ERR_BAD_TEMPLATE');
  assert.equal(code(() => render('{{^a}}x', { a: 1 })), 'ERR_BAD_TEMPLATE');
});

test('partials 自己的入参口径', () => {
  assert.equal(code(() => render('{{v}}', {}, { partials: 7 })), 'ERR_BAD_ARGUMENT');
  assert.equal(code(() => render('{{v}}', {}, { partials: [] })), 'ERR_BAD_ARGUMENT');
  assert.equal(code(() => render('{{v}}', {}, { partials: { p: 7 } })), 'ERR_BAD_ARGUMENT');
  assert.equal(code(() => render('{{v}}', {}, 'x')), 'ERR_BAD_ARGUMENT');
  assert.equal(render('{{v}}', { v: 'x' }, {}), 'x');
});