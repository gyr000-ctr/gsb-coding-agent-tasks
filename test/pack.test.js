import test from 'node:test';
import assert from 'node:assert/strict';

import { packBins } from '../lib/binpack.js';
import { items, shape } from './util.js';

test('first-fit：见缝就放，一个都放不下才开新箱', () => {
  const load = items(['a', 3], ['b', 3], ['c', 7], ['d', 3], ['e', 1]);
  assert.deepEqual(shape(packBins(load, { capacity: 10 })), {
    bins: [[0, 10, ['a', 'b', 'd', 'e']], [1, 7, ['c']]],
    unplaced: [],
  });
  // 箱子下标从 0 连着来，箱子里的 id 按放进来的先后排
  const bins = packBins(load, { capacity: 10 }).bins;
  assert.deepEqual(bins.map((bin) => bin.index), [0, 1]);
  assert.deepEqual(bins.flatMap((bin) => bin.items), ['a', 'b', 'd', 'e', 'c']);
});

test('best-fit：挑放进去剩得最少的箱子，平手挑下标小的', () => {
  const load = items(['a', 3], ['b', 3], ['c', 7], ['d', 3], ['e', 1]);
  assert.deepEqual(shape(packBins(load, { capacity: 10, algorithm: 'best-fit' })), {
    bins: [[0, 7, ['a', 'b', 'e']], [1, 10, ['c', 'd']]],
    unplaced: [],
  });
  // 两个箱子各剩 4，挑下标小的那个
  const tied = items(['p', 6], ['q', 6], ['r', 3], ['s', 3]);
  assert.deepEqual(shape(packBins(tied, { capacity: 10, algorithm: 'best-fit' })), {
    bins: [[0, 9, ['p', 'r']], [1, 9, ['q', 's']]],
    unplaced: [],
  });
});

test('worst-fit：挑放进去剩得最多的箱子', () => {
  const load = items(['a', 3], ['b', 3], ['c', 7], ['d', 3], ['e', 1]);
  assert.deepEqual(shape(packBins(load, { capacity: 10, algorithm: 'worst-fit' })), {
    bins: [[0, 9, ['a', 'b', 'd']], [1, 8, ['c', 'e']]],
    unplaced: [],
  });
});

test('best-fit-decreasing：先按重量从大到小排，再走 best-fit', () => {
  const load = items(['p', 2], ['q', 5], ['r', 4], ['s', 7], ['t', 1], ['u', 3], ['v', 8]);
  // 原样走 first-fit 要 4 箱
  assert.deepEqual(shape(packBins(load, { capacity: 10 })), {
    bins: [[0, 8, ['p', 'q', 't']], [1, 7, ['r', 'u']], [2, 7, ['s']], [3, 8, ['v']]],
    unplaced: [],
  });
  // 先排再装，3 箱就够
  assert.deepEqual(shape(packBins(load, { capacity: 10, algorithm: 'best-fit-decreasing' })), {
    bins: [[0, 10, ['v', 'p']], [1, 10, ['s', 'u']], [2, 10, ['q', 'r', 't']]],
    unplaced: [],
  });
  // 一样重的保持原来的先后
  const same = items(['x', 4], ['y', 4], ['z', 2]);
  assert.deepEqual(shape(packBins(same, { capacity: 8, algorithm: 'best-fit-decreasing' })), {
    bins: [[0, 8, ['x', 'y']], [1, 2, ['z']]],
    unplaced: [],
  });
});

test('maxBins 卡住以后，放不下的进 unplaced', () => {
  const load = items(['p', 2], ['q', 5], ['r', 4], ['s', 7], ['t', 1], ['u', 3], ['v', 8]);
  assert.deepEqual(shape(packBins(load, { capacity: 10, maxBins: 2 })), {
    bins: [[0, 8, ['p', 'q', 't']], [1, 7, ['r', 'u']]],
    unplaced: ['s', 'v'],
  });
  // 先排序再卡箱子，被挤掉的还是按放进来的顺序排
  assert.deepEqual(shape(packBins(load, { capacity: 10, algorithm: 'best-fit-decreasing', maxBins: 2 })), {
    bins: [[0, 10, ['v', 'p']], [1, 10, ['s', 'u']]],
    unplaced: ['q', 'r', 't'],
  });
  // maxBins 给够等于不卡
  assert.deepEqual(packBins(load, { capacity: 10, maxBins: 9 }), packBins(load, { capacity: 10 }));
});
