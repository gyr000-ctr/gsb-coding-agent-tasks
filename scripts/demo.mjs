import { encodeMessage, decodeMessage } from '../lib/dnscodec.js';

const line = (label, value) => console.log(`  ${label} ${value}`);
const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const show = (label, fn) => {
  try {
    line(label, JSON.stringify(fn()));
  } catch (err) {
    line(label, `${err.code} ${JSON.stringify(err.details)}`);
  }
};

console.log('dnscodec demo');

const ask = { id: 0x1234, flags: { rd: true }, questions: [{ name: 'www.example.com', type: 1, class: 1 }] };
line('query', hex(encodeMessage(ask)));

const reply = encodeMessage({
  id: 0x1234,
  flags: { qr: true, aa: true, rd: true, ra: true },
  questions: [{ name: 'www.example.com', type: 1, class: 1 }],
  answers: [
    { name: 'www.example.com', type: 5, class: 1, ttl: 300, data: { name: 'edge.example.com' } },
    { name: 'edge.example.com', type: 1, class: 1, ttl: 60, data: { address: '192.0.2.1' } },
  ],
});
line('reply-size', reply.length);
line('reply', hex(reply));
const answer = decodeMessage(reply).answers;
line('names', JSON.stringify(answer.map((item) => item.name)));
line('data', JSON.stringify(answer.map((item) => item.data)));

const unknown = encodeMessage({
  id: 9,
  flags: { qr: true },
  answers: [{ name: 'example.com', type: 99, class: 1, ttl: 0, data: { raw: Uint8Array.from([0xde, 0xad]) } }],
});
line('unknown', JSON.stringify([...decodeMessage(unknown).answers[0].data.raw]));

const full = {
  id: 0x0a0b,
  flags: { qr: true, aa: true, rd: true, ra: true },
  questions: [{ name: 'example.com', type: 1, class: 1 }],
  answers: [
    { name: 'example.com', type: 1, class: 1, ttl: 60, data: { address: '192.0.2.1' } },
    { name: 'example.com', type: 1, class: 1, ttl: 60, data: { address: '192.0.2.2' } },
  ],
  authorities: [{ name: 'example.com', type: 2, class: 1, ttl: 60, data: { name: 'ns1.example.com' } }],
  additionals: [{ name: 'ns1.example.com', type: 1, class: 1, ttl: 60, data: { address: '192.0.2.53' } }],
};
line('full-size', encodeMessage(full).length);
for (const maxSize of [94, 60, 40, 20]) {
  const trimmed = encodeMessage(full, { maxSize });
  const back = decodeMessage(trimmed);
  line(`max-${maxSize}`, JSON.stringify([trimmed.length, back.flags.tc, back.questions.length,
    back.answers.length, back.authorities.length, back.additionals.length]));
}

show('bad-name', () => encodeMessage({ id: 1, flags: {}, questions: [{ name: 'a..b', type: 1, class: 1 }] }));
show('bad-arg', () => encodeMessage({ id: 1, flags: {} }, { maxSize: 4 }));
show('truncated', () => decodeMessage(new Uint8Array([0x12, 0x34])));
