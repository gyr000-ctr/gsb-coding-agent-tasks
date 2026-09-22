import { createPager } from '../lib/pager.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const config = {
  key: 'demo-key',
  sort: [{ field: 'score', direction: 'desc' }, { field: 'name' }],
  clock: () => NOW,
  defaultLimit: 3,
  maxLimit: 10,
};

const rows = [
  { id: 'u01', score: 92, name: 'an' },
  { id: 'u02', score: 88, name: 'bo' },
  { id: 'u03', score: 88, name: 'ai' },
  { id: 'u04', score: 75, name: 'cy' },
  { id: 'u05', score: 75, name: 'cy' },
  { id: 'u06', score: 61, name: 'de' },
  { id: 'u07', score: 61, name: 'di' },
  { id: 'u08', score: 40, name: 'ev' },
  { id: 'u09', score: 40, name: 'ez' },
  { id: 'u10', score: null, name: 'fa' },
  { id: 'u11', score: 30, name: 'go' },
  { id: 'u12', score: 20, name: 'ha' },
];

const ids = (page) => page.rows.map((row) => row.id).join(',');
const pager = createPager(config);

console.log('cursorkit demo');

console.log('[1] 第一页（score 降序、name 升序，键值一样按 id）');
const first = pager.page({ rows });
console.log(`    ${ids(first)} total=${first.total} hasMore=${first.hasMore}`);

console.log('[2] 第二页：只带游标，不带 offset');
const second = pager.page({ rows, after: first.nextCursor });
console.log(`    ${ids(second)} hasMore=${second.hasMore}`);
console.log(`    游标里存的是 score/name/id：${JSON.stringify(pager.decode(first.nextCursor).position)}`);

console.log('[3] 游标之前插进来一行 99 分，第二页不变');
const grown = [{ id: 'u00', score: 99, name: 'zz' }, ...rows];
console.log(`    ${ids(pager.page({ rows: grown, after: first.nextCursor }))}`);

console.log('[4] 把游标那一行删掉，第二页还是不变');
const shrunk = rows.filter((row) => row.id !== 'u02');
console.log(`    ${ids(pager.page({ rows: shrunk, after: first.nextCursor }))}`);

console.log('[5] 游标是签过名的，过期和篡改都能认出来');
const cursor = first.nextCursor;
const [text, signature] = cursor.split('.');
const flipped = `${text.slice(0, -1)}${text.endsWith('A') ? 'B' : 'A'}.${signature}`;
try {
  pager.page({ rows, after: flipped });
} catch (err) {
  console.log(`    改一个字符：${err.code}`);
}
const later = createPager({ ...config, clock: () => NOW + 300001 });
try {
  later.page({ rows, after: cursor });
} catch (err) {
  console.log(`    五分钟之后：${err.code}`);
}
