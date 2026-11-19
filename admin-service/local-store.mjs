import { readFile, readdir, mkdir, link, writeFile, rename, symlink, rm, realpath } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import payment from '../admin/payment.js';
import { categories, parseCatalog, validateChanges, updateCatalog, updateProduct, updateSitemapVisibility } from './catalog.mjs';
const inactiveDirectory = '.inactive-products';
export function createStore(stateRoot) {
  const root = resolve(stateRoot), releases = join(root, 'releases'), current = join(root, 'current');
  let queue = Promise.resolve();
  async function snapshot() {
    const directory = await realpath(current);
    if (!directory.startsWith(releases + sep)) throw new Error('Diretório do catálogo inválido.');
    const revision = directory.slice(releases.length + 1);
    const pages = new Map(await Promise.all(categories.map(async c => [c.file, await readFile(join(directory, c.file), 'utf8')])));
    const products = categories.flatMap(c => parseCatalog(pages.get(c.file), c));
    return { directory, revision, pages, products };
  }
  async function copyLinks(source, target) {
    await mkdir(target, { recursive: true });
    for (const entry of await readdir(source, { withFileTypes: true })) {
      const from = join(source, entry.name), to = join(target, entry.name);
      if (entry.isDirectory()) await copyLinks(from, to);
      else if (entry.isFile()) await link(from, to);
      else throw new Error('Tipo de arquivo não permitido no site.');
    }
  }
  async function replaceFile(directory, file, content) {
    const target = join(directory, file), temp = `${target}.tmp-${randomUUID()}`;
    // Replace the inode; never modify a hard link into an older release.
    await writeFile(temp, content, { flag: 'wx', mode: 0o644 });
    await rename(temp, target);
  }
  async function save(data) {
    const base = await snapshot();
    validateChanges(data.changes, base.products);
    const changes = data.changes.filter(c => {
      const product = base.products.find(p => p.id === c.id);
      return (c.priceCents !== undefined && product.priceCents !== c.priceCents)
        || (c.installments !== undefined && product.installments !== c.installments)
        || (c.payment !== undefined && payment.termsKey(c.payment) !== payment.termsKey(product.payment))
        || (c.active !== undefined && product.active !== c.active);
    });
    if (!changes.length) return { revision: base.revision, unchanged: true };
    if (data.revision !== base.revision) { const error = new Error('O catálogo mudou em outra sessão. Atualize a lista antes de salvar.'); error.status = 409; throw error; }
    const revision = `${Date.now()}-${randomUUID()}`, directory = join(releases, revision), modified = new Map();
    const moved = [];
    for (const change of changes) {
      const product = base.products.find(p => p.id === change.id);
      const file = `${product.id}.html`, inactiveFile = join(inactiveDirectory, file);
      const source = product.active ? file : inactiveFile;
      const paymentChanged = change.priceCents !== undefined || change.installments !== undefined || change.payment !== undefined;
      const offer = paymentChanged && (product.payment || change.payment !== undefined) ? {
        priceCents: change.priceCents ?? product.priceCents,
        installments: change.installments ?? product.installments,
        payment: change.payment === undefined ? product.payment : change.payment
      } : undefined;
      const priceCents = offer?.priceCents ?? change.priceCents;
      const installments = offer?.installments ?? change.installments;
      if (paymentChanged) {
        modified.set(source, updateProduct(await readFile(join(base.directory, source), 'utf8'), priceCents, installments, offer));
      }
      modified.set(product.catalog, updateCatalog(modified.get(product.catalog) ?? base.pages.get(product.catalog), product.id, priceCents, installments, change.active, offer));
      if (change.active !== undefined && change.active !== product.active) {
        moved.push([source, change.active ? file : inactiveFile]);
        const sitemap = modified.get('sitemap.xml') ?? await readFile(join(base.directory, 'sitemap.xml'), 'utf8').catch(error => {
          if (error.code === 'ENOENT') return '';
          throw error;
        });
        if (sitemap) modified.set('sitemap.xml', updateSitemapVisibility(sitemap, product.id, change.active));
      }
    }
    await copyLinks(base.directory, directory);
    for (const [file, content] of modified) await replaceFile(directory, file, content);
    if (moved.length) await mkdir(join(directory, inactiveDirectory), { recursive: true });
    for (const [source, target] of moved) await rename(join(directory, source), join(directory, target));
    await replaceFile(directory, 'release.json', JSON.stringify({ revision, savedAt: new Date().toISOString(), previous: base.revision, changes }) + '\n');
    const tempLink = join(root, `.current-${randomUUID()}`);
    await symlink(`releases/${revision}`, tempLink);
    // Publish the catalog and product pages together via one atomic symlink replacement.
    await rename(tempLink, current);
    try {
      const active = await realpath(current);
      const entries = (await readdir(releases, { withFileTypes: true })).filter(e => e.isDirectory() && /^\d+-[a-f0-9-]+$/.test(e.name)).map(e => e.name).sort().reverse();
      for (const name of entries.slice(5)) {
        const candidate = await realpath(join(releases, name));
        if (candidate.startsWith(releases + sep) && candidate !== active) await rm(candidate, { recursive: true });
      }
    } catch { /* Cleanup failure does not invalidate a published change. */ }
    return { revision, unchanged: false };
  }
  return { snapshot, save(data) { const result = queue.then(() => save(data)); queue = result.catch(() => {}); return result; } };
}
