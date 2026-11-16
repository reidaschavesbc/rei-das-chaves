export const categories = [
  { id: 'eletronicas', name: 'Eletrônicas', file: 'fechaduras-eletronicas.html' },
  { id: 'jbm', name: 'JBM para vidro', file: 'fechaduras-jbm.html' },
  { id: 'stam', name: 'Mecânicas Stam', file: 'fechaduras-mecanicas-stam.html' }
];
export const formatPrice = cents => `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function parsePrice(text) {
  const match = text.trim().match(/^R\$\s*([\d.]+),(\d{2})$/);
  if (!match) throw new Error('Preço do catálogo inválido.');
  return Number(match[1].replaceAll('.', '')) * 100 + Number(match[2]);
}
export function parseCatalog(html, category) {
  const products = [];
  for (const match of html.matchAll(/<a\s+class="product-card"\s+href="(produto-[\w-]+)(?:\.html)?">([\s\S]*?)<\/a>/g)) {
    const [, id, body] = match;
    const name = body.match(/class="product-card-name">([^<]+)</)?.[1];
    const image = body.match(/<img\s+src="(image\/[\w/.-]+)"/)?.[1];
    const price = body.match(/class="product-card-price">([^<]+)</)?.[1];
    if (!name || !image || !price) throw new Error(`Produto incompleto: ${id}`);
    products.push({ id, name, image, category: category.id, catalog: category.file, priceCents: parsePrice(price) });
  }
  if (!products.length) throw new Error(`Catálogo vazio: ${category.file}`);
  return products;
}
export function validateChanges(changes, products) {
  if (!Array.isArray(changes) || !changes.length || changes.length > products.length) throw new Error('Lista de alterações inválida.');
  const ids = new Set();
  for (const change of changes) {
    if (!change || typeof change !== 'object' || !products.some(p => p.id === change.id) || ids.has(change.id) || !Number.isSafeInteger(change.priceCents) || change.priceCents < 1 || change.priceCents > 99999999) throw new Error('Produto ou preço inválido.');
    ids.add(change.id);
  }
}
export function updateCatalog(html, id, cents) {
  let count = 0;
  const result = html.replace(/(<a\s+class="product-card"\s+href=")(produto-[\w-]+)(\.html)?(">[\s\S]*?<\/a>)/g, (block, _start, candidate) => {
    if (candidate !== id) return block;
    return block.replace(/(class="product-card-price">)[^<]+(?=<)/g, (_, prefix) => { count++; return prefix + formatPrice(cents); });
  });
  if (count !== 1) throw new Error(`Não foi possível atualizar o cartão de ${id}.`);
  return result;
}
export function updateProduct(html, cents) {
  let count = 0;
  const result = html.replace(/(class="(?:product-price|sticky-buy-price)">)[^<]+(?=<)/g, (_, prefix) => { count++; return prefix + formatPrice(cents); });
  if (count !== 2) throw new Error('A página do produto mudou de formato. Nenhuma alteração foi publicada.');
  return result;
}
