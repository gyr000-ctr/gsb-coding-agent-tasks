import test from 'node:test';
import assert from 'node:assert/strict';

import { analyze, hyperperiod } from '../lib/realtime.js';
import { code, fractions } from './util.js';

test('利用率是精确分数，不靠浮点凑', () => {
  const third = analyze({ tasks: [
    { id: 'a', period: 3, cost: 1 },
    { id: 'b', period: 3, cost: 1 },
    { id: 'c', period: 3, cost: 1 },
  ] });
  assert.deepEqual(third.utilization, { num: 1, den: 1 });
  assert.equal(third.feasible, true);

  // 浮点算这个是 0.9999999999999999，精确分数就是 1
  const mixed = analyze({ tasks: [
    { id: 'a', period: 2, cost: 1 },
    { id: 'b', period: 3, cost: 1 },
    { id: 'c', period: 6, cost: 1 },
  ] });
  assert.deepEqual(mixed.utilization, { num: 1, den: 1 });
  assert.deepEqual(fractions(mixed.byTask), ['a:1/2', 'b:1/3', 'c:1/6']);
  assert.equal(mixed.feasible, true);

  const tight = analyze({ tasks: [
    { id: 'a', period: 4, cost: 2 },
    { id: 'b', period: 4, cost: 2 },
    { id: 'c', period: 4, cost: 1 },
  ] });
  assert.deepEqual(tight.utilization, { num: 5, den: 4 });
  assert.equal(tight.feasible, false);
  assert.match(tight.reason, /utilization > 1/);
});

test('判定结果和任务清单是拷贝，改不动里面那份', () => {
  const tasks = [{ id: 'a', period: 4, cost: 1 }, { id: 'b', period: 6, cost: 2 }];
  const report = analyze({ tasks });
  assert.deepEqual(report.tasks, tasks);
  assert.deepEqual(report.utilization, { num: 7, den: 12 });
  assert.deepEqual(fractions(report.byTask), ['a:1/4', 'b:1/3']);
  report.tasks[0].cost = 99;
  assert.equal(tasks[0].cost, 1);
});

test('任务表本身有问题各有各的码', () => {
  assert.equal(code(() => analyze()), 'ERR_BAD_CONFIG');
  assert.equal(code(() => analyze({ tasks: [] })), 'ERR_BAD_CONFIG');
  assert.equal(code(() => analyze({ tasks: 'a' })), 'ERR_BAD_CONFIG');
  assert.equal(code(() => analyze({ tasks: [null] })), 'ERR_BAD_CONFIG');
  assert.equal(code(() => analyze({ tasks: [{ id: '', period: 4, cost: 1 }] })),
    'ERR_BAD_CONFIG');
  assert.equal(code(() => analyze({ tasks: [
    { id: 'a', period: 4, cost: 1 },
    { id: 'a', period: 6, cost: 1 },
  ] })), 'ERR_BAD_CONFIG');
  assert.equal(code(() => analyze({ tasks: [{ id: 'a', period: 0, cost: 1 }] })),
    'ERR_BAD_TASK');
  assert.equal(code(() => analyze({ tasks: [{ id: 'a', period: 4.5, cost: 1 }] })),
    'ERR_BAD_TASK');
  assert.equal(code(() => analyze({ tasks: [{ id: 'a', period: 4, cost: 0 }] })),
    'ERR_BAD_TASK');
  assert.equal(code(() => analyze({ tasks: [{ id: 'a', period: 4, cost: 5 }] })),
    'ERR_BAD_TASK');
});

test('超周期就是各周期的最小公倍数', () => {
  assert.equal(hyperperiod([{ id: 'a', period: 4 }, { id: 'b', period: 6 }, { id: 'c', period: 12 }]),
    12);
  assert.equal(hyperperiod([{ id: 'a', period: 2 }, { id: 'b', period: 3 }]), 6);
  assert.equal(hyperperiod([{ id: 'a', period: 5 }]), 5);
  assert.equal(code(() => hyperperiod([])), 'ERR_BAD_ARGS');
  assert.equal(code(() => hyperperiod('tasks')), 'ERR_BAD_ARGS');
  assert.equal(code(() => hyperperiod([{ id: 'a', period: 0 }])), 'ERR_BAD_TASK');
});
