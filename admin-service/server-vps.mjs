import http from 'node:http';
import { isIP } from 'node:net';
import { readFile, writeFile, rename, realpath, stat, mkdir } from 'node:fs/promises';
import { resolve, extname, sep, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createStore } from './local-store.mjs';
const derive = promisify(scrypt), appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateRoot = resolve(process.env.STATE_ROOT || join(appRoot, '.local-state'));
const privateRoot = join(stateRoot, 'private'), passwordFile = join(privateRoot, 'password.json');
const store = createStore(stateRoot), port = Number(process.env.PORT || 3010);
const production = process.env.NODE_ENV === 'production';
const origin = process.env.PUBLIC_ORIGIN || (!production ? `http://localhost:${port}` : '');
const validOrigin = Boolean(origin && (!production || origin.startsWith('https://')));
const sessions = new Map(), attempts = new Map(), ttl = 4 * 60 * 60 * 1000;
const cookieName = production ? '__Host-rdc_admin' : 'rdc_admin';
const invitationCookieName = production ? '__Host-rdc_invite' : 'rdc_invite';
class RequestError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function send(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(value));
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new RequestError('Formato de requisição inválido.', 415);
  let size = 0, data = '';
  for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new RequestError('Requisição muito grande.', 413); data += chunk; }
  try { const value = JSON.parse(data); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new RequestError('Dados inválidos.'); }
}
const cookie = (value, age) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production ? '; Secure' : ''}`;
const invitationCookie = (value, age) => `${invitationCookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production ? '; Secure' : ''}`;
function getSession(req) {
  const id = (req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const session = sessions.get(id);
  if (session?.expires > Date.now()) return { id, ...session };
  sessions.delete(id); return null;
}
async function credentials() { try { return JSON.parse(await readFile(passwordFile, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
// Nginx overwrites X-Real-IP; trust it only on the loopback connection.
function clientAddress(req) {
  const peer = req.socket.remoteAddress;
  const forwarded = req.headers['x-real-ip'];
  if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer) && typeof forwarded === 'string' && isIP(forwarded)) return forwarded;
  return peer;
}
function limitAttempt(req) {
  const key = clientAddress(req), now = Date.now(), attempt = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
  if (attempt.until < now) { attempt.count = 0; attempt.until = now + 15 * 60000; }
  if (attempt.count >= 10) throw new RequestError('Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.', 429);
  attempt.count++; attempts.set(key, attempt);
}
function login(req, res, username = 'admin') {
  attempts.delete(clientAddress(req)); const previous = getSession(req); if (previous) sessions.delete(previous.id);
  const id = randomBytes(32).toString('hex');
  sessions.set(id, { expires: Date.now() + ttl, username });
  send(res, 200, { authenticated: true, username, mustChangeCredentials: false }, { 'Set-Cookie': cookie(id, ttl / 1000) });
}
async function asset(path, res) {
  if (path === '/') path = '/index.html';
  if (path === '/admin' || path === '/admin/') path = '/admin/index.html';
  const admin = ['/admin/index.html', '/admin/admin.css', '/admin/admin.js'].includes(path);
  if (!admin && !/^\/(?:[\w-]+(?:\.html|\.xml|\.txt)?|(?:image|css|js|video)\/[\w/.-]+\.(?:png|jpe?g|webp|ico|css|js|mp4))$/i.test(path)) throw new RequestError('Página não encontrada.', 404);
  const base = admin ? appRoot : await realpath(join(stateRoot, 'current'));
  if (!admin && !extname(path)) path += '.html';
  const file = await realpath(resolve(base, `.${path}`)).catch(() => null);
  if (!file || !file.startsWith(base + sep) || !(await stat(file)).isFile()) throw new RequestError('Arquivo não encontrado.', 404);
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };
  res.writeHead(200, { 'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(await readFile(file));
}
export const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.url.startsWith('/admin') || req.url.startsWith('/api/')) res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/admin/ativar/') && req.method === 'GET') {
      res.writeHead(303, { Location: '/admin/', 'Cache-Control': 'no-store', 'Set-Cookie': invitationCookie('', 0) });
      res.end(); return;
    }
    if (path === '/healthz' && req.method === 'GET') { await store.snapshot(); send(res, 200, { service: 'rei-das-chaves-admin', ready: true }); return; }
    if (!path.startsWith('/api/')) { if (req.method !== 'GET') throw new RequestError('Método não permitido.', 405); await asset(path, res); return; }
    if (!validOrigin) { send(res, 503, { service: 'rei-das-chaves-admin', error: 'O acesso seguro ainda precisa ser configurado.' }); return; }
    if (!['GET', 'POST'].includes(req.method)) throw new RequestError('Método não permitido.', 405);
    if (req.method === 'POST' && req.headers.origin !== origin) throw new RequestError('Origem de acesso inválida.', 403);
    if (path === '/api/session' && req.method === 'GET') {
      const session = getSession(req);
      send(res, 200, { service: 'rei-das-chaves-admin', authenticated: Boolean(session), setupRequired: false, username: session?.username, mustChangeCredentials: false }); return;
    }
    if (['/api/login', '/api/setup'].includes(path) && req.method === 'POST') {
      limitAttempt(req); const data = await body(req), current = await credentials();
      if (typeof data.password !== 'string' || !data.password.length || data.password.length > 256 || typeof data.username !== 'string') throw new RequestError('Informe seu usuário e sua senha.');
      if (!current) {
        if (data.username !== 'admin' || data.password !== 'admin') throw new RequestError('Usuário ou senha inválidos.', 401);
        login(req, res, 'admin'); return;
      } else {
        const actual = await derive(data.password, current.salt, 64);
        if (!timingSafeEqual(actual, Buffer.from(current.hash, 'hex')) || data.username !== (current.username || 'admin')) throw new RequestError('Usuário ou senha inválidos.', 401);
      }
      login(req, res, current.username || 'admin'); return;
    }
    const session = getSession(req); if (!session) throw new RequestError('Sua sessão expirou. Entre novamente para continuar.', 401);
    if (path === '/api/logout' && req.method === 'POST') { sessions.delete(session.id); send(res, 200, { authenticated: false }, { 'Set-Cookie': cookie('', 0) }); return; }
    if (path === '/api/account' && req.method === 'POST') {
      limitAttempt(req);
      const data = await body(req), current = await credentials();
      if (typeof data.username !== 'string' || !/^[a-zA-Z0-9._-]{3,40}$/.test(data.username)) throw new RequestError('Use um usuário de 3 a 40 letras, números, pontos, traços ou sublinhados.');
      if (typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 256) throw new RequestError('A nova senha deve ter de 12 a 256 caracteres.');
      if (!current) {
        if (data.currentPassword !== 'admin') throw new RequestError('A senha atual está incorreta.');
      } else {
        if (!current || typeof data.currentPassword !== 'string' || data.currentPassword.length > 256 || !timingSafeEqual(await derive(data.currentPassword, current.salt, 64), Buffer.from(current.hash, 'hex'))) throw new RequestError('A senha atual está incorreta.');
      }
      const salt = randomBytes(16).toString('hex'), hash = (await derive(data.password, salt, 64)).toString('hex');
      await mkdir(privateRoot, { recursive: true, mode: 0o700 });
      const value = JSON.stringify({ username: data.username, salt, hash });
      if (!current) {
        try { await writeFile(passwordFile, value, { flag: 'wx', mode: 0o600 }); }
        catch (e) { if (e.code === 'EEXIST') throw new RequestError('O primeiro acesso já foi concluído.', 409); throw e; }
      } else {
        const temp = passwordFile + '.' + randomBytes(12).toString('hex');
        await writeFile(temp, value, { flag: 'wx', mode: 0o600 }); await rename(temp, passwordFile);
      }
      sessions.clear(); login(req, res, data.username); return;
    }
    if (path === '/api/products' && req.method === 'GET') { const data = await store.snapshot(); send(res, 200, { revision: data.revision, products: data.products }); return; }
    if (path === '/api/prices' && req.method === 'POST') {
      const data = await body(req); try { send(res, 200, await store.save(data)); } catch (e) { throw new RequestError(e.message, e.status || 400); } return;
    }
    throw new RequestError('Página não encontrada.', 404);
  } catch (e) { send(res, e.status || 500, { error: e.status ? e.message : 'Não foi possível concluir. Atualize a lista e confira os preços antes de tentar novamente.' }); }
});
server.requestTimeout = 30000; server.headersTimeout = 15000;
setInterval(() => { const now = Date.now(); for (const [id, session] of sessions) if (session.expires < now) sessions.delete(id); for (const [key, a] of attempts) if (a.until < now) attempts.delete(key); }, 60000).unref();
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Painel iniciado na porta ${port}.`));
