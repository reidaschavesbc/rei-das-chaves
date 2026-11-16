import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const code = await readFile(process.env.FRONTEND_SOURCE || new URL('../admin/admin.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function page({ token = '', storage = new Map(), request, invitationReady = false } = {}) {
  const elements = new Map();
  const make = () => ({ hidden: false, disabled: false, value: '', textContent: '', events: {}, classList: { toggle() {}, add() {}, remove() {} }, addEventListener(event, handler) { this.events[event] = handler; }, querySelector() { return this.button ||= make(); }, focus() {}, reset() {}, setAttribute() {}, replaceChildren() {}, append() {}, showModal() {}, close() {} });
  const get = id => { if (!elements.has(id)) elements.set(id, make()); return elements.get(id); };
  const context = {
    document: { getElementById: get, createElement: make },
    window: { addEventListener() {} },
    location: { hash: token ? '#ativar=' + token : '', pathname: '/admin/', search: '' },
    history: { replaceState() {} },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    URLSearchParams, AbortSignal,
    fetch: async (url, options) => {
      if (url === '/api/session') return { ok: true, status: 200, json: async () => ({ service: 'rei-das-chaves-admin', authenticated: false, setupRequired: true, invitationReady }) };
      return request(url, options);
    }
  };
  vm.runInNewContext(code, context);
  return { get, storage };
}
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
