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
test('a ausência de convite apresenta uma orientação e não deixa o botão preso como carregando', async () => {
  const ui = page(); await tick();
  const button = ui.get('login-form').querySelector('button');
  assert.equal(button.disabled, false);
  await ui.get('login-form').events.submit({ preventDefault() {}, currentTarget: ui.get('login-form') });
  assert.equal(button.disabled, false);
  assert.match(ui.get('login-message').textContent, /Abra o link/);
});
test('o convite permanece disponível ao atualizar a página na mesma aba', async () => {
  const storage = new Map(); page({ token: 'fixture-invitation', storage }); await tick();
  assert.equal(storage.get('rdc_activation_token'), 'fixture-invitation');
  const refreshed = page({ storage }); await tick();
  assert.equal(refreshed.get('login-title').textContent, 'Primeiro acesso');
  assert.match(refreshed.get('login-description').textContent, /admin/);
});
test('falha de conexão libera o botão para uma nova tentativa e exibe a causa', async () => {
  const ui = page({ token: 'fixture-invitation', request: async () => { const error = new Error(); error.name = 'TimeoutError'; throw error; } }); await tick();
  ui.get('username').value = 'admin'; ui.get('password').value = 'admin';
  await ui.get('login-form').events.submit({ preventDefault() {}, currentTarget: ui.get('login-form') });
  assert.equal(ui.get('login-form').querySelector('button').disabled, false);
  assert.equal(ui.get('login-form').querySelector('button').textContent, 'Entrar no painel');
  assert.match(ui.get('login-message').textContent, /demorou demais/);
});
test('admin/admin envia o convite e leva à troca obrigatória antes de mostrar produtos', async () => {
  let body;
  const ui = page({ token: 'fixture-invitation', request: async (url, options) => {
    assert.equal(url, '/api/setup'); body = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ authenticated: true, username: 'admin', mustChangeCredentials: true }) };
  } }); await tick();
  ui.get('username').value = 'admin'; ui.get('password').value = 'admin';
  await ui.get('login-form').events.submit({ preventDefault() {}, currentTarget: ui.get('login-form') });
  assert.deepEqual(body, { username: 'admin', password: 'admin', token: 'fixture-invitation' });
  assert.equal(ui.get('dashboard').hidden, true);
  assert.equal(ui.get('account-screen').hidden, false);
  assert.equal(ui.get('account-back').hidden, true);
});
test('convite no cookie permite entrar em uma URL normal, sem fragmento e sem sessionStorage', async () => {
  let submitted = false;
  const ui = page({ invitationReady: true, request: async (url, options) => {
    assert.equal(url, '/api/setup'); submitted = true;
    const body = JSON.parse(options.body); assert.equal(body.username, 'admin'); assert.equal(body.password, 'admin');
    return { ok: true, status: 200, json: async () => ({ authenticated: true, username: 'admin', mustChangeCredentials: true }) };
  } }); await tick();
  ui.get('username').value = 'admin'; ui.get('password').value = 'admin';
  await ui.get('login-form').events.submit({ preventDefault() {}, currentTarget: ui.get('login-form') });
  assert.equal(submitted, true); assert.equal(ui.get('account-screen').hidden, false);
});
