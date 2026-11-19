import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const code = await readFile(process.env.FRONTEND_SOURCE || new URL('../admin/admin.js', import.meta.url), 'utf8');
const paymentCode = await readFile(new URL('../admin/payment.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function page({ token = '', storage = new Map(), request, invitationReady = false, authenticated = false } = {}) {
  const elements = new Map();
  const make = () => ({ hidden: false, disabled: false, value: '', textContent: '', children: [], events: {}, set id(value) { this._id = value; elements.set(value, this); }, get id() { return this._id; }, classList: { toggle() {}, add() {}, remove() {} }, addEventListener(event, handler) { this.events[event] = handler; }, querySelector() { return this.button ||= make(); }, focus() {}, reset() {}, setAttribute() {}, replaceChildren() { this.children = []; }, append(...children) { this.children.push(...children); }, showModal() {}, close() {} });
  const get = id => { if (!elements.has(id)) elements.set(id, make()); return elements.get(id); };
  const context = {
    document: { getElementById: get, createElement: make },
    window: { addEventListener() {} },
    location: { hash: token ? '#ativar=' + token : '', pathname: '/admin/', search: '' },
    history: { replaceState() {} },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    URLSearchParams, AbortSignal,
    fetch: async (url, options) => {
      if (url === '/api/session') return { ok: true, status: 200, json: async () => ({ service: 'rei-das-chaves-admin', authenticated, setupRequired: true, invitationReady }) };
      return request(url, options);
    }
  };
  vm.createContext(context);
  vm.runInContext(paymentCode, context);
  vm.runInContext(code, context);
  return { get, storage };
}
test('recarregar o admin restaura Estatísticas e a última categoria selecionada', async () => {
  const storage = new Map();
  const request = async url => {
    if (url === '/api/products') return { ok: true, json: async () => ({ products: [], revision: 'fixture' }) };
    assert.match(url, /^\/api\/analytics\?days=/);
    return { ok: true, json: async () => ({ totals: { views: 7, whatsapp: 2, phone: 1 }, pages: [], resetRevision: 'initial' }) };
  };
  const first = page({ storage, request, authenticated: true });
  await tick();
  first.get('categories').children.at(-1).events.click();
  const reloaded = page({ storage, request, authenticated: true });
  await tick();
  assert.equal(reloaded.get('catalog-view').hidden, true);
  assert.equal(reloaded.get('stats-view').hidden, false);
  assert.equal(reloaded.get('stats-views').textContent, '7');
  reloaded.get('categories').children[1].events.click();
  const catalog = page({ storage, request, authenticated: true });
  await tick();
  assert.equal(catalog.get('stats-view').hidden, true);
  assert.equal(catalog.get('category-title').textContent, 'Eletrônicas');
});
test('painel revisa e publica a desativação e mantém o produto disponível para reativar', async () => {
  const product = { id: 'produto-fixture', name: 'Fechadura de teste', image: 'image/fixture.png', category: 'eletronicas', priceCents: 99000, installments: 5, active: true };
  let changes;
  const ui = page({ authenticated: true, request: async (url, options) => {
    if (url === '/api/products') return { ok: true, json: async () => ({ products: [product], revision: 'original' }) };
    assert.equal(url, '/api/prices');
    changes = JSON.parse(options.body).changes;
    return { ok: true, json: async () => ({ revision: 'saved' }) };
  } });
  await tick();
  const visibility = ui.get('visibility-produto-fixture');
  assert.equal(visibility.value, 'active');
  visibility.value = 'inactive';
  visibility.events.change();
  ui.get('review').events.click();
  assert.equal(ui.get('changes').children[0].children[1].textContent, 'Inativo no site');
  await ui.get('publish').events.click();
  assert.deepEqual(changes, [{ id: product.id, priceCents: 99000, installments: 5, active: false }]);
  assert.equal(ui.get('products').children.length, 1);
  assert.equal(ui.get('visibility-produto-fixture').value, 'inactive');
});
test('prévia e publicação do desconto e dos juros usam as opções do produto', async () => {
  const product = { id: 'produto-oferta', name: 'Dubai', image: 'image/fixture.png', category: 'eletronicas', priceCents: 99000, installments: 5, active: true };
  let submitted;
  const ui = page({ authenticated: true, request: async (url, options) => {
    if (url === '/api/products') return { ok: true, json: async () => ({ products: [product], revision: 'original' }) };
    assert.equal(url, '/api/prices');
    submitted = JSON.parse(options.body).changes[0];
    return { ok: true, json: async () => ({ revision: 'new' }) };
  } });
  await tick();
  ui.get('payment-produto-oferta').events.click();
  ui.get('payment-custom').checked = true;
  ui.get('payment-discount').value = '10';
  ui.get('payment-rates').children[5].children[0].value = '5';
  ui.get('payment-dialog').events.input();
  const preview = ui.get('payment-preview').children;
  assert.match(preview[1].textContent, /891,00 à vista/);
  assert.match(preview[2].textContent, /5x de R\$ 198,00 sem juros/);
  const row = preview[3].children[1].children[1].children[5];
  assert.deepEqual(row.children.map(cell => cell.textContent), ['6x de R$ 173,25', 'R$ 1.039,50']);
  ui.get('payment-apply').events.click();
  await ui.get('publish').events.click();
  assert.deepEqual(submitted.payment, { discount: 1000, scope: 'cash', display: 'offer', rates: [0, 0, 0, 0, 0, 500, null, null, null, null] });
  assert.equal(submitted.priceCents, 99000);
});
test('admin/admin entra direto pela URL normal e mostra os produtos sem convite ou troca obrigatória', async () => {
  let submitted;
  const ui = page({ request: async (url, options) => {
    if (url === '/api/login') { submitted = JSON.parse(options.body); return { ok: true, status: 200, json: async () => ({ authenticated: true, username: 'admin', mustChangeCredentials: false }) }; }
    assert.equal(url, '/api/products'); return { ok: true, status: 200, json: async () => ({ products: [], revision: 'fixture' }) };
  } }); await tick();
  ui.get('username').value = 'admin'; ui.get('password').value = 'admin';
  await ui.get('login-form').events.submit({ preventDefault() {}, currentTarget: ui.get('login-form') });
  assert.deepEqual(submitted, { username: 'admin', password: 'admin' });
  assert.equal(ui.get('dashboard').hidden, false); assert.equal(ui.get('account-screen').hidden, true);
  assert.equal(ui.get('login-form').querySelector('button').disabled, false);
  ui.get('account-settings').events.click();
  assert.equal(ui.get('account-screen').hidden, false); assert.equal(ui.get('account-back').hidden, false);
  ui.get('account-back').events.click(); assert.equal(ui.get('dashboard').hidden, false);
});
test('falha de conexão libera o botão para outra tentativa', async () => {
  const ui = page({ request: async () => { const error = new Error(); error.name = 'TimeoutError'; throw error; } }); await tick();
  ui.get('username').value = 'admin'; ui.get('password').value = 'admin';
  await ui.get('login-form').events.submit({ preventDefault() {}, currentTarget: ui.get('login-form') });
  assert.equal(ui.get('login-form').querySelector('button').disabled, false);
  assert.equal(ui.get('login-form').querySelector('button').textContent, 'Entrar no painel');
  assert.match(ui.get('login-message').textContent, /demorou demais/);
});
test('credenciais incorretas exibem mensagem sem prender o botão', async () => {
  const ui = page({ request: async () => ({ ok: false, status: 401, json: async () => ({ error: 'Usuário ou senha inválidos.' }) }) }); await tick();
  ui.get('username').value = 'wrong'; ui.get('password').value = 'wrong';
  await ui.get('login-form').events.submit({ preventDefault() {}, currentTarget: ui.get('login-form') });
  assert.equal(ui.get('login-form').querySelector('button').disabled, false);
  assert.match(ui.get('login-message').textContent, /inválidos/);
});

test('painel salva parcelas sozinhas, mostra revisão e mantém campos editáveis após salvar', async () => {
  let submitted, writeRequests = 0;
  const product = { id: 'produto-fixture', name: 'Fechadura de teste', image: 'image/fixture.png', category: 'eletronicas', priceCents: 99000, installments: 5 };
  const ui = page({ request: async (url, options) => {
    if (url === '/api/login') return { ok: true, status: 200, json: async () => ({ authenticated: true, username: 'admin' }) };
    if (url === '/api/products') return { ok: true, status: 200, json: async () => ({ products: [product], revision: 'original' }) };
    assert.equal(url, '/api/prices'); writeRequests++; submitted = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ revision: 'saved', unchanged: false }) };
  } });
  await tick(); ui.get('username').value = 'admin'; ui.get('password').value = 'admin';
  await ui.get('login-form').events.submit({ preventDefault() {}, currentTarget: ui.get('login-form') });
  ui.get('installments-produto-fixture').value = '8';
  ui.get('installments-produto-fixture').events.change();
  assert.equal(ui.get('pending-count').textContent, '1');
  ui.get('review').events.click();
  assert.match(ui.get('changes').children[0].children[1].textContent, /5x sem juros → Até 8x sem juros/);
  const saving = ui.get('publish').events.click();
  await ui.get('publish').events.click();
  await saving;
  assert.equal(writeRequests, 1);
  assert.deepEqual(submitted, { revision: 'original', changes: [{ id: product.id, priceCents: 99000, installments: 8 }] });
  assert.equal(ui.get('installments-produto-fixture').value, '8');
  assert.equal(ui.get('installments-produto-fixture').disabled, false);
  assert.equal(ui.get('price-produto-fixture').disabled, false);
  assert.equal(ui.get('pending-count').textContent, '0');
  ui.get('price-produto-fixture').value = '1290,00';
  ui.get('price-produto-fixture').events.input();
  ui.get('installments-produto-fixture').value = '10';
  ui.get('installments-produto-fixture').events.change();
  await ui.get('publish').events.click();
  assert.deepEqual(submitted, { revision: 'saved', changes: [{ id: product.id, priceCents: 129000, installments: 10 }] });
  assert.equal(ui.get('installments-produto-fixture').disabled, false);
});
