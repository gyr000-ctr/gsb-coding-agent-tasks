import { createEngine } from '../lib/engine.js';

const engine = createEngine({
  sheets: {
    Sheet1: {
      A1: 2,
      A2: 3,
      A3: 4,
      B1: '=A1+A2*A3',
      B2: '=SUM(A1:A3)',
      B3: '=IF(B1>10,"big","small")',
      C1: '=B1/0',
      C2: '=SUM(C1,B2)',
    },
    Sheet2: { A1: '=Sheet1!B2*10' },
  },
});

console.log('sheetcalc demo');

console.log('[1] 一个中规中矩的表');
console.log(`    B1=${engine.get('Sheet1!B1')} B2=${engine.get('Sheet1!B2')} B3=${engine.get('Sheet1!B3')}`);

console.log('[2] 错误值会一路往外传');
console.log(`    C1=${engine.get('Sheet1!C1')} C2=${engine.get('Sheet1!C2')}`);

console.log('[3] 跨表引用');
console.log(`    Sheet2!A1=${engine.get('Sheet2!A1')}`);

console.log('[4] 改一格只重算受影响的');
const out = engine.set('Sheet1!A2', 10);
console.log(`    changed=${out.changed.join(',')} evaluated=${out.evaluated}`);
console.log(`    Sheet2!A1 现在是 ${engine.get('Sheet2!A1')}`);

console.log('[5] 绕成环的整条链都是 #CYCLE!');
engine.set('Sheet1!D1', '=E1');
engine.set('Sheet1!E1', '=D1+1');
console.log(`    D1=${engine.get('Sheet1!D1')} E1=${engine.get('Sheet1!E1')}`);
engine.set('Sheet1!D1', 1);
console.log(`    把 D1 改成常量之后 E1=${engine.get('Sheet1!E1')}`);
