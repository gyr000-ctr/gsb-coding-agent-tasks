import { WheelError } from '../lib/errors.js';

export const code = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof WheelError ? err.code : `NOT_WHEEL:${err.message}`;
  }
};

export const details = (fn) => {
  try {
    fn();
  } catch (err) {
    return err.details;
  }
  return null;
};

export const mulberry32 = (seed) => () => {
  let state = (seed += 0x6d2b79f5);
  state = Math.imul(state ^ (state >>> 15), state | 1);
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
  return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
};


// 朴素模型：一个数组，每次 advance 就挑当期到点的（deadline 小的优先，一样就看排进来的先后）
export const createModel = () => {
  const timers = [];
  let now = 0;
  let nextId = 1;
  const fire = () => {
    while (true) {
      const due = timers.filter((timer) => timer.deadline <= now)
        .sort((left, right) => left.deadline - right.deadline || left.seq - right.seq);
      if (due.length === 0) break;
      for (const timer of due) {
        timers.splice(timers.indexOf(timer), 1);
        timer.task();
      }
    }
  };
  return {
    schedule(deadline, task) {
      const timer = { id: nextId, seq: nextId, deadline, task };
      nextId += 1;
      timers.push(timer);
      return timer.id;
    },
    scheduleIn(delay, task) {
      return this.schedule(now + delay, task);
    },
    cancel(id) {
      const at = timers.findIndex((timer) => timer.id === id);
      if (at === -1) return false;
      timers.splice(at, 1);
      return true;
    },
    advance(ms) {
      now += ms;
      fire();
      return now;
    },
    now: () => now,
    nextDeadline() {
      let best = null;
      for (const timer of timers) if (best === null || timer.deadline < best) best = timer.deadline;
      return best;
    },
    pending: () => timers.length,
  };
};
