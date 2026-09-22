import test from 'node:test';
import assert from 'node:assert/strict';
import { createPager } from '../lib/pager.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');

const pager = (extra = {}) =>
  createPager({ key: 'secret', sort: [{ field: 'score', direction: 'desc' }, { field: 'name' }], clock: () => NOW, ...extra });

const rows = [
  { id: 'r1', score: 10, name: 'b' },
  { id: 'r2', score: 10, name: 'a' },
  { id: 'r3', score: 9, name: 'c' },
  { id: 'r4', score: 9, name: 'c' },
  { id: 'r5', score: null, name: 'z' },
];

const ids = (page) => page.rows.map((row) => row.id);

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'PageError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('多键排序：数字降序、字符串升序，键值一样按 id 兜底', () => {
  const out = pager().page({ rows });
  assert.deepEqual(ids(out), ['r2', 'r1', 'r3', 'r4', 'r5']);
  assert.equal(out.total, 5);
  assert.equal(out.hasMore, false);
  assert.equal(out.nextCursor, null);
});

test('值的类型有固定先后：null 最前，然后数字、字符串、布尔', () => {
  const mixed = [
    { id: 'a', v: 2 },
    { id: 'b', v: null },
    { id: 'c', v: 'b' },
    { id: 'd', v: false },
    { id: 'e', v: 'a' },
    { id: 'f', v: true },
    { id: 'g', v: 1 },
  ];
  const out = createPager({ key: 'k', sort: [{ field: 'v' }], clock: () => NOW }).page({ rows: mixed });
  assert.deepEqual(ids(out), ['b', 'g', 'a', 'e', 'c', 'd', 'f']);
});

test('一页一页翻到底，游标只在还有下一页时给', () => {
  const p = pager();
  const first = p.page({ rows, limit: 2 });
  assert.deepEqual(ids(first), ['r2', 'r1']);
  assert.equal(first.hasMore, true);
  const second = p.page({ rows, limit: 2, after: first.nextCursor });
  assert.deepEqual(ids(second), ['r3', 'r4']);
  assert.equal(second.hasMore, true);
  const third = p.page({ rows, limit: 2, after: second.nextCursor });
  assert.deepEqual(ids(third), ['r5']);
  assert.equal(third.hasMore, false);
  assert.equal(third.nextCursor, null);
  assert.equal(p.page({ rows, limit: 2, after: third.nextCursor ?? second.nextCursor }).hasMore, false);
});

test('limit 校验和默认值', () => {
  const p = pager({ defaultLimit: 3, maxLimit: 5 });
  assert.equal(p.page({ rows }).rows.length, 3);
  assert.equal(p.page({ rows, limit: 5 }).rows.length, 5);
  for (const limit of [0, -1, 6, 1.5, '2']) {
    expectError(() => p.page({ rows, limit }), 'ERR_BAD_LIMIT');
  }
});

test('filter 在排序之前生效，total 是过滤之后的行数', () => {
  const p = pager({ filter: (row) => row.score !== null && row.score > 9 });
  const out = p.page({ rows });
  assert.deepEqual(ids(out), ['r2', 'r1']);
  assert.equal(out.total, 2);
});

test('行数据不合法时报哪个码', () => {
  const p = pager();
  expectError(() => p.page({}), 'ERR_BAD_ROW');
  expectError(() => p.page({ rows: [null] }), 'ERR_BAD_ROW');
  expectError(() => p.page({ rows: [{ score: 1 }] }), 'ERR_BAD_ROW');
  expectError(() => p.page({ rows: [{ id: '' }] }), 'ERR_BAD_ROW');
  expectError(() => p.page({ rows: [{ id: 'a' }, { id: 'a' }] }), 'ERR_BAD_ROW');
  expectError(() => p.page({ rows: [{ id: 'a', score: {} }] }), 'ERR_BAD_ROW');
  expectError(() => p.page({ rows: [{ id: 'a', score: [] }] }), 'ERR_BAD_ROW');
});
