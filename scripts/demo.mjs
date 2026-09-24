import { analyze, hyperperiod, simulate } from '../lib/realtime.js';

const tasks = [
  { id: 'scan', period: 4, cost: 1 },
  { id: 'flush', period: 6, cost: 2 },
  { id: 'ping', period: 12, cost: 3 },
];

const show = (label, value) => console.log(`  ${label} ${JSON.stringify(value)}`);

console.log('realtime demo');
const report = analyze({ tasks });
show('utilization', report.utilization);
show('feasible', report.feasible);
show('byTask', report.byTask.map((one) => `${one.id}:${one.utilization.num}/${one.utilization.den}`));
console.log(`  hyperperiod ${hyperperiod(tasks)}`);

const plan = simulate({ tasks });
console.log(`  spans ${plan.spans.map((one) => `${one.taskId}[${one.from},${one.to})`).join(' ')}`);
show('idle', plan.idle);
show('stats', plan.stats);

const tight = [
  { id: 'a', period: 2, cost: 1 },
  { id: 'b', period: 3, cost: 1 },
  { id: 'c', period: 6, cost: 1 },
];
show('full-load', analyze({ tasks: tight }).utilization);
show('full-load-idle', simulate({ tasks: tight }).idle);

const overloaded = [
  { id: 'x', period: 4, cost: 2 },
  { id: 'y', period: 4, cost: 2 },
  { id: 'z', period: 4, cost: 1 },
];
show('overloaded', analyze({ tasks: overloaded }).utilization);
show('misses', simulate({ tasks: overloaded, until: 12 }).misses.slice(0, 2));
