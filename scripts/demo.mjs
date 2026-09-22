import { createGateway } from '../lib/gateway.js';

const handled = [];
const gateway = createGateway({ maxBodyBytes: 64 });

gateway.addRoute({
  method: 'GET',
  path: '/orders/:id',
  handler: ({ params }) => ({ body: { id: params.id } }),
});
gateway.addRoute({ method: 'GET', path: '/orders/recent', handler: () => ({ body: { recent: true } }) });
gateway.addRoute({
  method: 'POST',
  path: '/orders',
  requireHeaders: ['X-Api-Key'],
  handler: ({ body }) => {
    handled.push(body);
    return { status: 201, body: { created: body.id } };
  },
});

const show = (label, out) => console.log(`    ${label} -> ${out.status} ${JSON.stringify(out.body)}`);

console.log('gateway demo');

console.log('[1] 取路径参数');
show('GET /orders/A-9', gateway.handle({ method: 'GET', path: '/orders/A-9' }));

console.log('[2] 静态段比参数段优先');
show('GET /orders/recent', gateway.handle({ method: 'GET', path: '/orders/recent' }));

console.log('[3] 带必填头才能写');
show(
  'POST /orders',
  gateway.handle({
    method: 'POST',
    path: '/orders',
    headers: { 'content-type': 'application/json', 'x-api-key': 'k-1' },
    body: '{"id":"A-10"}',
  }),
);

console.log('[4] 方法不对 / 少头 / 体太大');
const wrongMethod = gateway.handle({ method: 'DELETE', path: '/orders/A-9' });
console.log(`    DELETE -> ${wrongMethod.status} allow=${wrongMethod.headers.allow}`);
show(
  'POST 少 X-Api-Key',
  gateway.handle({ method: 'POST', path: '/orders', headers: { 'content-type': 'application/json' }, body: '{"id":"A-11"}' }),
);
show(
  'POST 体太大',
  gateway.handle({
    method: 'POST',
    path: '/orders',
    headers: { 'content-type': 'application/json', 'x-api-key': 'k-1' },
    body: JSON.stringify({ id: 'x'.repeat(80) }),
  }),
);

console.log('[5] handler 真正收到过几次');
console.log(`    ${handled.length} 次 ${JSON.stringify(handled)}`);

console.log('[6] 统计');
console.log(`    ${JSON.stringify(gateway.stats())}`);
