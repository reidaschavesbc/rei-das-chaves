(function () {
  'use strict';
  const categories = { carro: 'Carro', moto: 'Moto' };
  const services = {
    perdeu: 'Todas as chaves perdidas',
    copia: 'Cópia / chave reserva',
    controle: 'Problema no controle ou telecomando',
    abertura: 'Abertura de veículo',
    outro: 'Outro serviço automotivo',
  };
  const types = { simples: 'Chave simples', canivete: 'Chave canivete', presenca: 'Chave de presença', naosei: 'Não sei / preciso de orientação' };
  const functions = { abrir: 'Somente abrir as portas', partida: 'Abrir as portas e dar partida', completa: 'Abrir, dar partida e usar o controle', naosei: 'Não sei / preciso de orientação' };
  const coding = { sim: 'Sim, com chip', nao: 'Não, sem chip', naosei: 'Não sei' };
  const situations = { sim: 'Tenho uma chave funcionando', perdeu: 'Todas as chaves foram perdidas', naofunciona: 'Tenho uma chave, mas ela não funciona', naosei: 'Não sei' };
  const states = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
  const value = (a, key) => typeof a[key] === 'string' ? a[key].trim() : '';
  const attendance = a => a.servico === 'abertura' ? 'local' : value(a, a.categoria === 'moto' ? 'atendimento_moto' : 'atendimento');
  const digits = cep => String(cep || '').replace(/\D/g, '');
  const formatCep = cep => digits(cep).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

  function sequence(a) {
    if (!categories[a.categoria]) return ['categoria'];
    if (!services[a.servico]) return ['categoria', 'servico'];
    const result = ['categoria', 'servico', a.categoria === 'moto' ? 'veiculo_moto' : 'veiculo'];
    if (['perdeu', 'copia'].includes(a.servico)) {
      result.push(...(a.categoria === 'moto' ? ['codificacao'] : ['tipo', 'funcao']));
    }
    // Losing every key already answers the question about an existing key.
    if (['copia', 'controle'].includes(a.servico)) result.push('situacao');
    if (attendance(a) === 'local') result.push('endereco');
    result.push('final');
    return result;
  }

  function validateStep(step, a) {
    const filled = (...fields) => fields.every(key => value(a, key));
    switch (step) {
      case 'categoria': return Boolean(categories[a.categoria]);
      case 'servico': return Boolean(services[a.servico]);
      case 'veiculo': return Boolean(filled('marca', 'modelo') && ['loja', 'local'].includes(attendance(a)));
      case 'veiculo_moto': return Boolean(filled('modelo_moto') && ['loja', 'local'].includes(attendance(a)));
      case 'tipo': return Boolean(types[a.tipo]);
      case 'funcao': return Boolean(functions[a.funcao]);
      case 'codificacao': return Boolean(coding[a.codificacao]);
      case 'situacao': return Boolean(situations[a.situacao]);
      case 'endereco': return Boolean(filled('rua', 'numero', 'bairro', 'cidade') && states.has(value(a, 'uf').toUpperCase()) && (!value(a, 'cep') || /^\d{8}$/.test(digits(a.cep))));
      case 'final': return Boolean(filled('nome') && (a.servico !== 'outro' || filled('observacao')));
      default: return false;
    }
  }

  function vehicleRows(a) {
    const moto = a.categoria === 'moto';
    return [['Categoria', categories[a.categoria]], ['Marca', value(a, moto ? 'marca_moto' : 'marca')], ['Modelo', value(a, moto ? 'modelo_moto' : 'modelo')], ['Ano', value(a, moto ? 'ano_moto' : 'ano')]].filter(([, v]) => v);
  }
  function keyRows(a) {
    const seq = sequence(a), rows = [];
    if (seq.includes('tipo')) rows.push([a.servico === 'perdeu' ? 'Tipo de chave perdida' : 'Tipo de chave desejada', types[a.tipo]]);
    if (seq.includes('funcao')) {
      rows.push(['Funções necessárias', functions[a.funcao]]);
      if (coding[a.chip]) rows.push(['Chave com chip', coding[a.chip]]);
    }
    if (seq.includes('codificacao')) rows.push(['Chave codificada', coding[a.codificacao]]);
    if (seq.includes('situacao')) rows.push(['Situação da chave atual', situations[a.situacao]]);
    return rows.filter(([, v]) => v);
  }
  function addressRows(a) {
    if (attendance(a) !== 'local') return [];
    return [
      ['Endereço', [value(a, 'rua'), value(a, 'numero')].filter(Boolean).join(', ')],
      ['Bairro', value(a, 'bairro')],
      ['Cidade / UF', [value(a, 'cidade'), value(a, 'uf').toUpperCase()].filter(Boolean).join(' / ')],
      ['CEP', value(a, 'cep') ? formatCep(a.cep) : ''],
      ['Complemento', value(a, 'complemento')],
      ['Ponto de referência', value(a, 'referencia')],
    ].filter(([, v]) => v);
  }
  const attendanceLabel = a => attendance(a) === 'loja' ? 'Vou levar o veículo à loja' : 'Preciso de atendimento no local';
  function summaryRows(a) {
    return [['Serviço', services[a.servico]], ...vehicleRows(a), ...keyRows(a), ['Atendimento', attendanceLabel(a)], ...addressRows(a)].filter(([, v]) => v);
  }
  function buildMessage(a) {
    const lines = ['Olá, Rei das Chaves! Gostaria de solicitar um atendimento automotivo.', '', '*CLIENTE*', `Nome: ${value(a, 'nome')}`, '', '*SERVIÇO SOLICITADO*', `Serviço: ${services[a.servico]}`];
    if (a.servico === 'perdeu') lines.push('Todas as chaves do veículo foram perdidas. Preciso avaliar a confecção de uma nova chave.');
    if (a.servico === 'copia') lines.push('Gostaria de fazer uma cópia ou chave reserva para o veículo abaixo.');
    if (a.servico === 'abertura') lines.push('Preciso de ajuda para abrir o veículo no endereço informado abaixo.');
    lines.push('', '*VEÍCULO*', ...vehicleRows(a).map(([label, text]) => `${label}: ${text}`));
    const keys = keyRows(a);
    if (keys.length) lines.push('', '*INFORMAÇÕES DA CHAVE*', ...keys.map(([label, text]) => `${label}: ${text}`));
    lines.push('', '*ATENDIMENTO*', attendanceLabel(a));
    if (attendance(a) === 'local') lines.push(...addressRows(a).map(([label, text]) => `${label}: ${text}`));
    if (value(a, 'observacao')) lines.push('', '*DETALHES INFORMADOS PELO CLIENTE*', value(a, 'observacao'));
    lines.push('', 'Pode confirmar a disponibilidade, o orçamento e a previsão de atendimento?');
    return lines.join('\n');
  }

  async function lookupCep(cep, options = {}) {
    const code = digits(cep);
    if (!/^\d{8}$/.test(code)) throw new Error('Informe um CEP com 8 números ou preencha o endereço manualmente.');
    const response = await (options.fetch || globalThis.fetch)(`https://viacep.com.br/ws/${code}/json/`, { signal: options.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('A consulta de CEP está indisponível. Preencha o endereço manualmente.');
    const data = await response.json();
    if (!data || data.erro) throw new Error('CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.');
    // Accept only plain text fields; never insert provider HTML into the page.
    const text = (key, max) => typeof data[key] === 'string' ? data[key].trim().slice(0, max) : '';
    return { rua: text('logradouro', 160), bairro: text('bairro', 100), cidade: text('localidade', 100), uf: states.has(text('uf', 2).toUpperCase()) ? text('uf', 2).toUpperCase() : '' };
  }
  globalThis.Automotivo = Object.freeze({ sequence, validateStep, summaryRows, buildMessage, lookupCep, formatCep, attendance });
})();
