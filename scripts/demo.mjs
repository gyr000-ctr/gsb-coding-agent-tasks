import { createRoller } from '../lib/roll.js';

const roller = createRoller({ salt: 'demo' });
const rules = [
  { id: 'staff', when: { role: 'staff' } },
  {
    id: 'pro-rollout',
    when: { plan: 'pro' },
    percent: 40,
    variants: [
      { name: 'new-ui', percent: 20 },
      { name: 'old-ui', percent: 20 },
    ],
  },
  { id: 'default-on', percent: 100 },
];

const show = (user, list = rules, instance = roller) => {
  const out = instance.roll(list, user);
  return `rule=${out.rule} bucket=${out.bucket} enabled=${out.enabled} variant=${out.variant}`;
};

console.log('flagroll demo');

console.log('[1] 不同的人命中不同的规则');
for (const user of [
  { id: 'u-1001', plan: 'pro' },
  { id: 'u-1002', plan: 'pro' },
  { id: 'u-1003', role: 'staff' },
  { id: 'u-1004', plan: 'free' },
]) {
  console.log(`    ${user.id}: ${show(user)}`);
}

console.log('[2] 同一个人每次问结果都一样');
console.log(`    ${show({ id: 'u-1001', plan: 'pro' })}`);
console.log(`    ${show({ id: 'u-1001', plan: 'pro' })}`);

console.log('[3] percent 给 0：规则命中，但人没进灰度');
console.log(`    pro-rollout 那条：${show({ id: 'u-1001', plan: 'pro' })}`);
console.log(`    no-roll 那条：${show({ id: 'u-1' }, [{ id: 'no-roll', percent: 0 }])}`);

console.log('[4] 200 个人按变体分布');
const counts = new Map();
for (let index = 0; index < 200; index++) {
  const out = roller.roll([rules[1]], { id: `u-${index}`, plan: 'pro' });
  const key = !out.enabled ? 'not-enabled' : out.variant === null ? 'in-rollout-no-variant' : out.variant;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
for (const [name, count] of [...counts.entries()].sort()) {
  console.log(`    ${name}=${count}`);
}

console.log('[5] 换一个 salt，桶号就变了');
const other = createRoller({ salt: 'demo-v2' });
console.log(`    demo: ${show({ id: 'u-1001', plan: 'pro' })}`);
console.log(`    demo-v2: ${show({ id: 'u-1001', plan: 'pro' }, rules, other)}`);
