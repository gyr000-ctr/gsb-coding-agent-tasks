import test from 'node:test';
import assert from 'node:assert/strict';
import { createPager } from '../lib/pager.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const ROW = { id: 'r1', score: 10, name: 'b' };

const pagerAt = (ms = NOW, extra = {}) =>
  createPager({ key: 'secret', sort: [{ field: 'score', direction: 'desc' }, { field: 'name' }], clock: () => ms, ...extra });

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

test('配置不合法就拒掉', () => {
  const bad = [
    { sort: [{ field: 'a' }] },
    { key: '' },
    { key: 'k', sort: [] },
    { key: 'k', sort: 'a' },
    { key: 'k', sort: [{ field: '' }] },
    { key: 'k', sort: [{ field: 'a', direction: 'up' }] },
    { key: 'k', sort: [{ field: 'a' }, { field: 'a' }] },
    { key: 'k', sort: [{ field: 'id' }] },
    { key: 'k', sort: [{ field: 'a' }], filter: 'nope' },
    { key: 'k', sort: [{ field: 'a' }], ttlMs: 0 },
    { key: 'k', sort: [{ field: 'a' }], defaultLimit: 30, maxLimit: 20 },
  ];
  for (const config of bad) expectError(() => createPager(config), 'ERR_BAD_CONFIG');
});

test('游标里存的是排序键值和 id，还有签发时间', () => {
  const pager = pagerAt();
  const decoded = pager.decode(pager.cursorFor(ROW));
  assert.equal(decoded.id, 'r1');
  assert.equal(decoded.at, NOW);
  assert.equal(decoded.expiresAt, NOW + 300000);
  assert.deepEqual(decoded.position, { values: [10, 'b'], id: 'r1' });
  assert.deepEqual(pager.sort(), [{ field: 'score', direction: 'desc' }, { field: 'name', direction: 'asc' }]);
});

test('缺省值按 null 存档，取回来也一样', () => {
  const pager = pagerAt();
  const decoded = pager.decode(pager.cursorFor({ id: 'r5', score: 1 }));
  assert.deepEqual(decoded.position.values, [1, null]);
});

test('游标过期按 ttlMs 算，边界那一毫秒还能用', () => {
  const cursor = pagerAt().cursorFor(ROW);
  assert.equal(pagerAt(NOW + 300000).decode(cursor).id, 'r1');
  expectError(() => pagerAt(NOW + 300001).decode(cursor), 'ERR_EXPIRED');
  assert.equal(pagerAt(NOW, { ttlMs: 1000 }).decode(pagerAt(NOW).cursorFor(ROW)).id, 'r1');
});

test('改一个字符、换一把钥匙都验不过', () => {
  const cursor = pagerAt().cursorFor(ROW);
  const [text, signature] = cursor.split('.');
  const flipped = `${text.slice(0, -1)}${text.endsWith('A') ? 'B' : 'A'}.${signature}`;
  expectError(() => pagerAt().decode(flipped), 'ERR_BAD_CURSOR');
  const otherKey = createPager({ key: 'other', sort: [{ field: 'score' }], clock: () => NOW });
  expectError(() => otherKey.decode(cursor), 'ERR_BAD_CURSOR');
  expectError(() => pagerAt().decode('not-a-cursor'), 'ERR_BAD_CURSOR');
  expectError(() => pagerAt().decode(''), 'ERR_BAD_CURSOR');
  expectError(() => pagerAt().decode(null), 'ERR_BAD_CURSOR');
});

test('排序规格不一样的分页器不认这个游标', () => {
  const cursor = pagerAt().cursorFor(ROW);
  const otherSort = createPager({ key: 'secret', sort: [{ field: 'name' }, { field: 'score' }], clock: () => NOW });
  expectError(() => otherSort.decode(cursor), 'ERR_BAD_CURSOR');
  const otherDirection = createPager({ key: 'secret', sort: [{ field: 'score' }, { field: 'name' }], clock: () => NOW });
  expectError(() => otherDirection.decode(cursor), 'ERR_BAD_CURSOR');
});
