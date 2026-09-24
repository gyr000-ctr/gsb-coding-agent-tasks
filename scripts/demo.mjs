import { render } from '../lib/tplate.js';

const line = (label, value) => console.log(`  ${label} ${value}`);

console.log('tplate demo');

const page = [
  '<h1>{{title}}</h1>',
  '{{#items}}',
  '  {{> row}}',
  '{{/items}}',
  '{{^items}}',
  '  <p>empty</p>',
  '{{/items}}',
  '{{! 签名 }}',
  '<footer>{{user.name}}</footer>',
].join('\n');

const partials = { row: '<li>{{.}}</li>\n' };

line('page', JSON.stringify(render(page,
  { title: 'A&B', items: ['x', 'y'], user: { name: 'Ada' } }, { partials })));
line('emptyList', JSON.stringify(render(page,
  { title: 't', items: [], user: { name: 'Ada' } }, { partials })));
line('escaped', JSON.stringify(render('{{h}} / {{{h}}}', { h: '<i>' })));
line('dotted', JSON.stringify(render('{{a.b.c}}', { a: { b: { c: 42 } } })));
line('missing', JSON.stringify(render('[{{nope}}][{{a.zz}}]', { a: {} })));

try {
  render('{{#a}}x', { a: 1 });
} catch (err) {
  line('badTemplate.code', err.code);
}

try {
  render('{{v}}', 7);
} catch (err) {
  line('badArgument.code', err.code);
}