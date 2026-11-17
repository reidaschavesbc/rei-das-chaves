(function () {
  'use strict';
  const core = globalThis.Automotivo;
  const form = document.getElementById('autoForm');
  if (!form || !core) return;
  const answers = {};
  const back = document.getElementById('wizardBackBtn');
  const next = document.getElementById('wizardNextBtn');
  const summary = document.getElementById('wizardSummaryList');
  const cep = form.elements.namedItem('cep');
  const cepButton = document.getElementById('cepSearchBtn');
  const cepStatus = document.getElementById('cepStatus');
  let index = 0, firstRender = true, lookupVersion = 0, controller, lastAuto = {}, resolvedCep = '';
  const sequence = () => core.sequence(answers);
  const field = name => form.elements.namedItem(name);

  function showError(step, show) {
    const error = form.querySelector(`.wizard-error[data-error-for="${step}"]`);
    if (error) error.hidden = !show;
  }
  function validate(step) {
    const valid = core.validateStep(step, answers);
    showError(step, !valid);
    return valid;
  }
  function renderSummary() {
    summary.replaceChildren();
    for (const [label, value] of core.summaryRows(answers)) {
      const li = document.createElement('li');
      const title = document.createElement('span');
      const text = document.createElement('span');
      title.textContent = label; text.textContent = value;
      li.append(title, text); summary.append(li);
    }
  }
  function sync(event) {
    const el = event.target;
    if (!el.name) return;
    const previous = answers.servico;
    answers[el.name] = el.value.trim();
    if (el.name === 'servico' && previous !== el.value) {
      delete answers.situacao;
      form.querySelectorAll('input[name="situacao"]').forEach(input => { input.checked = false; });
      document.getElementById('wizardRoutingNotice').hidden = true;
    }
    if (el.name === 'servico' && previous === 'abertura' && el.value !== previous) {
      for (const name of ['atendimento', 'atendimento_moto']) {
        delete answers[name];
        form.querySelectorAll(`input[name="${name}"]`).forEach(input => { input.checked = false; });
      }
    }
    if (el.name === 'cep' && event.type === 'input') {
      lookupVersion++; controller?.abort();
      cepButton.disabled = false;
      for (const [name, value] of Object.entries(lastAuto)) {
        if (field(name).value === value) { field(name).value = ''; delete answers[name]; }
      }
      lastAuto = {};
      resolvedCep = '';
      cepStatus.textContent = 'Busque pelo CEP ou preencha o endereço abaixo.';
      cepStatus.classList.remove('is-error');
    }
    if (sequence()[index] === 'final') renderSummary();
  }
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);

  async function searchCep() {
    const requested = cep.value.replace(/\D/g, '');
    controller?.abort();
    const version = ++lookupVersion;
    controller = new AbortController();
    const requestController = controller;
    const snapshot = Object.fromEntries(['rua', 'bairro', 'cidade', 'uf'].map(name => [name, field(name).value]));
    cepButton.disabled = true;
    cepStatus.textContent = 'Consultando CEP…';
    cepStatus.classList.remove('is-error');
    const timeout = setTimeout(() => requestController.abort(), 7000);
    try {
      const address = await core.lookupCep(requested, { signal: requestController.signal });
      if (version !== lookupVersion || cep.value.replace(/\D/g, '') !== requested) return;
      lastAuto = {};
      for (const [name, value] of Object.entries(address)) {
        // A late response must not overwrite an address the visitor just edited.
        if (field(name).value === snapshot[name] && value) {
          field(name).value = value; answers[name] = value; lastAuto[name] = value;
        }
      }
      cep.value = core.formatCep(requested); answers.cep = cep.value;
      resolvedCep = requested;
      const complete = ['rua', 'bairro', 'cidade', 'uf'].every(name => field(name).value.trim());
      cepStatus.textContent = complete
        ? 'Endereço localizado. Confira os dados e informe o número.'
        : 'CEP localizado. Complete os campos que ficaram em branco e informe o número.';
    } catch (error) {
      if (version !== lookupVersion) return;
      cepStatus.textContent = error.name === 'AbortError'
        ? 'A consulta demorou. Você pode tentar novamente ou preencher o endereço manualmente.'
        : 'Não foi possível localizar o CEP. Confira os 8 números ou preencha o endereço manualmente.';
      cepStatus.classList.add('is-error');
    } finally {
      clearTimeout(timeout);
      if (version === lookupVersion) cepButton.disabled = false;
    }
  }
  cepButton.addEventListener('click', searchCep);
  cep.addEventListener('blur', () => {
    const code = cep.value.replace(/\D/g, '');
    if (code.length === 8 && code !== resolvedCep && !cepButton.disabled) searchCep();
  });
  cep.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); searchCep(); }
  });

  function render() {
    const seq = sequence();
    index = Math.min(index, seq.length - 1);
    const step = seq[index];
    if (step !== 'endereco' && cepButton.disabled) {
      lookupVersion++; controller?.abort(); cepButton.disabled = false;
      cepStatus.textContent = 'Busque pelo CEP ou preencha o endereço abaixo.';
    }
    form.querySelectorAll('.wizard-step').forEach(section => { section.hidden = section.dataset.step !== step; });
    if (step === 'servico') document.getElementById('openingServiceLabel').textContent = answers.categoria === 'moto' ? 'Abertura — banco ou baú' : 'Abertura de veículo';
    for (const [id, name] of [['veiculo', 'atendimento'], ['veiculo_moto', 'atendimento-moto']]) {
      if (step === id) form.querySelector(`[data-field-group="${name}"]`).hidden = answers.servico === 'abertura';
    }
    if (step === 'tipo') {
      form.querySelector('[data-step="tipo"] .wizard-question').textContent = answers.servico === 'perdeu'
        ? 'Qual era o tipo de chave do veículo?' : 'Qual tipo de chave você deseja?';
    }
    if (step === 'final') {
      const other = answers.servico === 'outro';
      form.querySelector('[data-field="observacao"]').classList.toggle('is-emphasized', other);
      document.getElementById('obsLabel').textContent = other ? 'Descreva o serviço que você precisa *' : 'Observação (opcional)';
      document.getElementById('obsInput').placeholder = other ? 'Explique o problema ou o serviço desejado.' : 'Ex.: veículo na garagem, chave danificada ou detalhes para o atendimento.';
      renderSummary();
    }
    document.getElementById('wizardProgressText').textContent = !answers.categoria ? 'Vamos começar' : `Etapa ${index + 1} de ${seq.length}`;
    document.getElementById('wizardProgressFill').style.width = !answers.categoria ? '0%' : `${(index + 1) / seq.length * 100}%`;
    back.hidden = index === 0; next.hidden = step === 'final';
    if (!firstRender) {
      const heading = form.querySelector(`[data-step="${step}"]`).querySelector('legend, h2');
      heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true });
      document.querySelector('.wizard-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    firstRender = false;
  }
  next.addEventListener('click', () => {
    const step = sequence()[index];
    const resolved = core.resolveAnswers(answers);
    if (step === 'situacao' && resolved.servico !== answers.servico) {
      answers.servico = resolved.servico;
      delete answers.situacao;
      form.querySelectorAll('input[name="servico"]').forEach(input => { input.checked = input.value === answers.servico; });
      form.querySelectorAll('input[name="situacao"]').forEach(input => { input.checked = false; });
      const notice = document.getElementById('wizardRoutingNotice');
      notice.textContent = 'Como todas as chaves foram perdidas, ajustamos o serviço para “Todas as chaves perdidas”.';
      notice.hidden = false;
      render();
      return;
    }
    if (!validate(step)) return;
    if (index < sequence().length - 1) index++;
    render();
  });
  back.addEventListener('click', () => { if (index > 0) index--; render(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const seq = sequence();
    // Recheck the complete active path; hidden answers from another service are ignored.
    const invalid = seq.findIndex(step => !validate(step));
    if (invalid !== -1) { index = invalid; render(); return; }
    window.open(`https://wa.me/5547991713761?text=${encodeURIComponent(core.buildMessage(answers))}`, '_blank', 'noopener,noreferrer');
  });
  render();
})();
