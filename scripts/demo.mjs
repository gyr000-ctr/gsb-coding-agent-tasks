import { parse, queryAll } from '../lib/selmatch.js';

const line = (label, value) => console.log(`  ${label} ${value}`);
const show = (label, fn) => {
  try {
    line(label, JSON.stringify(fn()));
  } catch (err) {
    line(label, `${err.code} ${JSON.stringify(err.details)}`);
  }
};
const names = (nodes) => nodes.map((node) => node.attrs.id ?? node.tag);

const tree = {
  tag: 'ul',
  attrs: { id: 'nav', class: 'menu' },
  children: [
    { tag: 'li', attrs: { id: 'a', class: 'item on' }, children: [{ tag: 'a', attrs: { id: 'link', href: '/a', 'data-kind': 'x-1' } }] },
    { tag: 'li', attrs: { id: 'b', class: 'item' }, children: [] },
    { tag: 'li', attrs: { id: 'c', class: 'item on', hidden: '' }, children: [] },
  ],
};

console.log('selmatch demo');
line('parse', JSON.stringify(parse('ul.menu > li:not(.on)[hidden]')));
line('specificity', JSON.stringify(parse('#nav li.item:first-child').groups[0].specificity));
line('on', JSON.stringify(names(queryAll(tree, '.on'))));
line('order', JSON.stringify(names(queryAll(tree, 'li, .on'))));
line('adjacent', JSON.stringify(names(queryAll(tree, 'li + li'))));
line('nth', JSON.stringify(names(queryAll(tree, 'li:nth-child(2n+1)'))));
line('attr', JSON.stringify(names(queryAll(tree, '[data-kind$="1"]'))));
line('none', JSON.stringify(names(queryAll(tree, 'ul > a'))));
line('dedup', JSON.stringify(names(queryAll(tree, '#c, .on, li'))));
show('bare-number', () => parse('[data-x=1]'));
show('typo', () => parse('li:wrong'));
show('empty', () => parse(''));
