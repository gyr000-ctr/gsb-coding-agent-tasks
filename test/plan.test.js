import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanner } from '../lib/planner.js';

const file = (id, size, minKey, maxKey, extra = {}) => ({ id, size, minKey, maxKey, ...extra });
const state = (...levels) => ({ levels });

const tight = (extra = {}) =>
  createPlanner({
    levelCount: 3,
    levelSizeBase: 1000,
    fanout: 4,
    targetFileSize: 500,
    maxInputBytes: 100000,
    tombstoneBytes: 50,
    ...extra,
  });

test('L0 压 L1：输入按 oldestSeq 从旧到新拿，带上下层所有相交文件', () => {
  const planner = createPlanner();
  const l0 = [
    file('f1', 300, 'a', 'c', { oldestSeq: 5 }),
    file('f2', 300, 'm', 'p', { oldestSeq: 7 }),
    file('f3', 300, 'g', 'i', { oldestSeq: 3 }),
    file('f4', 300, 'x', 'z', { oldestSeq: 9 }),
    file('f5', 300, 'c', 'e', { oldestSeq: 1 }),
  ];
  const l1 = [file('g1', 1000, 'a', 'd'), file('g2', 1000, 'g', 'h'), file('g3', 1000, 'm', 'z')];
  const out = planner.plan(state(l0, l1, [], []));
  assert.equal(out.jobs.length, 1);
  const job = out.jobs[0];
  assert.equal(job.level, 0);
  assert.equal(job.reason, 'l0-files');
  assert.equal(job.score, 1.25);
  assert.deepEqual(job.inputs.from, ['f5', 'f3', 'f1', 'f2', 'f4']);
  assert.deepEqual(job.inputs.to, ['g1', 'g2', 'g3']);
  assert.equal(job.inputBytes, 4500);
  assert.equal(job.outputBytes, 4500);
  assert.equal(job.outputFiles, Math.ceil(4500 / 1024));
  assert.equal(job.droppedTombstones, 0);
  assert.equal(job.writeAmplification, 1);
  assert.deepEqual(
    { totalInputBytes: out.totalInputBytes, totalOutputBytes: out.totalOutputBytes, writeAmplification: out.writeAmplification },
    { totalInputBytes: 4500, totalOutputBytes: 4500, writeAmplification: 1 },
  );
});

test('L0 输入超过 maxInputBytes 时按 oldestSeq 截断，但至少留一个', () => {
  const planner = createPlanner({ maxInputBytes: 700 });
  const l0 = [
    file('f1', 300, 'a', 'c', { oldestSeq: 5 }),
    file('f2', 300, 'm', 'p', { oldestSeq: 7 }),
    file('f3', 300, 'g', 'i', { oldestSeq: 3 }),
    file('f4', 300, 'x', 'z', { oldestSeq: 9 }),
    file('f5', 300, 'c', 'e', { oldestSeq: 1 }),
  ];
  const l1 = [file('g1', 1000, 'a', 'd'), file('g2', 1000, 'g', 'h'), file('g3', 1000, 'm', 'z')];
  const job = planner.plan(state(l0, l1, [], [])).jobs[0];
  assert.deepEqual(job.inputs.from, ['f5', 'f3']);
  assert.deepEqual(job.inputs.to, ['g1', 'g2']);
  assert.equal(job.inputBytes, 2600);

  const one = createPlanner({ maxInputBytes: 10 }).plan(
    state(
      [
        file('only', 300, 'a', 'b', { oldestSeq: 1 }),
        file('n2', 300, 'c', 'd', { oldestSeq: 2 }),
        file('n3', 300, 'e', 'f', { oldestSeq: 3 }),
        file('n4', 300, 'g', 'h', { oldestSeq: 4 }),
        file('n5', 300, 'i', 'j', { oldestSeq: 5 }),
      ],
      [],
      [],
      [],
    ),
  ).jobs[0];
  assert.deepEqual(one.inputs.from, ['only']);
});

test('L1 压 L2：左边第一个文件往下带相交文件，超上限时只留最小的那个', () => {
  const planner = tight({ maxInputBytes: 700 });
  const l1 = [file('a1', 600, 'a', 'c'), file('a2', 600, 'm', 'p')];
  const l2 = [file('b1', 400, 'a', 'b'), file('b2', 350, 'c', 'c', { tombstones: 2 })];
  const job = planner.plan(state([], l1, l2)).jobs[0];
  assert.equal(job.level, 1);
  assert.equal(job.reason, 'level-bytes');
  assert.deepEqual(job.inputs.from, ['a1']);
  assert.deepEqual(job.inputs.to, ['b2']);
  assert.equal(job.inputBytes, 950);
  assert.equal(job.droppedTombstones, 2);
  assert.equal(job.outputBytes, 850);
  assert.equal(job.writeAmplification, 0.895);
});

test('墓碑只在压到最底层时才丢，其他层原样留着', () => {
  const bottom = tight();
  const bottomJob = bottom.plan(
    state([], [file('a1', 600, 'a', 'c', { tombstones: 2 }), file('a2', 600, 'm', 'p')], [file('b1', 400, 'a', 'd', { tombstones: 3 })]),
  ).jobs[0];
  assert.equal(bottomJob.droppedTombstones, 5);
  assert.equal(bottomJob.outputBytes, 750);
  assert.equal(bottomJob.outputFiles, 2);
  assert.equal(bottomJob.writeAmplification, 0.75);

  const notBottom = createPlanner({ levelCount: 4, levelSizeBase: 1000, fanout: 4, targetFileSize: 500, tombstoneBytes: 50, maxInputBytes: 100000 });
  const kept = notBottom.plan(
    state([], [file('a1', 600, 'a', 'c', { tombstones: 2 }), file('a2', 600, 'm', 'p')], [file('b1', 400, 'a', 'd', { tombstones: 3 })], []),
  ).jobs[0];
  assert.equal(kept.droppedTombstones, 0);
  assert.equal(kept.outputBytes, 1000);
  // 同一批文件压到最底层会变成 750 字节（0.75），这里是中间层，墓碑一个都不能丢。
  assert.equal(kept.writeAmplification, 1);
});

test('多个层同时超标时按层号升序各给一个任务，总量加总', () => {
  const planner = createPlanner();
  const l0 = [
    file('f1', 300, 'a', 'c', { oldestSeq: 5 }),
    file('f2', 300, 'm', 'p', { oldestSeq: 7 }),
    file('f3', 300, 'g', 'i', { oldestSeq: 3 }),
    file('f4', 300, 'x', 'z', { oldestSeq: 9 }),
    file('f5', 300, 'c', 'e', { oldestSeq: 1 }),
  ];
  const l1 = [file('g1', 2000, 'a', 'd'), file('g2', 2000, 'g', 'h'), file('g3', 2000, 'm', 'z')];
  const l2 = [file('h1', 500, 'a', 'b'), file('h2', 500, 'g', 'i'), file('h3', 500, 'm', 'z')];
  const out = planner.plan(state(l0, l1, l2, []));
  assert.deepEqual(out.jobs.map((job) => job.level), [0, 1]);
  assert.deepEqual(out.jobs[1].inputs, { from: ['g1'], to: ['h1'] });
  assert.equal(out.jobs[1].score, 1.465);
  assert.equal(out.jobs[1].inputBytes, 2500);
  assert.equal(out.jobs[1].outputFiles, Math.ceil(2500 / 1024));
  assert.equal(out.totalInputBytes, 10000);
  assert.equal(out.totalOutputBytes, 10000);
  assert.equal(out.totalDroppedTombstones, 0);
  assert.equal(out.writeAmplification, 1);
});

test('都没超标就是空计划，最底层超标也不给任务', () => {
  const planner = createPlanner({ levelCount: 3, levelSizeBase: 1000 });
  const idle = planner.plan(state([file('f1', 100, 'a', 'b')], [file('g1', 500, 'a', 'z')], []));
  assert.deepEqual(idle, { jobs: [], totalInputBytes: 0, totalOutputBytes: 0, totalDroppedTombstones: 0, writeAmplification: 0 });
  const bottomHeavy = planner.plan(state([], [], [file('x', 5000, 'a', 'z')]));
  assert.deepEqual(bottomHeavy.jobs, []);
  assert.equal(planner.score(state([], [], [file('x', 5000, 'a', 'z')])).levels[2].score, 1.25);
});
