import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanner } from '../lib/planner.js';

const file = (id, size, minKey, maxKey, extra = {}) => ({ id, size, minKey, maxKey, ...extra });

test('L0 按文件个数打分，其余层按字节打分', () => {
  const planner = createPlanner();
  const out = planner.score({
    levels: [
      ['f1', 'f2', 'f3', 'f4', 'f5'].map((id, index) => file(id, 300, `${index}a`, `${index}b`)),
      [file('g1', 4000, 'a', 'd'), file('g2', 1000, 'm', 'z')],
      [file('h1', 2048, 'a', 'z')],
      [],
    ],
  });
  assert.deepEqual(out.levels.map((row) => row.level), [0, 1, 2, 3]);
  assert.deepEqual(out.levels[0], { level: 0, files: 5, bytes: 1500, capacity: 4, score: 1.25 });
  assert.equal(out.levels[1].capacity, 4096);
  assert.equal(out.levels[1].score, 5000 / 4096);
  assert.equal(out.levels[2].capacity, 16384);
  assert.equal(out.levels[2].score, 2048 / 16384);
  assert.equal(out.levels[3].score, 0);
});

test('pick：都不过线就是 null，超了取分最高的那一层', () => {
  const planner = createPlanner({ levelCount: 3 });
  assert.equal(planner.pick({ levels: [[], [], []] }), null);
  const l0Only = planner.pick({
    levels: [
      ['f1', 'f2', 'f3', 'f4', 'f5'].map((id, index) => file(id, 100, `${index}a`, `${index}b`)),
      [],
      [],
    ],
  });
  assert.equal(l0Only, 0);
  const l1Only = createPlanner({ levelCount: 3, levelSizeBase: 1000 }).pick({ levels: [[], [file('g1', 1500, 'a', 'z')], []] });
  assert.equal(l1Only, 1);
});

test('pick：分数一样时选靠下的层，最底层再超也不选', () => {
  const planner = createPlanner();
  const tied = planner.pick({
    levels: [
      ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'].map((id, index) => file(id, 100, `${index}a`, `${index}b`)),
      [file('g1', 4096, 'a', 'f'), file('g2', 4096, 'g', 'z')],
      [],
      [],
    ],
  });
  assert.equal(tied, 0);
  const bottomOnly = createPlanner({ levelCount: 3, levelSizeBase: 1000 }).pick({ levels: [[], [], [file('x', 5000, 'a', 'z')]] });
  assert.equal(bottomOnly, null);
});
