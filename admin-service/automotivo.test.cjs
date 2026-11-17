const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({});
const source = process.env.AUTOMOTIVO_SOURCE || path.resolve(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(source, 'js/automotivo-core.js'), 'utf8'), context);
const core = context.Automotivo;
const local = { categoria: 'moto', servico: 'perdeu', modelo_moto: 'CG 150', ano_moto: '2014', atendimento_moto: 'local', codificacao: 'naosei', nome: 'Bruno', cep: '88330-000', rua: 'Rua das Flores', numero: '120', bairro: 'Centro', cidade: 'Itajaí', uf: 'SC', complemento: 'Garagem', referencia: 'Ao lado do mercado', observacao: 'Veículo parado' };

test('perda de todas as chaves não repete pergunta sobre chave funcional, para carro e moto', () => {
  for (const categoria of ['carro', 'moto']) {
    const a = { ...local, categoria, atendimento: 'local', situacao: 'sim' };
    assert.equal(core.sequence(a).includes('situacao'), false);
    const text = core.buildMessage(a);
    assert.match(text, /Serviço: Todas as chaves perdidas/);
    assert.doesNotMatch(text, /Tenho uma chave funcionando|Situação da chave atual|Possui chave/);
  }
});
test('cópia e controle preservam a pergunta necessária sobre a chave atual', () => {
  for (const categoria of ['carro', 'moto']) for (const servico of ['copia', 'controle']) {
    assert.equal(core.sequence({ categoria, servico, atendimento: 'loja', atendimento_moto: 'loja' }).includes('situacao'), true);
  }
});
test('endereço é solicitado só para atendimento no local em todos os serviços e categorias', () => {
  for (const categoria of ['carro', 'moto']) for (const servico of ['perdeu', 'copia', 'controle', 'abertura', 'outro']) {
    const a = { categoria, servico, atendimento: 'loja', atendimento_moto: 'loja' };
    assert.equal(core.sequence(a).includes('endereco'), servico === 'abertura');
    a.atendimento = a.atendimento_moto = 'local';
    assert.equal(core.sequence(a).includes('endereco'), true);
  }
});
test('endereço manual aceita outras cidades e número s/n sem obrigar CEP', () => {
  assert.equal(core.validateStep('endereco', { ...local, cep: '', cidade: 'Camboriú', numero: 's/n' }), true);
  for (const field of ['rua', 'numero', 'bairro', 'cidade', 'uf']) {
    assert.equal(core.validateStep('endereco', { ...local, [field]: '   ' }), false, field);
  }
  assert.equal(core.validateStep('endereco', { ...local, cep: '123' }), false);
  assert.equal(core.validateStep('endereco', { ...local, uf: 'XX' }), false);
});
test('campos obrigatórios rejeitam espaços e observação é exigida para outro serviço', () => {
  assert.equal(core.validateStep('veiculo', { marca: ' ', modelo: 'Gol', atendimento: 'local' }), false);
  assert.equal(core.validateStep('final', { nome: 'Bruno', servico: 'outro', observacao: '  ' }), false);
  assert.equal(core.validateStep('final', { nome: 'Bruno', servico: 'perdeu' }), true);
});
test('mensagem tem serviço, veículo e endereço completo com número e orientação final', () => {
  const message = core.buildMessage(local);
  for (const part of ['Nome: Bruno', 'Modelo: CG 150', 'Ano: 2014', 'Endereço: Rua das Flores, 120', 'Bairro: Centro', 'Cidade / UF: Itajaí / SC', 'CEP: 88330-000', 'Complemento: Garagem', 'Ponto de referência: Ao lado do mercado', 'orçamento e a previsão de atendimento?']) assert.ok(message.includes(part), part);
});
test('voltar e trocar categoria/serviço não vaza respostas de etapas inativas', () => {
  const message = core.buildMessage({ ...local, servico: 'abertura', tipo: 'presenca', funcao: 'completa', chip: 'sim', situacao: 'sim', marca: 'Marca antiga' });
  assert.doesNotMatch(message, /Tipo de chave|Funções necessárias|Chave com chip|Chave codificada|Situação da chave|Marca antiga/);
  const shop = core.buildMessage({ ...local, atendimento_moto: 'loja' });
  assert.doesNotMatch(shop, /Rua das Flores|Itajaí|88330|Garagem|Ao lado do mercado/);
});
test('resumo e mensagem usam os mesmos dados de endereço', () => {
  const message = core.buildMessage(local);
  for (const [label, text] of core.summaryRows(local)) assert.ok(message.includes(`${label}: ${text}`) || label === 'Atendimento', label);
});
test('consulta CEP usa HTTPS e não envia nome, número, cookies ou referenciador', async () => {
  let seen;
  const address = await core.lookupCep('01001-000', { fetch: async (url, options) => {
    seen = { url, options };
    return { ok: true, json: async () => ({ logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' }) };
  } });
  assert.equal(seen.url, 'https://viacep.com.br/ws/01001000/json/');
  assert.equal(seen.options.credentials, 'omit'); assert.equal(seen.options.referrerPolicy, 'no-referrer');
  assert.equal(address.rua, 'Praça da Sé'); assert.equal(address.cidade, 'São Paulo');
});
test('CEP inválido não faz requisição e CEP inexistente permite tratamento de erro', async () => {
  let calls = 0;
  const fetch = async () => { calls++; return { ok: true, json: async () => ({ erro: true }) }; };
  await assert.rejects(core.lookupCep('123', { fetch }), /8 números/); assert.equal(calls, 0);
  await assert.rejects(core.lookupCep('99999999', { fetch }), /não encontrado/);
  await assert.rejects(core.lookupCep('01001000', { fetch: async () => ({ ok: false }) }), /manualmente/);
});
test('CEP genérico deixa campos faltantes para preenchimento manual, sem inventar rua', async () => {
  const address = await core.lookupCep('88330000', { fetch: async () => ({ ok: true, json: async () => ({ localidade: 'Balneário Camboriú', uf: 'SC' }) }) });
  assert.equal(address.rua, ''); assert.equal(address.bairro, ''); assert.equal(address.uf, 'SC');
});
test('resposta inesperada do provedor não injeta objetos nos campos', async () => {
  const address = await core.lookupCep('01001000', { fetch: async () => ({ ok: true, json: async () => ({ logradouro: {}, bairro: null, localidade: [], uf: 'XX' }) }) });
  assert.equal(address.rua, ''); assert.equal(address.cidade, ''); assert.equal(address.uf, '');
});

test('cópia com todas as chaves perdidas é resolvida para perda total e não gera mensagem contraditória', () => {
  for (const categoria of ['carro', 'moto']) {
    const a = { ...local, categoria, servico: 'copia', situacao: 'perdeu' };
    assert.equal(core.validateStep('situacao', a), false);
    assert.equal(core.resolveAnswers(a).servico, 'perdeu');
    const message = core.buildMessage(a);
    assert.match(message, /Serviço: Todas as chaves perdidas/);
    assert.doesNotMatch(message, /Serviço: Cópia|Gostaria de fazer uma cópia/);
  }
});
test('problema de água é coletado para chave e controle, em carros e motos', () => {
  for (const categoria of ['carro', 'moto']) for (const servico of ['controle', 'chave', 'copia']) {
    const a = { ...local, categoria, servico, situacao: 'naofunciona', problema: 'molhou', partida: 'nao' };
    assert.ok(core.sequence(a).includes('problema'));
    assert.ok(core.sequence(a).includes('partida'));
    assert.equal(core.validateStep('problema', a), true);
    const message = core.buildMessage(a);
    assert.match(message, /Problema informado: Molhou \/ teve contato com água/);
    assert.match(message, /O veículo liga\?: Não liga/);
  }
});
test('perda de chaves e abertura não carregam diagnóstico antigo de água', () => {
  for (const servico of ['perdeu', 'abertura']) {
    const a = { ...local, servico, problema: 'molhou', partida: 'nao' };
    assert.doesNotMatch(core.buildMessage(a), /Molhou|O veículo liga/);
  }
});
test('moto pergunta tipo e só pergunta codificação quando a chave é de contato', () => {
  for (const servico of ['perdeu', 'copia']) for (const tipo_moto of ['contato', 'presenca', 'naosei']) {
    const a = { ...local, servico, tipo_moto };
    assert.ok(core.sequence(a).includes('tipo_moto'));
    assert.equal(core.sequence(a).includes('codificacao'), tipo_moto === 'contato');
    assert.equal(core.validateStep('tipo_moto', a), true);
    assert.equal(core.sequence(a).includes('funcao'), false);
  }
});
test('abertura de moto identifica banco e baú; abertura de carro continua própria', () => {
  const a = { ...local, servico: 'abertura', abertura_moto: 'bau' };
  assert.ok(core.sequence(a).includes('abertura_moto'));
  assert.equal(core.validateStep('abertura_moto', a), true);
  assert.match(core.buildMessage(a), /Serviço: Abertura — banco ou baú/);
  assert.match(core.buildMessage(a), /O que precisa abrir: Baú/);
  const car = { ...a, categoria: 'carro' };
  assert.equal(core.sequence(car).includes('abertura_moto'), false);
  assert.doesNotMatch(core.buildMessage(car), /banco ou baú|O que precisa abrir/);
});
test('perda total rejeita chave só para abrir e cópia mantém essa opção', () => {
  assert.equal(core.validateStep('funcao', { categoria: 'carro', servico: 'perdeu', funcao: 'abrir' }), false);
  assert.equal(core.validateStep('funcao', { categoria: 'carro', servico: 'copia', funcao: 'abrir' }), true);
  assert.equal(core.validateStep('funcao', { categoria: 'carro', servico: 'copia', situacao: 'perdeu', funcao: 'abrir' }), false);
  for (const funcao of ['partida', 'completa', 'naosei']) assert.equal(core.validateStep('funcao', { categoria: 'carro', servico: 'perdeu', funcao }), true);
});
