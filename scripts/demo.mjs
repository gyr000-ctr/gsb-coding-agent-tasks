import { createPlanner } from '../lib/planner.js';

const f = (id, size, minKey, maxKey, extra = {}) => ({ id, size, minKey, maxKey, ...extra });
const state = (...levels) => ({ levels });

const planner = createPlanner();
const big = state(
  [
    f('f1', 300, 'a', 'c', { oldestSeq: 5 }),
    f('f2', 300, 'm', 'p', { oldestSeq: 7 }),
    f('f3', 300, 'g', 'i', { oldestSeq: 3 }),
    f('f4', 300, 'x', 'z', { oldestSeq: 9 }),
    f('f5', 300, 'c', 'e', { oldestSeq: 1 }),
  ],
  [f('g1', 2000, 'a', 'd'), f('g2', 2000, 'g', 'h'), f('g3', 2000, 'm', 'z')],
  [f('h1', 2048, 'a', 'z')],
  [],
);

console.log('levelplan demo');

console.log('[1] 各层打分');
for (const row of planner.score(big).levels) {
  const score = Math.round(row.score * 1000) / 1000;
  console.log(`    L${row.level} files=${row.files} bytes=${row.bytes} capacity=${row.capacity} score=${score}`);
}

console.log('[2] 该压哪一层');
console.log(`    先压 L${planner.pick(big)}`);

console.log('[3] L0 的任务：按 oldestSeq 从旧到新，带上下层所有相交文件');
const l0Job = planner.plan(big).jobs[0];
console.log(`    from=${l0Job.inputs.from.join(',')} to=${l0Job.inputs.to.join(',')}`);
console.log(`    inputBytes=${l0Job.inputBytes} outputBytes=${l0Job.outputBytes} outputFiles=${l0Job.outputFiles}`);

console.log('[4] 只有压到最底层才丢墓碑');
const tight = createPlanner({
  levelCount: 3,
  levelSizeBase: 1000,
  fanout: 4,
  targetFileSize: 500,
  maxInputBytes: 100000,
  tombstoneBytes: 50,
});
const bottom = tight.plan(
  state(
    [],
    [f('a1', 600, 'a', 'c', { tombstones: 2 }), f('a2', 600, 'm', 'p')],
    [f('b1', 400, 'a', 'd', { tombstones: 3 })],
  ),
).jobs[0];
console.log(`    droppedTombstones=${bottom.droppedTombstones} inputBytes=${bottom.inputBytes} outputBytes=${bottom.outputBytes}`);
console.log(`    writeAmplification=${bottom.writeAmplification}`);
const middle = createPlanner({
  levelCount: 4,
  levelSizeBase: 1000,
  fanout: 4,
  targetFileSize: 500,
  maxInputBytes: 100000,
  tombstoneBytes: 50,
}).plan(
  state(
    [],
    [f('c1', 600, 'a', 'c', { tombstones: 2 }), f('c2', 600, 'm', 'p')],
    [f('d1', 400, 'a', 'd', { tombstones: 3 })],
    [],
  ),
).jobs[0];
console.log(`    同一批文件压在中间层：droppedTombstones=${middle.droppedTombstones} outputBytes=${middle.outputBytes}`);

console.log('[5] 一次把所有该压的都列出来');
const plan = planner.plan(big);
console.log(`    jobs=${plan.jobs.map((job) => `L${job.level}(${job.reason})`).join(' ')}`);
console.log(
  `    totalInputBytes=${plan.totalInputBytes} totalOutputBytes=${plan.totalOutputBytes} writeAmplification=${plan.writeAmplification}`,
);
