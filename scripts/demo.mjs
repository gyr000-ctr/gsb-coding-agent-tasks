import { createHll } from '../lib/hllset.js';

const line = (label, value) => console.log(`  ${label} ${value}`);

console.log('hllset demo');

const hll = createHll({ precision: 14 });
line('empty.count', hll.count());
line('empty.form', hll.representation());
line('add.alpha', hll.add('alpha'));
line('add.alpha.again', hll.add('alpha'));

for (let i = 0; i < 10000; i += 1) hll.add(`user:${i}`);
line('users.count', hll.count());
line('users.form', hll.representation());

const other = createHll({ precision: 14 });
for (let i = 5000; i < 15000; i += 1) other.add(`user:${i}`);
line('other.count', other.count());
line('merge.changed', hll.merge(other));
line('merged.count', hll.count());
line('merged.form', hll.representation());

const tiny = createHll({ precision: 10, sparseLimit: 50 });
for (let i = 0; i < 5; i += 1) tiny.add(`few:${i}`);
line('tiny.form', tiny.representation());
for (let i = 0; i < 400; i += 1) tiny.add(`e:${i}`);
line('tiny.formAfter', tiny.representation());
line('tiny.count', tiny.count());

try {
  hll.merge(createHll({ precision: 12 }));
} catch (err) {
  line('mismatch.code', err.code);
}

try {
  hll.add(42);
} catch (err) {
  line('badValue.code', err.code);
}