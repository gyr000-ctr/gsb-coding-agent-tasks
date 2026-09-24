import test from 'node:test';
import assert from 'node:assert/strict';

import { createWheel } from '../lib/timewheel.js';
import { code, createModel, mulberry32 } from './util.js';

test('跟朴素模型对拍：跑的顺序、下一班时间、还剩几个都一致', () => {
  for (let round = 0; round < 60; round += 1) {
    const random = mulberry32(round * 7919 + 17);
    const wheel = createWheel({ tickMs: 1, wheelSize: 8, levels: 3 });
    const model = createModel();
    const maxDelay = 512;
    const wheelLog = [];
    const modelLog = [];
    const live = [];
    for (let step = 0; step < 240; step += 1) {
      const roll = random();
      if (roll < 0.5 || live.length === 0) {
        const delay = random() < 0.08 ? maxDelay + Math.floor(random() * 6) : Math.floor(random() * (maxDelay + 1));
        const holder = { id: 0 };
        if (delay > maxDelay) {
          assert.equal(code(() => wheel.scheduleIn(delay, () => {})), 'ERR_DEADLINE_TOO_FAR',
            `第 ${round} 轮第 ${step} 步：${delay} 毫秒该报排不下`);
          continue;
        }
        const modelId = model.scheduleIn(delay, () => modelLog.push(holder.id));
        holder.id = modelId;
        const wheelId = wheel.scheduleIn(delay, () => wheelLog.push(holder.id));
        assert.equal(wheelId, modelId, `第 ${round} 轮第 ${step} 步：${delay} 毫秒排下来的结果不一样`);
        live.push(wheelId);
        continue;
      }
      if (roll < 0.65) {
        const id = live.length > 0 && random() < 0.9
          ? live[Math.floor(random() * live.length)]
          : 10 ** 6 + Math.floor(random() * 100);
        const fromModel = model.cancel(id);
        const fromWheel = wheel.cancel(id);
        assert.equal(fromWheel, fromModel, `第 ${round} 轮第 ${step} 步：取消 ${id} 的结果不一样`);
        if (fromWheel) live.splice(live.indexOf(id), 1);
        continue;
      }
      const ms = Math.floor(random() * 60);
      assert.equal(wheel.advance(ms), model.advance(ms));
      assert.equal(wheel.nextDeadline(), model.nextDeadline(), `第 ${round} 轮第 ${step} 步：下一班时间不一样`);
      assert.equal(wheel.stats().timers, model.pending(), `第 ${round} 轮第 ${step} 步：还剩几个不一样`);
      assert.equal(wheel.now(), model.now());
    }
    assert.deepEqual(wheelLog, modelLog, `第 ${round} 轮跑的顺序不一样`);
    wheel.advance(maxDelay * 2);
    model.advance(maxDelay * 2);
    assert.deepEqual(wheelLog, modelLog);
    assert.equal(wheel.stats().timers, 0);
    assert.equal(wheel.nextDeadline(), null);
  }
});

test('几千个定时器：各自正好跑一次，顺序跟朴素模型一样', () => {
  const wheel = createWheel({ tickMs: 1, wheelSize: 16, levels: 4 });
  const model = createModel();
  const wheelLog = [];
  const modelLog = [];
  const random = mulberry32(20260924);
  const total = 3000;
  const maxDelay = 16 ** 4;
  for (let at = 0; at < total; at += 1) {
    const delay = Math.floor(random() * (maxDelay + 1));
    const holder = { id: 0 };
    const modelId = model.scheduleIn(delay, () => modelLog.push(holder.id));
    holder.id = modelId;
    const wheelId = wheel.scheduleIn(delay, () => wheelLog.push(holder.id));
    assert.equal(wheelId, modelId);
  }
  assert.equal(wheel.stats().timers, total);
  const started = Date.now();
  while (model.pending() > 0) {
    const ms = 1 + Math.floor(random() * 900);
    assert.equal(wheel.advance(ms), model.advance(ms));
    assert.equal(wheel.stats().timers, model.pending());
  }
  const elapsed = Date.now() - started;
  assert.equal(wheelLog.length, total, '每个任务都得跑，且只跑一次');
  assert.deepEqual(wheelLog, modelLog);
  assert.equal(wheel.nextDeadline(), null);
  assert.ok(elapsed < 20000, `几千个定时器不该跑这么久（${elapsed} 毫秒）`);
});
