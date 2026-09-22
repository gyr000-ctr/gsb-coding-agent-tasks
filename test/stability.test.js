import test from 'node:test';
import assert from 'node:assert/strict';
import { createPager } from '../lib/pager.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const pager = () =>
  createPager({ key: 'secret', sort: [{ field: 'score', direction: 'desc' }, { field: 'name' }], clock: () => NOW });

const base = [
  { id: 'r1', score: 10, name: 'b' },
  { id: 'r2', score: 10, name: 'a' },
  { id: 'r3', score: 9, name: 'c' },
  { id: 'r4', score: 9, name: 'c' },
  { id: 'r5', score: null, name: 'z' },
];

const ids = (page) => page.rows.map((row) => row.id);

test('游标之前插进来的行不会让后面的页重复', () => {
  const p = pager();
  const first = p.page({ rows: base, limit: 2 });
  const grown = [{ id: 'r0', score: 99, name: 'a' }, ...base];
  const second = p.page({ rows: grown, limit: 2, after: first.nextCursor });
  assert.deepEqual(ids(second), ['r3', 'r4']);
});

test('键值相同但 id 更小的行也算在游标之前', () => {
  const p = pager();
  const first = p.page({ rows: base, limit: 2 });
  const grown = [{ id: 'r0', score: 10, name: 'b' }, ...base];
  assert.deepEqual(ids(p.page({ rows: grown, limit: 2, after: first.nextCursor })), ['r3', 'r4']);
});

test('游标那一行被删掉了照样接着往下翻', () => {
  const p = pager();
  const first = p.page({ rows: base, limit: 2 });
  const withoutCursorRow = base.filter((row) => row.id !== 'r1');
  const second = p.page({ rows: withoutCursorRow, limit: 2, after: first.nextCursor });
  assert.deepEqual(ids(second), ['r3', 'r4']);
});

test('游标之后插进来的行会出现在后面的页里', () => {
  const p = pager();
  const first = p.page({ rows: base, limit: 2 });
  const grown = [...base, { id: 'r9', score: 9.5, name: 'b' }];
  const second = p.page({ rows: grown, limit: 2, after: first.nextCursor });
  assert.deepEqual(ids(second), ['r9', 'r3']);
  const third = p.page({ rows: grown, limit: 2, after: second.nextCursor });
  assert.deepEqual(ids(third), ['r4', 'r5']);
});

test('把整个集合删空就是空页', () => {
  const p = pager();
  const first = p.page({ rows: base, limit: 2 });
  const empty = p.page({ rows: [], after: first.nextCursor });
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.hasMore, false);
  assert.equal(empty.nextCursor, null);
  assert.equal(empty.total, 0);
});
