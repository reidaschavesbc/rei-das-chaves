import payment from '../admin/payment.js';

export const categories = [
  { id: 'eletronicas', name: 'Eletrônicas', file: 'fechaduras-eletronicas.html' },
  { id: 'jbm', name: 'JBM para vidro', file: 'fechaduras-jbm.html' },
  { id: 'stam', name: 'Mecânicas Stam', file: 'fechaduras-mecanicas-stam.html' }
];
export const formatPrice = cents => `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatInstallments = count => count === 0 ? '' : count === 1 ? 'Em 1x sem juros' : `Até ${count}x sem juros`;
export const validInstallments = count => Number.isSafeInteger(count) && count >= 0 && count <= 10;
export function parsePrice(text) {
  const match = text.trim().match(/^R\$\s*([\d.]+),(\d{2})$/);
  if (!match) throw new Error('Preço do catálogo inválido.');
  return Number(match[1].replaceAll('.', '')) * 100 + Number(match[2]);
}
const cards = /(<template data-inactive-product>)?(<a\s+class="product-card"\s+href="(produto-[\w-]+)(?:\.html)?">([\s\S]*?)<\/a>)(?:<\/template>)?/g;
const paymentConfig = /<!--rdc-payment:(\[[^<]*?\])-->/;
const offerMarkup = /<!--rdc-offer-->[\s\S]*?<!--\/rdc-offer-->/g;
export function parseCatalog(html, category) {
  const products = [];
  for (const [, inactive, , id, body] of html.matchAll(cards)) {
    const name = body.match(/class="product-card-name">([^<]+)</)?.[1];
    const image = body.match(/<img\s+src="(image\/[\w/.-]+)"/)?.[1];
    const price = body.match(/class="product-card-price">([^<]+)</)?.[1];
    if (!name || !image || !price) throw new Error(`Produto incompleto: ${id}`);
    const installmentText = body.match(/class="product-card-installments"\s+data-installments="(\d+)"/)?.[1];
    const installments = installmentText === undefined ? 0 : Number(installmentText);
    if (!validInstallments(installments)) throw new Error(`Parcelamento inválido: ${id}`);
    const config = body.match(paymentConfig);
    const product = { id, name, image, category: category.id, catalog: category.file, priceCents: parsePrice(price), installments, active: !inactive };
    if (config) {
      const [base, discount, scope, display, rates] = JSON.parse(config[1]);
      product.priceCents = base;
      product.payment = { discount, scope, display, rates };
      payment.describe(base, product.payment);
    }
    products.push(product);
  }
  if (!products.length) throw new Error(`Catálogo vazio: ${category.file}`);
  return products;
}
export function validateChanges(changes, products) {
  if (!Array.isArray(changes) || !changes.length || changes.length > products.length) throw new Error('Lista de alterações inválida.');
  const ids = new Set();
  for (const change of changes) {
    if (!change || typeof change !== 'object' || !products.some(p => p.id === change.id) || ids.has(change.id)) throw new Error('Produto inválido.');
    const price = Object.hasOwn(change, 'priceCents'), installments = Object.hasOwn(change, 'installments'), visibility = Object.hasOwn(change, 'active');
    const product = products.find(p => p.id === change.id);
    const hasPayment = Object.hasOwn(change, 'payment');
    if (!price && !installments && !visibility && !hasPayment) throw new Error('Nenhuma alteração informada.');
    if (price && (!Number.isSafeInteger(change.priceCents) || change.priceCents < 1 || change.priceCents > 99999999) || installments && !validInstallments(change.installments)) throw new Error('Preço ou parcelamento inválido.');
    if (visibility && typeof change.active !== 'boolean') throw new Error('Visibilidade do produto inválida.');
    const terms = hasPayment ? change.payment : product.payment;
    if (terms !== undefined && terms !== null) payment.describe(change.priceCents ?? product.priceCents, terms);
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
export function updateCatalog(html, id, cents, installments, active, offer) {
  let count = 0;
  const result = html.replace(cards, (block, inactive, card, candidate) => {
    if (candidate !== id) return block;
    count++;
    let result = card;
    if (cents !== undefined) {
      let prices = 0;
      result = result.replace(/(class="product-card-price">)[^<]+(?=<)/g, (_, prefix) => { prices++; return prefix + formatPrice(cents); });
      if (prices !== 1) throw new Error(`Preço do cartão inválido: ${id}.`);
    }
    if (installments !== undefined) result = updateInstallments(result, ['product-card-installments'], installments);
    if (offer) result = renderPayment(result, offer, true);
    return (active ?? !inactive) ? result : '<template data-inactive-product>' + result + '</template>';
  });
  if (count !== 1) throw new Error(`Não foi possível atualizar o cartão de ${id}.`);
  return result;
}
export function updateSitemapVisibility(xml, id, active) {
  return xml.replace(/(?:<!-- inactive-product )?(<url><loc>[^<]*\/(produto-[\w-]+)<\/loc>[^]*?<\/url>)(?: -->)?/g, (block, entry, candidate) => {
    if (candidate !== id) return block;
    return active ? entry : '<!-- inactive-product ' + entry + ' -->';
  });
}
export function updateProduct(html, cents, installments, offer) {
  let count = 0;
  let result = html;
  if (cents !== undefined) {
    result = result.replace(/(class="(?:product-price|sticky-buy-price)">)[^<]+(?=<)/g, (_, prefix) => { count++; return prefix + formatPrice(cents); });
    if (count !== 2) throw new Error('A página do produto mudou de formato. Nenhuma alteração foi publicada.');
  }
  if (installments !== undefined) result = updateInstallments(result, ['product-installments', 'sticky-buy-installments'], installments);
  return offer ? renderPayment(result, offer, false) : result;
}


function renderPayment(html, { priceCents, payment: terms }, isCard) {
  let result = html.replace(paymentConfig, '').replace(offerMarkup, '');
  if (!terms) return result;
  const offer = payment.describe(priceCents, terms);
  const wrap = markup => markup ? '<!--rdc-offer-->' + markup + '<!--/rdc-offer-->' : '';
  const label = offer.cashOnly ? wrap(' <small>à vista</small>') : '';
  const reference = offer.reference ? wrap('<small><del>' + offer.reference + '</del> por</small> ') : '';
  result = result.replace(/(<(?:span|div) class="(product-card-price|product-price|sticky-buy-price)">)[^<]*(<\/(?:span|div)>)/g, (_, open, kind, close) => {
    if (kind === 'sticky-buy-price') return open + formatPrice(offer.price) + label + close;
    return reference + open + formatPrice(offer.price) + close + label;
  });
  const display = payment.presentation(offer);
  const cash = display.cashMethods ? '<div class="payment-cash"><strong>À vista</strong><span>' + display.cashMethods + '</span></div>' : '';
  const details = !isCard && display.showTable ? paymentTable(offer) : '';
  result = result.replace(/(<(p|div) class="(product-card-installments|product-installments|sticky-buy-installments)" data-installments="\d+")(?: hidden)?>[^<]*<\/\2>/g,
    (_, open, tag, kind) => {
      const main = kind === 'product-installments';
      const headline = main ? display.headline : offer.headline;
      const summary = open + (headline ? '' : ' hidden') + '>' + headline + '</' + tag + '>';
      return main ? wrap(cash) + summary + wrap(details) : summary;
    });
  if (isCard) {
    const config = JSON.stringify([priceCents, terms.discount, terms.scope, terms.display, terms.rates]);
    result = result.replace(/<\/a>$/, '<!--rdc-payment:' + config + '--></a>');
  }
  return result;
}

function paymentTable(offer) {
  const { rows, notes } = payment.table(offer);
  const body = rows.map(row => '<tr><th scope="row">' + row.installment +
    (row.noInterest ? '<small>Sem juros</small>' : '') + '</th><td>' + row.total + '</td></tr>').join('');
  const footer = notes.length ? '<p class="payment-options-note">' + notes.join(' ') + '</p>' : '';
  return '<details class="payment-options"><summary>Ver parcelas</summary><div class="payment-options-body">' +
    '<table><thead><tr><th scope="col">Parcelas</th><th scope="col">Total</th></tr></thead>' +
    '<tbody>' + body + '</tbody></table>' + footer + '</div></details>';
}
