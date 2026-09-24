import test from 'node:test';
import assert from 'node:assert/strict';

import { simulate } from '../lib/realtime.js';
import { code, shape } from './util.js';

test('按绝对截止期挑活干，被更急的作业打断就换人', () => {
  const plan = simulate({ tasks: [
    { id: 'scan', period: 4, cost: 1 },
    { id: 'flush', period: 6, cost: 2 },
    { id: 'ping', period: 12, cost: 3 },
  ] });
  // ping 在 3 号格子上开了个头，4 号格子 scan 一到就把它挤下去，5 号再接着跑
  assert.deepEqual(shape(plan),
    ['scan[0,1)', 'flush[1,3)', 'ping[3,4)', 'scan[4,5)', 'ping[5,6)',
      'flush[6,8)', 'ping[8,9)', 'scan[9,10)']);
  assert.deepEqual(plan.idle, [{ from: 10, to: 12 }]);
  assert.deepEqual(plan.misses, []);
  assert.deepEqual(plan.stats, { ticks: 12, busy: 10, idle: 2, missed: 0 });
});

test('正好跑满的时候一格空闲都不该有，也不会误期', () => {
  const tasks = [
    { id: 'a', period: 2, cost: 1 },
    { id: 'b', period: 3, cost: 1 },
    { id: 'c', period: 6, cost: 1 },
  ];
  const plan = simulate({ tasks });
  assert.deepEqual(shape(plan).slice(0, 6),
    ['a[0,1)', 'b[1,2)', 'a[2,3)', 'b[3,4)', 'a[4,5)', 'c[5,6)']);
  assert.deepEqual(plan.idle, []);
  assert.deepEqual(plan.misses, []);
  assert.deepEqual(plan.stats, { ticks: 6, busy: 6, idle: 0, missed: 0 });
});

test('截止期一样的时候按任务 id 的字典序排', () => {
  const plan = simulate({ tasks: [
    { id: 'b', period: 4, cost: 1 },
    { id: 'a', period: 4, cost: 1 },
  ] });
  assert.deepEqual(shape(plan), ['a[0,1)', 'b[1,2)']);
  assert.deepEqual(plan.idle, [{ from: 2, to: 4 }]);
});

test('挤不下就误期，误掉的那个直接丢掉不再补', () => {
  const plan = simulate({ tasks: [
    { id: 'x', period: 4, cost: 2 },
    { id: 'y', period: 4, cost: 2 },
    { id: 'z', period: 4, cost: 1 },
  ], until: 12 });
  assert.deepEqual(plan.misses, [
    { taskId: 'z', release: 0, deadline: 4, missedAt: 4, remaining: 1 },
    { taskId: 'z', release: 4, deadline: 8, missedAt: 8, remaining: 1 },
    { taskId: 'z', release: 8, deadline: 12, missedAt: 12, remaining: 1 },
  ]);
  assert.equal(plan.stats.missed, 3);
  assert.equal(plan.stats.busy, 12);
  assert.deepEqual(plan.idle, []);
  // 连着几个格子在跑同一个作业，要并成一段；z 一次都没轮上
  assert.deepEqual(shape(plan).slice(0, 4), ['x[0,2)', 'y[2,4)', 'x[4,6)', 'y[6,8)']);
});

test('until 不给就跑一个超周期，给了就按给的来', () => {
  const tasks = [{ id: 'a', period: 4, cost: 1 }, { id: 'b', period: 6, cost: 2 }];
  assert.equal(simulate({ tasks }).until, 12);
  const short = simulate({ tasks, until: 2 });
  assert.equal(short.until, 2);
  assert.deepEqual(shape(short), ['a[0,1)', 'b[1,2)']);
  assert.deepEqual(short.stats, { ticks: 2, busy: 2, idle: 0, missed: 0 });
  assert.equal(code(() => simulate({ tasks, until: 0 })), 'ERR_BAD_ARGS');
  assert.equal(code(() => simulate({ tasks, until: 2.5 })), 'ERR_BAD_ARGS');
  assert.equal(code(() => simulate({ tasks, until: 10_000_000 })), 'ERR_BAD_ARGS');
});

test('空闲区间要合并，忙绿区间也一样', () => {
  const plan = simulate({ tasks: [{ id: 'a', period: 10, cost: 1 }], until: 30 });
  assert.deepEqual(shape(plan), ['a[0,1)', 'a[10,11)', 'a[20,21)']);
  assert.deepEqual(plan.idle, [{ from: 1, to: 10 }, { from: 11, to: 20 }, { from: 21, to: 30 }]);
  assert.deepEqual(plan.stats, { ticks: 30, busy: 3, idle: 27, missed: 0 });
  assert.equal(code(() => simulate({ tasks: 'nope' })), 'ERR_BAD_CONFIG');
});
