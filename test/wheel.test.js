import test from 'node:test';
import assert from 'node:assert/strict';

import { createWheel } from '../lib/timewheel.js';
import { code, details } from './util.js';

test('默认参数与建轮入参', () => {
  const wheel = createWheel();
  assert.deepEqual(wheel.stats(), {
    now: 0,
    timers: 0,
    levels: [
      { index: 0, slotMs: 1, spanMs: 8, timers: 0, slots: [0, 0, 0, 0, 0, 0, 0, 0] },
      { index: 1, slotMs: 8, spanMs: 64, timers: 0, slots: [0, 0, 0, 0, 0, 0, 0, 0] },
      { index: 2, slotMs: 64, spanMs: 512, timers: 0, slots: [0, 0, 0, 0, 0, 0, 0, 0] },
    ],
  });
  // 600 毫秒排得下、513 毫秒排不下
  assert.equal(code(() => wheel.scheduleIn(512, () => {})), null);
  assert.equal(code(() => wheel.scheduleIn(513, () => {})), 'ERR_DEADLINE_TOO_FAR');
  const small = createWheel({ tickMs: 10, wheelSize: 4, levels: 3 });
  assert.deepEqual(small.stats().levels.map((level) => [level.slotMs, level.spanMs]), [[10, 40], [40, 160], [160, 640]]);
  assert.equal(code(() => small.scheduleIn(640, () => {})), null);
  assert.equal(code(() => small.scheduleIn(641, () => {})), 'ERR_DEADLINE_TOO_FAR');
  for (const options of [7, 'x', [], null, true, { tickMs: 0 }, { tickMs: -1 }, { tickMs: 1.5 }, { tickMs: '1' },
    { wheelSize: 1 }, { wheelSize: 2.5 }, { wheelSize: null }, { levels: 1 }, { levels: 0 }, { levels: 2.5 }]) {
    assert.equal(code(() => createWheel(options)), 'ERR_BAD_ARGUMENT', JSON.stringify(options));
  }
  for (const options of [{}, { tickMs: 1 }, { tickMs: 3, wheelSize: 2, levels: 2 }, { levels: 5 }]) {
    assert.equal(code(() => createWheel(options)), null, JSON.stringify(options));
  }
});

test('排进去落在哪一层、哪个格子', () => {
  const wheel = createWheel({ tickMs: 1, wheelSize: 8, levels: 3 });
  wheel.scheduleIn(1, () => {});   // 层 0
  wheel.scheduleIn(7, () => {});   // 层 0
  wheel.scheduleIn(8, () => {});   // 层 1
  wheel.scheduleIn(63, () => {});  // 层 1
  wheel.scheduleIn(64, () => {});  // 层 2
  wheel.scheduleIn(512, () => {}); // 层 2 的上限
  assert.deepEqual(wheel.stats().levels.map((level) => level.timers), [2, 2, 2]);
  // 层 0 的格子就是 deadline 除以 1 再按 8 取模
  assert.deepEqual(wheel.stats().levels[0].slots, [0, 1, 0, 0, 0, 0, 0, 1]);
  const wide = createWheel({ tickMs: 10, wheelSize: 4, levels: 3 });
  wide.scheduleIn(20, () => {});  // deadline 20，层 0，格子 2
  wide.scheduleIn(30, () => {});  // deadline 30，层 0，格子 3
  wide.scheduleIn(50, () => {});  // deadline 50，层 1（10..40 是层 0），格子 floor(50/40)%4 = 1
  assert.deepEqual(wide.stats().levels.map((level) => level.slots), [[0, 0, 1, 1], [0, 1, 0, 0], [0, 0, 0, 0]]);
});

test('到点就跑：先按 deadline，再按排进来的先后', () => {
  const wheel = createWheel();
  const log = [];
  wheel.scheduleIn(5, () => log.push('a'));
  wheel.scheduleIn(5, () => log.push('b'));
  wheel.scheduleIn(1, () => log.push('c'));
  wheel.scheduleIn(5, () => log.push('d'));
  wheel.advance(0);
  assert.deepEqual(log, []);
  wheel.advance(1);
  assert.deepEqual(log, ['c']);
  wheel.advance(4);
  assert.deepEqual(log, ['c', 'a', 'b', 'd']);
  assert.equal(wheel.stats().timers, 0);
  assert.equal(wheel.nextDeadline(), null);
});

test('跑任务的时候新排进来的，只要也到点了，这一趟就一起跑掉', () => {
  const wheel = createWheel();
  const log = [];
  wheel.scheduleIn(2, () => {
    log.push('first');
    wheel.scheduleIn(0, () => log.push('inside'));
  });
  wheel.advance(2);
  assert.deepEqual(log, ['first', 'inside']);
  // 排进来的顺序还是算在后面的：同一条 advance 里，后来的排到最后
  const wheel2 = createWheel();
  const log2 = [];
  wheel2.scheduleIn(1, () => log2.push('a'));
  wheel2.scheduleIn(1, () => {
    log2.push('b');
    wheel2.scheduleIn(0, () => log2.push('late'));
  });
  wheel2.advance(1);
  assert.deepEqual(log2, ['a', 'b', 'late']);
  // 没到点的不会被顺带跑掉
  const wheel3 = createWheel();
  const log3 = [];
  wheel3.scheduleIn(1, () => {
    log3.push('a');
    wheel3.scheduleIn(5, () => log3.push('later'));
  });
  wheel3.advance(1);
  assert.deepEqual(log3, ['a']);
  assert.equal(wheel3.stats().timers, 1);
  assert.equal(wheel3.nextDeadline(), 6);
});

test('级联：随着时间往前走，粗层里的会被重新铺到细层', () => {
  const wheel = createWheel({ tickMs: 1, wheelSize: 8, levels: 3 });
  wheel.scheduleIn(70, () => {});
  assert.deepEqual(wheel.stats().levels.map((level) => level.timers), [0, 0, 1]);
  wheel.advance(10); // 还剩 60：层 1 装得下（跨度 64）
  assert.deepEqual(wheel.stats().levels.map((level) => level.timers), [0, 1, 0]);
  wheel.advance(55); // 还剩 5：层 0
  assert.deepEqual(wheel.stats().levels.map((level) => level.timers), [1, 0, 0]);
  wheel.advance(5);
  assert.equal(wheel.stats().timers, 0);
});

test('取消与 nextDeadline', () => {
  const wheel = createWheel();
  const log = [];
  const keep = wheel.scheduleIn(3, () => log.push('keep'));
  const drop = wheel.scheduleIn(2, () => log.push('drop'));
  assert.equal(wheel.nextDeadline(), 2);
  assert.equal(wheel.cancel(drop), true);
  assert.equal(wheel.cancel(drop), false);
  assert.equal(wheel.cancel(999), false);
  assert.equal(wheel.nextDeadline(), 3);
  assert.equal(wheel.stats().timers, 1);
  wheel.advance(3);
  assert.deepEqual(log, ['keep']);
  assert.equal(wheel.cancel(keep), false);
  assert.equal(wheel.nextDeadline(), null);
  assert.equal(wheel.stats().timers, 0);
});

test('入参：过去的时间点、太远、坏参数', () => {
  const wheel = createWheel({ tickMs: 1, wheelSize: 8, levels: 3 });
  wheel.advance(5);
  assert.equal(code(() => wheel.schedule(5, () => {})), 'ERR_DEADLINE_PAST');
  assert.deepEqual(details(() => wheel.schedule(5, () => {})), { now: 5 });
  assert.equal(code(() => wheel.schedule(4, () => {})), 'ERR_DEADLINE_PAST');
  assert.equal(code(() => wheel.schedule(0, () => {})), 'ERR_DEADLINE_PAST');
  assert.equal(code(() => wheel.schedule(5 + 513, () => {})), 'ERR_DEADLINE_TOO_FAR');
  assert.deepEqual(details(() => wheel.schedule(5 + 513, () => {})), { delay: 513, maxDelay: 512 });
  // scheduleIn 允许 0，但 0 也得等一次 drain 才跑
  const log = [];
  wheel.scheduleIn(0, () => log.push('now'));
  assert.deepEqual(log, []);
  wheel.advance(0);
  assert.deepEqual(log, ['now']);
  for (const deadline of [1.5, NaN, Infinity, '5', null, undefined, {}]) {
    assert.equal(code(() => wheel.schedule(deadline, () => {})), 'ERR_BAD_ARGUMENT', `deadline=${String(deadline)}`);
  }
  for (const delay of [-1, 1.5, '3', null, NaN]) {
    assert.equal(code(() => wheel.scheduleIn(delay, () => {})), 'ERR_BAD_ARGUMENT', `delay=${String(delay)}`);
  }
  for (const task of [undefined, null, 7, 'x', {}, []]) {
    assert.equal(code(() => wheel.schedule(500, task)), 'ERR_BAD_ARGUMENT', `task=${String(task)}`);
    assert.equal(code(() => wheel.scheduleIn(1, task)), 'ERR_BAD_ARGUMENT', `task=${String(task)}`);
  }
  for (const ms of [-1, 1.5, '2', null, NaN, Infinity]) {
    assert.equal(code(() => wheel.advance(ms)), 'ERR_BAD_ARGUMENT', `ms=${String(ms)}`);
  }
});
