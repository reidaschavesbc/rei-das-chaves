import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const actions = ['views', 'whatsapp', 'phone'];

export function createAnalytics(privateRoot, publicRoot, now = () => new Date()) {
  const file = join(privateRoot, 'analytics.json');
  let queue = Promise.resolve();
  let pending = 0;

  async function read() {
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }

  async function write(data) {
    await mkdir(privateRoot, { recursive: true, mode: 0o700 });
    await writeFile(file + '.tmp', JSON.stringify(data), { mode: 0o600 });
    await rename(file + '.tmp', file);
  }

  function enqueue(change) {
    const task = queue.then(change);
    queue = task.catch(() => {});
    return task;
  }

  async function record({ page, action }) {
    if (typeof page !== 'string' || !/^\/(?:[a-z0-9-]{1,100})?$/.test(page) || !actions.includes(action)) return false;
    const pageFile = join(publicRoot, page === '/' ? 'index.html' : page.slice(1) + '.html');
    const info = await stat(pageFile).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!info?.isFile() || pending >= 64) return false;
    const day = dayFormat.format(now());
    pending++;
    const task = enqueue(async () => {
      const data = await read();
      const counts = (data[day] ??= {})[page] ??= {};
      counts[action] = (counts[action] ?? 0) + 1;
      await write(data);
    });
    try { await task; return true; } finally { pending--; }
  }

  function reset(expectedRevision) {
    return enqueue(async () => {
      const { resetRevision = 'initial' } = await read();
      if (resetRevision !== expectedRevision) return false;
      await write({ resetRevision: randomUUID() });
      return true;
    });
  }

  async function report(days) {
    const { resetRevision = 'initial', ...data } = await read();
    const today = dayFormat.format(now());
    const cutoff = new Date(today + 'T12:00:00Z');
    cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
    const from = cutoff.toISOString().slice(0, 10);
    const totals = { views: 0, whatsapp: 0, phone: 0 };
    const pages = new Map();
    for (const [day, counts] of Object.entries(data)) {
      if (day < from || day > today) continue;
      for (const [page, values] of Object.entries(counts)) {
        if (!pages.has(page)) pages.set(page, { page, views: 0, whatsapp: 0, phone: 0 });
        for (const action of actions) {
          const count = values[action] ?? 0;
          pages.get(page)[action] += count;
          totals[action] += count;
        }
      }
    }
    return { resetRevision, totals, pages: [...pages.values()].sort((a, b) => b.views - a.views || a.page.localeCompare(b.page)) };
  }

  return { record, report, reset };
}
