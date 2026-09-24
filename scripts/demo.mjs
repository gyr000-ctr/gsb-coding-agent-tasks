import { createSheet } from '../lib/gridfit.js';

const line = (label, value) => console.log(`  ${label} ${JSON.stringify(value)}`);
const pick = (sheet, addresses) =>
  Object.fromEntries(addresses.map((address) => [address, sheet.value(address)]));

console.log('gridfit demo');

const basic = createSheet({ A1: '2', A2: '3', B1: '=A1+A2*2', B2: '=(A1+A2)*2', B3: '=-A1' });
line('sheet', pick(basic, ['A1', 'A2', 'B1', 'B2', 'B3']));

const list = createSheet({
  A1: '1', A2: '2', A3: 'x', A4: 'TRUE', A5: '   ',
  B1: '=SUM(A1:A5)', B2: '=COUNT(A1:A5)', B3: '=AVERAGE(A1:A5)',
});
line('aggregate', pick(list, ['B1', 'B2', 'B3']));

const text = createSheet({ A1: '=1/0', B1: '="n="&42', B2: '="x"&TRUE', B3: '="x"&A1' });
line('text', pick(text, ['B1', 'B2', 'B3']));

const compare = createSheet({ A1: '', B1: '=1<2', B2: '=A1=0', B3: '="3">3' });
line('compare', pick(compare, ['B1', 'B2', 'B3']));

const branching = createSheet({ B1: '=IF(FALSE,1/0,5)', B2: '=IF(1>0,"y","n")', B3: '=ROUND(2.5,0)' });
line('if', pick(branching, ['B1', 'B2', 'B3']));

const cyclic = createSheet({ A1: '=B1', B1: '=A1', C1: '=A1+1', D1: '1' });
line('cycle', pick(cyclic, ['A1', 'B1', 'C1', 'D1']));

const broken = createSheet({
  B1: '="a"-1', B2: '=NOPE()', B3: '=ZZZ1', B4: '=1+', B5: '=1/0',
});
line('errors', pick(broken, ['B1', 'B2', 'B3', 'B4', 'B5']));

const ordered = createSheet();
ordered.set('b1', '2').set('A10', '=A2+2').set('A2', '1').set('AA1', '4');
line('order', ordered.addresses());
line('snapshot', ordered.snapshot());
