/* Shared by the panel preview and the server that publishes the offer. */
(() => {
  const money = cents => 'R$ ' + (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const isRate = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
  const percent = value => (value / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  const readPercent = value => /^\d{1,3}(?:[,.]\d{1,2})?$/.test(value.trim())
    ? Math.round(Number(value.trim().replace(',', '.')) * 100) : NaN;
  const legacyRates = count => Array.from({ length: 10 }, (_, i) => i < count ? 0 : null);
  const defaultTerms = count => ({ discount: 0, scope: 'cash', display: 'offer', rates: legacyRates(count) });
  const termsKey = terms => terms ? JSON.stringify([terms.discount, terms.scope, terms.display, terms.rates]) : '';

  function validate(terms) {
    if (!terms || !isRate(terms.discount, 9999)) throw new Error('Informe um desconto de 0% a 99,99%.');
    if (!['cash', 'all'].includes(terms.scope) || !['offer', 'final'].includes(terms.display)) throw new Error('Escolha como exibir e aplicar o desconto.');
    if (!Array.isArray(terms.rates) || terms.rates.length !== 10 ||
        !Array.from(terms.rates).every(rate => rate === null || isRate(rate, 10000))) {
      throw new Error('Use taxas de 0% a 100%. Deixe em branco as parcelas que não oferece.');
    }
  }

  function describe(base, terms) {
    validate(terms);
    const price = Math.round(base * (10000 - terms.discount) / 10000);
    const cashOnly = terms.discount > 0 && terms.scope === 'cash';
    const installmentBase = cashOnly ? base : price;
    if (!Number.isSafeInteger(base) || base < 1 || price < 1) throw new Error('O preço com desconto precisa ser de pelo menos R$ 0,01.');
    const options = terms.rates.flatMap((rate, index) => {
      if (rate === null) return [];
      const count = index + 1;
      const total = Math.round(installmentBase * (10000 + rate) / 10000);
      const low = Math.floor(total / count);
      const remainder = total % count;
      if (!low) throw new Error('Ative só as opções com parcelas de pelo menos R$ 0,01.');
      return [{ count, rate, total, low, remainder }];
    });
    const reference = terms.discount && terms.display === 'offer' ? 'De ' + money(base) : '';
    return { price, cashOnly, reference, headline: highlight(options), options };
  }

  function highlight(options) {
    const selected = options.filter(option => option.rate === 0).at(-1) ?? options.at(-1);
    if (!selected) return '';
    const label = selected.remainder
      ? `${selected.count}x com parcelas de até ${money(selected.low + 1)}`
      : installmentLabel(selected);
    return (selected.count > 1 ? 'Até ' : '') + label + (selected.rate === 0 ? ' sem juros' : '');
  }

  function presentation(offer) {
    const first = offer.options[0];
    const sameCashPrice = !offer.cashOnly && first?.count === 1 && first.rate === 0 && first.total === offer.price;
    return {
      cashMethods: sameCashPrice ? 'Dinheiro / PIX / 1x Cartão' : '',
      headline: sameCashPrice ? highlight(offer.options.slice(1)) : offer.headline,
      showTable: offer.options.length > Number(sameCashPrice)
    };
  }

  function installmentLabel({ count, low, remainder }) {
    return `${count}x de ${remainder ? 'até ' : ''}${money(low + Number(remainder > 0))}`;
  }

  function table(offer) {
    const hasInterest = offer.options.some(option => option.rate > 0);
    const rows = offer.options.map(option => ({
      installment: installmentLabel(option),
      noInterest: hasInterest && option.rate === 0,
      total: money(option.total)
    }));
    const notes = [];
    if (hasInterest) notes.push('Os totais já incluem os juros de cada opção.');
    if (offer.options.some(option => option.remainder)) notes.push('Nas opções com “até”, algumas parcelas podem ser R$ 0,01 menores.');
    return { rows, notes };
  }

  function optionLabel({ count, rate, total, low, remainder }) {
    const values = remainder
      ? `${remainder} de ${money(low + 1)} + ${count - remainder} de ${money(low)}`
      : `${count}x de ${money(low)}`;
    return `${remainder ? count + 'x (' + values + ')' : values} · ${rate ? percent(rate) + ' de juros' : 'sem juros'} · Total ${money(total)}`;
  }

  const payment = { money, readPercent, defaultTerms, termsKey, describe, optionLabel, table, presentation };
  if (typeof module === 'object' && module.exports) module.exports = payment;
  else globalThis.RdcPayment = payment;
})();
