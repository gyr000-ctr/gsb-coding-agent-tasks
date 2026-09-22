import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanner, DEFAULTS } from '../lib/planner.js';

const file = (id, size, minKey, maxKey, extra = {}) => ({ id, size, minKey, maxKey, ...extra });

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.name, 'PlanError');
    assert.equal(err.code, code, `期望 ${code}，实际 ${err.code}`);
    return err;
  }
  assert.fail(`期望抛 ${code}，结果没抛`);
}

test('配置默认值和各层容量', () => {
  const planner = createPlanner();
  assert.deepEqual(planner.options, DEFAULTS);
  assert.equal(planner.capacity(0), DEFAULTS.l0TriggerFiles);
  assert.equal(planner.capacity(1), DEFAULTS.levelSizeBase);
  assert.equal(planner.capacity(2), DEFAULTS.levelSizeBase * DEFAULTS.fanout);
  assert.equal(planner.capacity(3), DEFAULTS.levelSizeBase * DEFAULTS.fanout ** 2);
  assert.equal(createPlanner({ fanout: 10, levelSizeBase: 100 }).capacity(2), 1000);
});

test('配置不合法就拒掉', () => {
  for (const options of [
    { levelCount: 1 },
    { levelCount: 9 },
    { levelCount: 2.5 },
    { l0TriggerFiles: 0 },
    { levelSizeBase: -1 },
    { fanout: '4' },
    { targetFileSize: 0 },
    { maxInputBytes: Number.NaN },
    { tombstoneBytes: -1 },
  ]) {
    expectError(() => createPlanner(options), 'ERR_BAD_CONFIG');
  }
  expectError(() => createPlanner(null), 'ERR_BAD_CONFIG');
});

test('state 和文件形状不对时报哪个码', () => {
  const planner = createPlanner({ levelCount: 3 });
  expectError(() => planner.score([]), 'ERR_BAD_STATE');
  expectError(() => planner.score({ levels: [[], []] }), 'ERR_BAD_STATE');
  expectError(() => planner.score({ levels: [[], [], 'x'] }), 'ERR_BAD_STATE');
  expectError(() => planner.score({ levels: [[null], [], []] }), 'ERR_BAD_FILE');
  expectError(() => planner.score({ levels: [[file('a', 0, 'a', 'b')], [], []] }), 'ERR_BAD_FILE');
  expectError(() => planner.score({ levels: [[file('', 10, 'a', 'b')], [], []] }), 'ERR_BAD_FILE');
  expectError(() => planner.score({ levels: [[file('a', 10, 'b', 'a')], [], []] }), 'ERR_BAD_FILE');
  expectError(() => planner.score({ levels: [[file('a', 10, 'a', 'b', { tombstones: -1 })], [], []] }), 'ERR_BAD_FILE');
  expectError(() => planner.score({ levels: [[file('a', 10, 'a', 'b', { oldestSeq: 'x' })], [], []] }), 'ERR_BAD_FILE');
});

test('文件 id 全局唯一，L1 往上必须按 minKey 升序且不重叠，L0 随便叠', () => {
  const planner = createPlanner({ levelCount: 3 });
  expectError(
    () => planner.score({ levels: [[file('a', 10, 'a', 'b')], [file('a', 10, 'c', 'd')], []] }),
    'ERR_BAD_FILE',
  );
  expectError(
    () => planner.score({ levels: [[], [file('b', 10, 'm', 'n'), file('a', 10, 'a', 'c')], []] }),
    'ERR_OVERLAP',
  );
  expectError(
    () => planner.score({ levels: [[], [file('a', 10, 'a', 'c'), file('b', 10, 'c', 'd')], []] }),
    'ERR_OVERLAP',
  );
  const overlappingL0 = planner.score({
    levels: [[file('a', 10, 'a', 'z'), file('b', 10, 'c', 'd')], [], []],
  });
  assert.equal(overlappingL0.levels[0].files, 2);
});
