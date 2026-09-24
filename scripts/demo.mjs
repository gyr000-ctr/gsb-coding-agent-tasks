import { applyOps, diffLists } from '../lib/listdiff.js';

const line = (label, value) => console.log(`  ${label} ${value}`);
const show = (label, fn) => {
  try {
    line(label, JSON.stringify(fn()));
  } catch (err) {
    line(label, `${err.code} ${JSON.stringify(err.details)}`);
  }
};

const prev = [
  { id: 'a', title: 'A', pinned: false },
  { id: 'b', title: 'B', pinned: false },
  { id: 'c', title: 'C', pinned: false },
  { id: 'd', title: 'D', pinned: false },
];
const next = [
  { id: 'c', title: 'C', pinned: true },
  { id: 'a', title: 'A2', pinned: false },
  { id: 'e', title: 'E', pinned: false },
  { id: 'd', title: 'D', pinned: false },
];

console.log('listdiff demo');
const ops = diffLists(prev, next);
line('ops', JSON.stringify(ops));
line('count', JSON.stringify(ops.reduce((acc, op) => ({ ...acc, [op.op]: (acc[op.op] ?? 0) + 1 }), {})));
line('applied', JSON.stringify(applyOps(prev, ops)));
line('reorder', JSON.stringify(diffLists([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  [{ id: 'b' }, { id: 'a' }, { id: 'd' }, { id: 'c' }])));
line('noop', JSON.stringify(diffLists(prev, prev.map((item) => ({ ...item })))));
show('dup-key', () => diffLists([{ id: 'a' }, { id: 'a' }], []));
show('bad-op', () => applyOps(prev, [{ op: 'remove', key: 'b', index: 0 }]));
show('no-key', () => diffLists([{ title: 'x' }], []));
