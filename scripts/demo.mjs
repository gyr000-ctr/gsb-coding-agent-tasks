import { packBins } from '../lib/binpack.js';

const line = (label, value) => console.log(`  ${label} ${value}`);
const show = (label, fn) => {
  try {
    line(label, JSON.stringify(fn()));
  } catch (err) {
    line(label, `${err.code} ${JSON.stringify(err.details)}`);
  }
};
const items = (...pairs) => pairs.map(([id, weight]) => ({ id, weight }));
const brief = (result) =>
  JSON.stringify([result.bins.map((bin) => [bin.index, bin.used, bin.items]), result.unplaced]);

console.log('binpack demo');

const load = items(['a', 3], ['b', 3], ['c', 7], ['d', 3], ['e', 1]);
for (const algorithm of ['first-fit', 'best-fit', 'worst-fit']) {
  line(algorithm, brief(packBins(load, { capacity: 10, algorithm })));
}

const more = items(['p', 2], ['q', 5], ['r', 4], ['s', 7], ['t', 1], ['u', 3], ['v', 8]);
line('first-fit-bins', packBins(more, { capacity: 10 }).bins.length);
const sorted = packBins(more, { capacity: 10, algorithm: 'best-fit-decreasing' });
line('best-fit-decreasing', brief(sorted));
line('best-fit-decreasing-bins', sorted.bins.length);
line('max-2', brief(packBins(more, { capacity: 10, maxBins: 2 })));
line('empty', brief(packBins([], { capacity: 4 })));

show('too-heavy', () => packBins(items(['x', 5]), { capacity: 4 }));
show('bad-algorithm', () => packBins(load, { capacity: 10, algorithm: 'next-fit' }));
show('bad-item', () => packBins([{ id: 'x', weight: 0 }], { capacity: 4 }));
