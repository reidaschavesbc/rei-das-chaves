(function () {
  'use strict';
  const categories = { carro: 'Carro', moto: 'Moto' };
  const services = {
    perdeu: 'Todas as chaves perdidas',
    copia: 'Cópia / chave reserva',
    controle: 'Problema no controle ou telecomando',
    chave: 'Chave danificada ou não funciona',
    abertura: 'Abertura de veículo',
    outro: 'Outro serviço automotivo',
  };
  const types = { simples: 'Chave simples', canivete: 'Chave canivete', presenca: 'Chave de presença', naosei: 'Não sei / preciso de orientação' };
  const functions = { abrir: 'Somente abrir as portas', partida: 'Abrir as portas e dar partida', completa: 'Abrir, dar partida e usar o controle', naosei: 'Não sei / preciso de orientação' };
  const coding = { sim: 'Sim, com chip', nao: 'Não, sem chip', naosei: 'Não sei' };
  const situations = { sim: 'Tenho uma chave funcionando', perdeu: 'Todas as chaves foram perdidas', naofunciona: 'Tenho uma chave, mas ela não funciona', naosei: 'Não sei' };
  const motoTypes = { contato: 'Chave no contato', presenca: 'Chave de presença', naosei: 'Não sei' };
  const problems = { molhou: 'Molhou / teve contato com água', botoes: 'Os botões não funcionam', danificada: 'Chave ou controle quebrado / danificado', reconhecimento: 'O veículo não reconhece a chave', outro: 'Outro problema', naosei: 'Não sei explicar' };
  const starting = { sim: 'Sim, liga normalmente', nao: 'Não liga', naosei: 'Não sei / não testei' };
  const openings = { banco: 'Banco', bau: 'Baú', ambos: 'Banco e baú', naosei: 'Não sei / preciso de orientação' };
  const resolveAnswers = a => a.servico === 'copia' && a.situacao === 'perdeu' ? { ...a, servico: 'perdeu' } : a;
  const serviceLabel = a => a.categoria === 'moto' && a.servico === 'abertura' ? 'Abertura — banco ou baú' : services[a.servico];
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
      if (a.categoria === 'moto') {
        result.push('tipo_moto');
        if (a.tipo_moto === 'contato') result.push('codificacao');
      } else result.push('tipo', 'funcao');
    }
    // Losing every key already answers the question about an existing key.
    if (['copia', 'controle'].includes(a.servico)) result.push('situacao');
    if (['controle', 'chave'].includes(a.servico) || a.servico === 'copia' && a.situacao === 'naofunciona') result.push('problema', 'partida');
    if (a.categoria === 'moto' && a.servico === 'abertura') result.push('abertura_moto');
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
      case 'tipo_moto': return Boolean(motoTypes[a.tipo_moto]);
      case 'problema': return Boolean(problems[a.problema]);
      case 'partida': return Boolean(starting[a.partida]);
      case 'abertura_moto': return Boolean(openings[a.abertura_moto]);
      case 'funcao': return Boolean(functions[a.funcao]);
      case 'codificacao': return Boolean(coding[a.codificacao]);
      case 'situacao': return Boolean(situations[a.situacao]) && !(a.servico === 'copia' && a.situacao === 'perdeu');
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
    if (seq.includes('tipo_moto')) rows.push(['Tipo de chave da moto', motoTypes[a.tipo_moto]]);
    if (seq.includes('situacao')) rows.push(['Situação da chave atual', situations[a.situacao]]);
    if (seq.includes('problema')) rows.push(['Problema informado', problems[a.problema]]);
    if (seq.includes('partida')) rows.push(['O veículo liga?', starting[a.partida]]);
    if (seq.includes('abertura_moto')) rows.push(['O que precisa abrir', openings[a.abertura_moto]]);
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
    a = resolveAnswers(a);
    return [['Serviço', serviceLabel(a)], ...vehicleRows(a), ...keyRows(a), ['Atendimento', attendanceLabel(a)], ...addressRows(a)].filter(([, v]) => v);
  }
  function buildMessage(a) {
    a = resolveAnswers(a);
    const lines = ['Olá, Rei das Chaves! Gostaria de solicitar um atendimento automotivo.', '', '*CLIENTE*', `Nome: ${value(a, 'nome')}`, '', '*SERVIÇO SOLICITADO*', `Serviço: ${serviceLabel(a)}`];
    if (a.servico === 'perdeu') lines.push('Todas as chaves do veículo foram perdidas. Preciso avaliar a confecção de uma nova chave.');
    if (a.servico === 'copia') lines.push('Gostaria de fazer uma cópia ou chave reserva para o veículo abaixo.');
    if (a.servico === 'abertura') lines.push(a.categoria === 'moto' ? 'Preciso de ajuda para abrir o banco ou baú da moto no endereço informado abaixo.' : 'Preciso de ajuda para abrir o veículo no endereço informado abaixo.');
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
  globalThis.Automotivo = Object.freeze({ sequence, validateStep, summaryRows, buildMessage, lookupCep, formatCep, attendance, resolveAnswers });
})();
