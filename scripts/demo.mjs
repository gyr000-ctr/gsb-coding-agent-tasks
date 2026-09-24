import { createWheel } from '../lib/timewheel.js';

const line = (label, value) => console.log(`  ${label} ${value}`);
const show = (label, fn) => {
  try {
    line(label, JSON.stringify(fn()));
  } catch (err) {
    line(label, `${err.code} ${JSON.stringify(err.details)}`);
  }
};

console.log('timewheel demo');
const wheel = createWheel({ tickMs: 1, wheelSize: 8, levels: 3 });
const log = [];
for (const delay of [5, 5, 1, 70, 512]) {
  wheel.scheduleIn(delay, () => log.push(`${delay}@${wheel.now()}`));
}
line('levels', JSON.stringify(wheel.stats().levels.map((level) => level.timers)));
line('next', wheel.nextDeadline());
wheel.advance(1);
line('at-1', JSON.stringify(log));
wheel.advance(4);
line('at-5', JSON.stringify(log));
line('cascade', JSON.stringify(wheel.stats().levels.map((level) => [level.timers, level.slots])));
line('cancel', wheel.cancel(4));
line('pending', wheel.stats().timers);
wheel.advance(70);
line('at-75', JSON.stringify(log));
wheel.advance(437);
line('at-512', JSON.stringify(log));
line('pending-end', wheel.stats().timers);
show('past', () => wheel.schedule(0, () => {}));
show('too-far', () => wheel.scheduleIn(513, () => {}));
show('bad-delay', () => wheel.scheduleIn(-1, () => {}));
