import test from 'node:test';
import assert from 'node:assert/strict';

import { packBins } from '../lib/binpack.js';
import { code, details, items, mulberry32 } from './util.js';

test('空单子、刚好装满、一人一箱', () => {
  assert.deepEqual(packBins([], { capacity: 4 }), { bins: [], unplaced: [] });
  assert.deepEqual(packBins(items(['only', 4]), { capacity: 4 }), {
    bins: [{ index: 0, used: 4, items: ['only'] }],
    unplaced: [],
  });
  assert.deepEqual(packBins(items(['a', 5], ['b', 5]), { capacity: 5 }).bins.map((bin) => bin.items),
    [['a'], ['b']]);
});

test('单件就超容量的要报错', () => {
  assert.equal(code(() => packBins(items(['x', 5]), { capacity: 4 })), 'ERR_BAD_ARGUMENT');
  assert.deepEqual(details(() => packBins(items(['x', 5]), { capacity: 4 })), { capacity: 4 });
  // 刚好等于容量是合法的
  assert.equal(code(() => packBins(items(['x', 4]), { capacity: 4 })), null);
});

test('算法名不认识就报 ERR_BAD_ALGORITHM', () => {
  assert.equal(code(() => packBins([], { capacity: 4, algorithm: 'next-fit' })), 'ERR_BAD_ALGORITHM');
  assert.deepEqual(details(() => packBins([], { capacity: 4, algorithm: 'next-fit' })), { algorithm: 'next-fit' });
  assert.deepEqual(code(() => packBins([], { capacity: 4, algorithm: 'FIRST-FIT' })), 'ERR_BAD_ALGORITHM');
  for (const algorithm of ['first-fit', 'best-fit', 'worst-fit', 'best-fit-decreasing']) {
    assert.equal(code(() => packBins([], { capacity: 4, algorithm })), null, algorithm);
  }
});

test('入参校验', () => {
  const bad = (list, options) => code(() => packBins(list, options));
  for (const options of [null, 7, 'x', [], true, { capacity: 0 }, { capacity: -1 }, { capacity: 2.5 },
    { capacity: '4' }, {}]) {
    assert.equal(bad(items(['a', 1]), options), 'ERR_BAD_ARGUMENT', JSON.stringify(options));
  }
  assert.equal(bad('x', { capacity: 4 }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad([1], { capacity: 4 }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad([{}], { capacity: 4 }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad([{ id: '', weight: 1 }], { capacity: 4 }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad([{ id: 7, weight: 1 }], { capacity: 4 }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad(items(['a', 1], ['a', 2]), { capacity: 4 }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad([{ id: 'a', weight: 0 }], { capacity: 4 }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad([{ id: 'a', weight: -1 }], { capacity: 4 }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad([{ id: 'a', weight: 1.5 }], { capacity: 4 }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad([{ id: 'a', weight: '1' }], { capacity: 4 }), 'ERR_BAD_ARGUMENT');
  assert.equal(bad([{ id: 'a' }], { capacity: 4 }), 'ERR_BAD_ARGUMENT');
  for (const maxBins of [0, -1, 1.5, '2']) {
    assert.equal(bad(items(['a', 1]), { capacity: 4, maxBins }), 'ERR_BAD_ARGUMENT', String(maxBins));
  }
  assert.equal(code(() => packBins(items(['a', 1]), { capacity: 4, maxBins: null })), null);
});

test('跟朴素模型对拍，结果还得是个划分', () => {
  const naive = (list, capacity) => {
    const bins = [];
    for (const item of list) {
      let target = -1;
      for (let at = 0; at < bins.length; at += 1) {
        const used = bins[at].reduce((sum, one) => sum + one.weight, 0);
        if (capacity - used >= item.weight) {
          target = at;
          break;
        }
      }
      if (target === -1) {
        bins.push([item]);
        continue;
      }
      bins[target].push(item);
    }
    return bins.map((bin, index) => ({
      index,
      used: bin.reduce((sum, one) => sum + one.weight, 0),
      items: bin.map((one) => one.id),
    }));
  };
  const random = mulberry32(20260924);
  for (let round = 0; round < 200; round += 1) {
    const capacity = 3 + Math.floor(random() * 10);
    const count = Math.floor(random() * 12);
    const list = [];
    for (let at = 0; at < count; at += 1) {
      list.push({ id: `i${at}`, weight: 1 + Math.floor(random() * capacity) });
    }
    const result = packBins(list, { capacity });
    assert.deepEqual(result.bins, naive(list, capacity), JSON.stringify(list));
    assert.deepEqual(result.unplaced, []);
    assert.deepEqual(result.bins.map((bin) => bin.index), result.bins.map((_, index) => index));
    assert.deepEqual(result.bins.flatMap((bin) => bin.items).sort(), list.map((item) => item.id).sort());
    for (const bin of result.bins) {
      const weight = list.filter((item) => bin.items.includes(item.id))
        .reduce((sum, item) => sum + item.weight, 0);
      assert.equal(bin.used, weight, JSON.stringify(bin));
      assert.ok(bin.used <= capacity);
    }
  }
});

test('正好一件都放不下时，maxBins 卡住的都在 unplaced 里', () => {
  const list = items(['a', 3], ['b', 3], ['c', 7], ['d', 3], ['e', 1]);
  const one = packBins(list, { capacity: 10, maxBins: 1 });
  assert.equal(one.bins.length, 1);
  assert.deepEqual(one.bins[0].items, ['a', 'b', 'd', 'e']);
  assert.deepEqual(one.unplaced, ['c']);
  const total = list.reduce((sum, item) => sum + item.weight, 0);
  const kept = one.bins.reduce((sum, bin) => sum + bin.used, 0);
  const lost = list.filter((item) => one.unplaced.includes(item.id))
    .reduce((sum, item) => sum + item.weight, 0);
  assert.equal(kept + lost, total);
});
