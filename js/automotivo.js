const PHONE = '5547991713761';

/* ── Fluxo de cada tipo de serviço (etapas visíveis, em ordem) ── */
const FLOWS = {
  perdeu:   ['servico', 'veiculo', 'tipo', 'funcao', 'situacao', 'final'],
  copia:    ['servico', 'veiculo', 'tipo', 'funcao', 'situacao', 'final'],
  controle: ['servico', 'veiculo', 'situacao', 'final'],
  abertura: ['servico', 'veiculo', 'final'],
  outro:    ['servico', 'veiculo', 'final'],
};

const SERVICO_LABELS = {
  perdeu: 'Perdi todas as chaves',
  copia: 'Fazer uma cópia / chave reserva',
  controle: 'Problema no controle ou telecomando',
  abertura: 'Abertura de veículo',
  outro: 'Outro serviço automotivo',
};
const TIPO_LABELS = {
  simples: 'Chave simples',
  canivete: 'Chave canivete',
  presenca: 'Chave de presença',
  naosei: 'Não sei qual é',
};
const FUNCAO_LABELS = {
  abrir: 'Somente abrir as portas',
  partida: 'Abrir as portas e dar partida',
  completa: 'Abrir, dar partida e usar o controle',
  naosei: 'Não sei / quero orientação',
};
const CHIP_LABELS = { sim: 'Sim', nao: 'Não', naosei: 'Não sei' };
const SITUACAO_LABELS = {
  sim: 'Sim, tenho uma chave funcionando',
  perdeu: 'Não, perdi todas',
  naofunciona: 'Tenho uma chave, mas ela não funciona',
  naosei: 'Não sei',
};
const ATENDIMENTO_LABELS = { loja: 'Vou levar à loja', local: 'Atendimento no local' };

/* ── Elementos ── */
const form = document.getElementById('autoForm');
const backBtn = document.getElementById('wizardBackBtn');
const nextBtn = document.getElementById('wizardNextBtn');
const progressFill = document.getElementById('wizardProgressFill');
const progressText = document.getElementById('wizardProgressText');
const summaryList = document.getElementById('wizardSummaryList');
const wizardCard = document.querySelector('.wizard-card');

if (form) {
  const answers = {};
  let currentIndex = 0;
  let firstRender = true;

  function currentSequence() {
    const flow = FLOWS[answers.servico];
    return flow || ['servico'];
  }

  function currentStepId() {
    return currentSequence()[currentIndex];
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ── Mantém as respostas sempre atualizadas, ida e volta ── */
  function syncAnswer(e) {
    const el = e.target;
    if (!el.name) return;
    answers[el.name] = el.value;
  }
  form.addEventListener('input', syncAnswer);
  form.addEventListener('change', syncAnswer);

  /* ── Validação de cada etapa ── */
  function showError(stepId, show) {
    const err = form.querySelector(`.wizard-error[data-error-for="${stepId}"]`);
    if (err) err.hidden = !show;
  }

  function validateStep(stepId) {
    showError(stepId, false);

    if (stepId === 'servico' && !answers.servico) return showError(stepId, true), false;

    if (stepId === 'veiculo') {
      const camposOk = answers.marca && answers.modelo && answers.cidade && answers.bairro;
      const atendimentoOk = answers.servico === 'abertura' || !!answers.atendimento;
      if (!camposOk || !atendimentoOk) return showError(stepId, true), false;
    }

    if (stepId === 'tipo' && !answers.tipo) return showError(stepId, true), false;
    if (stepId === 'funcao' && !answers.funcao) return showError(stepId, true), false;
    if (stepId === 'situacao' && !answers.situacao) return showError(stepId, true), false;

    if (stepId === 'final') {
      const precisaObs = answers.servico === 'outro';
      if (!answers.nome || (precisaObs && !answers.observacao)) return showError(stepId, true), false;
    }

    return true;
  }

  /* ── Campos que aparecem/somem dependendo da resposta anterior ── */
  function updateConditionalFields(stepId) {
    if (stepId === 'veiculo') {
      const group = form.querySelector('[data-field-group="atendimento"]');
      const ehAbertura = answers.servico === 'abertura';
      group.hidden = ehAbertura;
      if (ehAbertura) answers.atendimento = 'local';
    }

    if (stepId === 'final') {
      const obsField = form.querySelector('[data-field="observacao"]');
      const obsLabel = document.getElementById('obsLabel');
      const obsInput = document.getElementById('obsInput');
      const ehOutro = answers.servico === 'outro';
      obsField.classList.toggle('is-emphasized', ehOutro);
      obsLabel.textContent = ehOutro ? 'Conta pra gente o que você precisa *' : 'Observação (opcional)';
      obsInput.placeholder = ehOutro
        ? 'Descreva o serviço automotivo que você precisa...'
        : 'Se quiser, conta mais algum detalhe.';
      renderSummary();
    }
  }

  /* ── Resumo antes de enviar ── */
  function renderSummary() {
    const seq = currentSequence();
    const rows = [
      ['Serviço', SERVICO_LABELS[answers.servico]],
      ['Veículo', [answers.marca, answers.modelo, answers.ano].filter(Boolean).join(' ')],
    ];
    if (seq.includes('tipo')) rows.push(['Tipo desejado', TIPO_LABELS[answers.tipo]]);
    if (seq.includes('funcao')) {
      rows.push(['Função', FUNCAO_LABELS[answers.funcao]]);
      if (answers.chip) rows.push(['Chip', CHIP_LABELS[answers.chip]]);
    }
    if (seq.includes('situacao')) rows.push(['Chave funcionando', SITUACAO_LABELS[answers.situacao]]);
    rows.push(['Local', [answers.cidade, answers.bairro].filter(Boolean).join(' – ')]);
    if (answers.atendimento) rows.push(['Atendimento', ATENDIMENTO_LABELS[answers.atendimento]]);

    summaryList.innerHTML = rows
      .filter(([, valor]) => valor)
      .map(([rotulo, valor]) => `<li><span>${escapeHtml(rotulo)}</span><span>${escapeHtml(valor)}</span></li>`)
      .join('');
  }

  /* ── Barra de progresso ── */
  function updateProgress(seq, stepId) {
    if (stepId === 'servico' && !answers.servico) {
      progressText.textContent = 'Vamos começar';
      progressFill.style.width = '0%';
      return;
    }
    const total = seq.length;
    const atual = currentIndex + 1;
    progressText.textContent = `Etapa ${atual} de ${total}`;
    progressFill.style.width = `${(atual / total) * 100}%`;
  }

  /* ── Botões Voltar/Continuar ── */
  function updateNavButtons(stepId) {
    backBtn.hidden = currentIndex === 0;
    nextBtn.hidden = stepId === 'final';
  }

  /* ── Move o foco pro título da nova etapa (acessibilidade) ── */
  function focusStepHeading(stepId) {
    const section = form.querySelector(`.wizard-step[data-step="${stepId}"]`);
    const heading = section && section.querySelector('legend, h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }

  function render() {
    const seq = currentSequence();
    if (currentIndex > seq.length - 1) currentIndex = seq.length - 1;
    const stepId = seq[currentIndex];

    form.querySelectorAll('.wizard-step').forEach(section => {
      section.hidden = section.dataset.step !== stepId;
    });

    updateConditionalFields(stepId);
    updateProgress(seq, stepId);
    updateNavButtons(stepId);

    if (!firstRender) {
      focusStepHeading(stepId);
      wizardCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    firstRender = false;
  }

  nextBtn.addEventListener('click', () => {
    const stepId = currentStepId();
    if (!validateStep(stepId)) return;
    const seq = currentSequence(); // recalcula: pode ter mudado se acabou de escolher o serviço
    if (currentIndex < seq.length - 1) currentIndex++;
    render();
  });

  backBtn.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex--;
      render();
    }
  });

  /* ── Monta a mensagem final e abre o WhatsApp ── */
  function buildMessage() {
    const seq = currentSequence();
    const linhas = ['🔑 SOLICITAÇÃO AUTOMOTIVA', ''];

    linhas.push(`Cliente: ${answers.nome}`);
    linhas.push(`Veículo: ${[answers.marca, answers.modelo, answers.ano].filter(Boolean).join(' ')}`);
    linhas.push(`Serviço: ${SERVICO_LABELS[answers.servico]}`);
    if (seq.includes('tipo') && answers.tipo) linhas.push(`Tipo desejado: ${TIPO_LABELS[answers.tipo]}`);
    if (seq.includes('funcao') && answers.funcao) linhas.push(`Função: ${FUNCAO_LABELS[answers.funcao]}`);
    if (answers.chip) linhas.push(`Chip: ${CHIP_LABELS[answers.chip]}`);
    if (seq.includes('situacao') && answers.situacao) linhas.push(`Possui chave funcionando: ${SITUACAO_LABELS[answers.situacao]}`);
    linhas.push(`Local: ${[answers.cidade, answers.bairro].filter(Boolean).join(' – ')}`);
    if (answers.atendimento) linhas.push(`Atendimento: ${ATENDIMENTO_LABELS[answers.atendimento]}`);
    if (answers.observacao) linhas.push(`Observação: ${answers.observacao}`);

    linhas.push('');
    linhas.push('Olá! Gostaria de verificar a possibilidade e o orçamento desse serviço.');

    return linhas.join('\n');
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!validateStep('final')) return;
    const mensagem = buildMessage();
    const url = `https://wa.me/${PHONE}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  render();
}
