import { compile } from '../lib/regexpx.js';

const line = (label, value) => console.log(`  ${label} ${value}`);
const show = (label, pattern, input) => {
  const found = compile(pattern).exec(input);
  line(label, found === null ? 'null' : JSON.stringify(found));
};

console.log('regexpx demo');
show('literal', 'abc', 'xxabcxx');
show('anchored', '^a\\w+$', 'abc_1');
show('class', '[a-c\\d]+', '--a1b2--');
show('greedy', '<.*>', '<a><b>');
show('lazy', '<.*?>', '<a><b>');
show('groups', '(\\w+)=(\\d+)', ' key=42; ');
show('backref', '(.)\\1', 'abbc');
show('alternation', 'cat|dog', 'a dog');
show('nomatch', 'xyz', 'abc');
line('test', compile('\\d+').test('a1'));
line('groupCount', compile('(a)(?:b)(c)').groupCount);

try {
  compile('(a');
} catch (err) {
  line('badPattern.code', err.code);
}

try {
  compile('(a*)(a*)(a*)(a*)b').exec('a'.repeat(40));
} catch (err) {
  line('blowup.code', err.code);
}