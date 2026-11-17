import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { categories, parseCatalog, validateChanges, updateCatalog, updateProduct, formatPrice, formatInstallments } from './catalog.mjs';
const source = process.env.SITE_SOURCE;
if (!source) throw new Error('Informe SITE_SOURCE apontando para os arquivos públicos do site.');
const catalogs = new Map(await Promise.all(categories.map(async c => [c.file, await readFile(resolve(source, c.file), 'utf8')])));
const products = categories.flatMap(c => parseCatalog(catalogs.get(c.file), c));
test('o catálogo real contém 23 produtos únicos em três categorias, com páginas e imagens existentes', async () => {
  assert.equal(products.length, 23); assert.equal(new Set(products.map(p => p.id)).size, 23);
  assert.equal(new Set(products.map(p => p.category)).size, 3);
  for (const p of products) { assert.ok(p.priceCents > 0); await readFile(resolve(source, p.image)); const html = await readFile(resolve(source, p.id + '.html'), 'utf8'); assert.ok(updateProduct(html, 12345).includes('R$ 123,45')); }
});
test('alterar Athenas não muda nenhum outro cartão', () => {
  const category = categories[0], html = catalogs.get(category.file);
  const updated = updateCatalog(html, 'produto-fechadura-athenas', 72500);
  const parsed = parseCatalog(updated, category);
  assert.equal(parsed.find(p => p.id === 'produto-fechadura-athenas').priceCents, 72500);
  for (const p of parsed.filter(p => p.id !== 'produto-fechadura-athenas')) assert.deepEqual(p, products.find(old => old.id === p.id));
});
test('preço principal e barra de compra são atualizados juntos', async () => {
  const html = await readFile(resolve(source, 'produto-fechadura-athenas.html'), 'utf8');
  const after = updateProduct(html, 72500);
  assert.equal((after.match(/R\$ 725,00/g) || []).length, 2);
  const originalPrice = formatPrice(products.find(p => p.id === 'produto-fechadura-athenas').priceCents);
  assert.equal(after, html.replaceAll(originalPrice, 'R$ 725,00'));
  assert.throws(() => updateProduct('<div>formato inesperado</div>', 100));
});
test('rejeita duplicidade, arquivos desconhecidos e preços inválidos', () => {
  const good = { id: products[0].id, priceCents: 75000 };
  for (const changes of [[], [good, good], [{ ...good, id: '../server' }], [{ ...good, priceCents: 0 }], [{ ...good, priceCents: -1 }], [{ ...good, priceCents: 12.5 }], [{ ...good, priceCents: '75000' }], [{ ...good, priceCents: 100000000 }]]) assert.throws(() => validateChanges(changes, products));
  validateChanges([good], products); assert.equal(formatPrice(123456), 'R$ 1.234,56');
});

test('Dubai Wi-Fi tem preço editável separado da Dubai Face ID', async () => {
  const id = 'produto-fechadura-dubai-wifi';
  const product = products.find(p => p.id === id);
  assert.ok(product);
  const face = products.find(p => p.id === 'produto-fechadura-dubai');
  assert.ok(face);
  const html = await readFile(resolve(source, id + '.html'), 'utf8');
  assert.equal((html.match(/class="(?:product-price|sticky-buy-price)">/g) || []).length, 2);
  const after = updateProduct(html, 12345);
  assert.equal((after.match(/R\$ 123,45/g) || []).length, 2);
  assert.match(html, /quatro pilhas AA/);
  assert.doesNotMatch(html, /recarregável|3\.000 mAh|leitor facial 3D/i);
  const catalog = updateCatalog(catalogs.get(product.catalog), id, 12345);
  const parsed = parseCatalog(catalog, categories[0]);
  assert.equal(parsed.find(p => p.id === id).priceCents, 12345);
  assert.equal(parsed.find(p => p.id === face.id).priceCents, face.priceCents);
});

test('todos os produtos têm parcelas individuais dentro do limite permitido', () => {
  assert.equal(products.length, 23);
  for (const product of products) assert.ok(Number.isInteger(product.installments) && product.installments >= 0 && product.installments <= 10, product.id);
});
test('alterar só parcelas preserva preço e condições dos outros produtos', async () => {
  const product = products[0], catalog = catalogs.get(product.catalog);
  const changed = parseCatalog(updateCatalog(catalog, product.id, undefined, 8), categories[0]);
  assert.equal(changed.find(p => p.id === product.id).installments, 8);
  assert.equal(changed.find(p => p.id === product.id).priceCents, product.priceCents);
  for (const p of changed.filter(p => p.id !== product.id)) assert.deepEqual(p, products.find(original => original.id === p.id));
  const html = await readFile(resolve(source, product.id + '.html'), 'utf8');
  const after = updateProduct(html, undefined, 8);
  assert.equal((after.match(/Até 8x sem juros/g) || []).length, 2);
  assert.deepEqual(after.match(/class="(?:product-price|sticky-buy-price)">[^<]+/g), html.match(/class="(?:product-price|sticky-buy-price)">[^<]+/g));
});
test('parcelamento pode ser ocultado e restaurado, inclusive para uma parcela', async () => {
  const html = await readFile(resolve(source, products[0].id + '.html'), 'utf8');
  const hidden = updateProduct(html, undefined, 0);
  assert.equal((hidden.match(/data-installments="0" hidden>/g) || []).length, 2);
  assert.doesNotMatch(hidden, /Até 0x/);
  const restored = updateProduct(hidden, undefined, 1);
  assert.equal((restored.match(/Em 1x sem juros/g) || []).length, 2);
  assert.doesNotMatch(restored, /data-installments="1" hidden/);
  assert.equal(formatInstallments(10), 'Até 10x sem juros');
});
test('servidor rejeita parcelas inválidas e aceita alteração isolada ou combinada', () => {
  const id = products[0].id;
  for (const installments of [-1,11,24,25,1.5,'5',null,Infinity]) assert.throws(() => validateChanges([{ id, installments }], products));
  assert.throws(() => validateChanges([{ id }], products));
  validateChanges([{ id, installments: 8 }], products);
  validateChanges([{ id, priceCents: 99000, installments: 3 }], products);
});
