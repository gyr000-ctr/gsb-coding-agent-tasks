import { decode, encode, gfDiv, gfMul, gfPow } from '../lib/rscodec.js';

const line = (label, value) => console.log(`  ${label} ${value}`);
const show = (label, fn) => {
  try {
    line(label, JSON.stringify(fn()));
  } catch (err) {
    line(label, `${err.code} ${JSON.stringify(err.details)}`);
  }
};
const bytes = (shards) => shards.map((shard) => (shard === null ? null : [...shard]));

const data = [
  Uint8Array.from([1, 2, 3, 200]),
  Uint8Array.from([9, 8, 7, 6]),
  Uint8Array.from([0, 255, 128, 4]),
];

console.log('rscodec demo');
line('alpha^8', gfPow(2, 8));
line('0x53*0xca', gfMul(0x53, 0xca));
line('0x53/0xca', gfDiv(0x53, 0xca));
const full = encode(data, { parity: 2 });
line('parity', JSON.stringify(bytes(full.slice(3))));
const partial = full.map((shard, at) => (at === 0 || at === 4 ? null : shard));
line('missing', JSON.stringify([0, 4]));
line('rebuilt', JSON.stringify(bytes(decode(partial, { data: 3, parity: 2 }))));
const robust = encode(data, { parity: 3 });
const allDataGone = robust.map((shard, at) => (at < 3 ? null : shard));
line('data-gone', JSON.stringify(bytes(decode(allDataGone, { data: 3, parity: 3 }))));
show('too-many', () => decode([null, null, null, full[3], full[4]], { data: 3, parity: 2 }));
show('bad-parity', () => encode(data, { parity: 0 }));
show('bad-shard', () => encode([Uint8Array.from([1, 2]), Uint8Array.from([1, 2, 3])], { parity: 1 }));
