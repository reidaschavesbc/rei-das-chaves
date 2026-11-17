export const categories = [
  { id: 'eletronicas', name: 'Eletrônicas', file: 'fechaduras-eletronicas.html' },
  { id: 'jbm', name: 'JBM para vidro', file: 'fechaduras-jbm.html' },
  { id: 'stam', name: 'Mecânicas Stam', file: 'fechaduras-mecanicas-stam.html' }
];
export const formatPrice = cents => `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatInstallments = count => count === 0 ? '' : count === 1 ? 'Em 1x sem juros' : `Até ${count}x sem juros`;
export const validInstallments = count => Number.isSafeInteger(count) && count >= 0 && count <= 24;
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
    const installmentText = body.match(/class="product-card-installments"\s+data-installments="(\d+)"/)?.[1];
    const installments = installmentText === undefined ? 0 : Number(installmentText);
    if (!validInstallments(installments)) throw new Error(`Parcelamento inválido: ${id}`);
    products.push({ id, name, image, category: category.id, catalog: category.file, priceCents: parsePrice(price), installments });
  }
  if (!products.length) throw new Error(`Catálogo vazio: ${category.file}`);
  return products;
}
export function validateChanges(changes, products) {
  if (!Array.isArray(changes) || !changes.length || changes.length > products.length) throw new Error('Lista de alterações inválida.');
  const ids = new Set();
  for (const change of changes) {
    if (!change || typeof change !== 'object' || !products.some(p => p.id === change.id) || ids.has(change.id)) throw new Error('Produto inválido.');
    const price = Object.hasOwn(change, 'priceCents'), installments = Object.hasOwn(change, 'installments');
    if (!price && !installments || price && (!Number.isSafeInteger(change.priceCents) || change.priceCents < 1 || change.priceCents > 99999999) || installments && !validInstallments(change.installments)) throw new Error('Preço ou parcelamento inválido.');
    ids.add(change.id);
  }
}
function updateInstallments(html, classes, installments) {
  if (!validInstallments(installments)) throw new Error('Parcelamento inválido.');
  let count = 0;
  const result = html.replace(new RegExp(`(<(?:p|div) class="(?:${classes.join('|')})" data-installments=")\\d+("(?: hidden)?>)[^<]*(?=<)`, 'g'), (_, prefix) => {
    count++;
    return prefix + installments + '"' + (installments === 0 ? ' hidden' : '') + '>' + formatInstallments(installments);
  });
  if (count !== classes.length) throw new Error('O parcelamento da página mudou de formato. Nenhuma alteração foi publicada.');
  return result;
}
export function updateCatalog(html, id, cents, installments) {
  let count = 0;
  const result = html.replace(/(<a\s+class="product-card"\s+href=")(produto-[\w-]+)(\.html)?(">[\s\S]*?<\/a>)/g, (block, _start, candidate) => {
    if (candidate !== id) return block;
    count++;
    let result = block;
    if (cents !== undefined) {
      let prices = 0;
      result = result.replace(/(class="product-card-price">)[^<]+(?=<)/g, (_, prefix) => { prices++; return prefix + formatPrice(cents); });
      if (prices !== 1) throw new Error(`Preço do cartão inválido: ${id}.`);
    }
    if (installments !== undefined) result = updateInstallments(result, ['product-card-installments'], installments);
    return result;
  });
  if (count !== 1) throw new Error(`Não foi possível atualizar o cartão de ${id}.`);
  return result;
}
export function updateProduct(html, cents, installments) {
  let count = 0;
  let result = html;
  if (cents !== undefined) {
    result = result.replace(/(class="(?:product-price|sticky-buy-price)">)[^<]+(?=<)/g, (_, prefix) => { count++; return prefix + formatPrice(cents); });
    if (count !== 2) throw new Error('A página do produto mudou de formato. Nenhuma alteração foi publicada.');
  }
  if (installments !== undefined) result = updateInstallments(result, ['product-installments', 'sticky-buy-installments'], installments);
  return result;
}
