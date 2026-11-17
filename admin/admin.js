(() => {
  'use strict';
  const categories = [
    { id: 'eletronicas', name: 'Eletrônicas', file: 'fechaduras-eletronicas.html' },
    { id: 'jbm', name: 'JBM para vidro', file: 'fechaduras-jbm.html' },
    { id: 'stam', name: 'Mecânicas Stam', file: 'fechaduras-mecanicas-stam.html' }
  ];
  const $ = (id) => document.getElementById(id);
  const money = (value) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const decimal = (value) => (value / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, useGrouping: false });
  const installmentText = count => count === 0 ? 'Não exibir parcelamento' : count === 1 ? 'Em 1x sem juros' : `Até ${count}x sem juros`;
  const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let products = [], revision = '', activeCategory = 'all', preview = false, busy = false;
  let username = 'admin';
  try { sessionStorage.removeItem('rdc_activation_token'); } catch {}
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  const pending = new Map();
  const errors = new Set();
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  async function api(path, options = {}) {
    let response;
    try { response = await fetch(`/api/${path}`, { credentials: 'same-origin', signal: AbortSignal.timeout(12000), ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }); }
    catch (error) { throw new Error(['TimeoutError', 'AbortError'].includes(error.name) ? 'A conexão demorou demais. Tente entrar novamente.' : 'Não foi possível conectar. Confira sua internet e tente novamente.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && path !== 'login') { $('dashboard').hidden = true; $('account-screen').hidden = true; $('login').hidden = false; }
      throw new Error(data.error || 'O painel está indisponível. Tente novamente em instantes.');
    }
    return data;
  }
  function message(text, error = false) {
    $('message').textContent = text;
    $('message').classList.toggle('error', error);
  }
  function renderCategories() {
    $('categories').replaceChildren();
    for (const category of [{ id: 'all', name: 'Todos os produtos' }, ...categories]) {
      const button = node('button', 'category-button');
      button.type = 'button';
      button.setAttribute('aria-current', String(activeCategory === category.id));
      button.append(node('span', '', category.name), node('span', 'count', String(products.filter(p => category.id === 'all' || p.category === category.id).length)));
      button.addEventListener('click', () => { activeCategory = category.id; renderCategories(); renderProducts(); });
      $('categories').append(button);
    }
  }
  function updateSummary() {
    $('pending-count').textContent = String(pending.size);
    $('save-summary').textContent = `${pending.size} ${pending.size === 1 ? 'produto alterado' : 'produtos alterados'}`;
    $('save-bar').hidden = pending.size === 0;
    $('review').disabled = errors.size > 0 || busy;
  }
  function renderProducts() {
    const term = normalize($('search').value.trim());
    const filtered = products.filter(p => (activeCategory === 'all' || p.category === activeCategory) && normalize(p.name).includes(term) && (!$('only-pending').checked || pending.has(p.id)));
    $('products').replaceChildren();
    $('category-title').textContent = categories.find(c => c.id === activeCategory)?.name || 'Todos os produtos';
    $('result-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'produto' : 'produtos'}`;
    $('empty').hidden = filtered.length !== 0;
    for (const product of filtered) {
      const card = node('article', `product${pending.has(product.id) ? ' changed' : ''}`);
      const media = node('div', 'product-media');
      const image = node('img');
      image.src = `/${product.image}`; image.alt = product.name; image.loading = 'lazy';
      image.addEventListener('error', () => { image.hidden = true; media.textContent = 'Imagem indisponível'; });
      media.append(image);
      const body = node('div', 'product-body');
      body.append(node('span', 'product-category', categories.find(c => c.id === product.category).name), node('h3', '', product.name), node('p', 'current-price', `No site: ${money(product.priceCents)} · ${installmentText(product.installments)}`));
      const label = node('label', 'price-label', 'Preço de venda');
      label.htmlFor = `price-${product.id}`;
      const field = node('div', 'price-input');
      const input = node('input');
      input.id = label.htmlFor; input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off';
      input.value = pending.has(product.id) ? pending.get(product.id).text : decimal(product.priceCents);
      input.disabled = preview || busy;
      const installmentLabel = node('label', 'installments-label', 'Parcelas sem juros');
      installmentLabel.htmlFor = `installments-${product.id}`;
      const installmentSelect = node('select', 'installments-select');
      installmentSelect.id = installmentLabel.htmlFor;
      for (let count = 0; count <= 10; count++) {
        const option = node('option', '', installmentText(count));
        option.value = String(count); installmentSelect.append(option);
      }
      installmentSelect.value = String(pending.has(product.id) ? pending.get(product.id).installments : product.installments);
      installmentSelect.disabled = preview || busy;
      const state = node('p', 'product-state', pending.has(product.id) ? 'Alteração não salva' : (preview ? 'Visualização do catálogo' : ''));
      state.id = `state-${product.id}`;
      input.setAttribute('aria-describedby', state.id);
      installmentSelect.setAttribute('aria-describedby', state.id);
      function syncChange() {
        if (busy) return;
        const text = input.value.trim();
        const valid = /^\d{1,7}(?:,\d{1,2})?$/.test(text);
        const cents = valid ? Math.round(Number(text.replace(',', '.')) * 100) : 0;
        const installments = Number(installmentSelect.value);
        const priceError = !valid || cents < 1 || cents > 99999999;
        const installmentsError = !Number.isSafeInteger(installments) || installments < 0 || installments > 10;
        const error = priceError || installmentsError;
        input.setAttribute('aria-invalid', String(priceError));
        installmentSelect.setAttribute('aria-invalid', String(installmentsError));
        error ? errors.add(product.id) : errors.delete(product.id);
        if (!error && cents === product.priceCents && installments === product.installments) {
          pending.delete(product.id); card.classList.remove('changed'); state.textContent = preview ? 'Visualização do catálogo' : '';
        } else {
          pending.set(product.id, { priceCents: cents, text, installments }); card.classList.add('changed');
          state.textContent = priceError ? 'Informe um preço válido, como 750,00.' : installmentsError ? 'Escolha uma opção de parcelamento válida.' : 'Alteração não salva';
        }
        updateSummary();
      }
      input.addEventListener('input', syncChange);
      installmentSelect.addEventListener('change', syncChange);
      if (errors.has(product.id)) syncChange();
      field.append(node('span', '', 'R$'), input); body.append(label, field, installmentLabel, installmentSelect, state); card.append(media, body); $('products').append(card);
    }
    $('products').setAttribute('aria-busy', 'false');
    updateSummary();
  }
  async function loadPreview() {
    const result = [];
    for (const category of categories) {
      const res = await fetch(`/${category.file}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Não foi possível carregar o catálogo. Atualize a página para tentar novamente.');
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      for (const card of doc.querySelectorAll('a.product-card')) {
        const href = card.getAttribute('href').replace(/\.html$/, '');
        const price = card.querySelector('.product-card-price').textContent.replace(/[^\d,]/g, '').replace(',', '.');
        const image = card.querySelector('img').getAttribute('src');
        if (!/^produto-[\w-]+$/.test(href) || !/^image\/[\w/.-]+$/.test(image)) continue;
        const installments = Number(card.querySelector('.product-card-installments')?.dataset.installments || 0);
        result.push({ id: href, name: card.querySelector('.product-card-name').textContent, image, category: category.id, priceCents: Math.round(Number(price) * 100), installments });
      }
    }
    products = result;
  }
  async function load() {
    message('Carregando produtos…');
    $('reload').disabled = true;
    try {
      if (preview) await loadPreview();
      else { const data = await api('products'); products = data.products; revision = data.revision; }
      $('product-count').textContent = String(products.length);
      $('category-count').textContent = String(new Set(products.map(p => p.category)).size);
      pending.clear(); errors.clear(); renderCategories(); renderProducts(); message('');
    } catch (error) { message(error.message, true); }
    finally { $('reload').disabled = false; }
  }
  $('search').addEventListener('input', renderProducts);
  $('only-pending').addEventListener('change', renderProducts);
  $('reload').addEventListener('click', () => { if (!pending.size || confirm('Descartar as alterações e carregar os produtos novamente?')) load(); });
  $('discard').addEventListener('click', () => { if (confirm('Descartar as alterações que ainda não foram salvas?')) { pending.clear(); errors.clear(); renderProducts(); } });
  $('review').addEventListener('click', () => {
    $('changes').replaceChildren(); $('save-error').textContent = '';
    for (const [id, change] of pending) {
      const product = products.find(p => p.id === id), li = node('li');
      li.append(node('strong', '', product.name));
      if (product.priceCents !== change.priceCents) li.append(node('span', 'change-detail', `Preço: ${money(product.priceCents)} → ${money(change.priceCents)}`));
      if (product.installments !== change.installments) li.append(node('span', 'change-detail', `Parcelamento: ${installmentText(product.installments)} → ${installmentText(change.installments)}`));
      $('changes').append(li);
    }
    $('confirmation').showModal();
  });
  $('publish').addEventListener('click', async () => {
    if (busy || preview || errors.size || !pending.size) return;
    busy = true; $('publish').disabled = true; $('publish').textContent = 'Salvando…';
    $('products').inert = true; $('discard').disabled = true; $('reload').disabled = true;
    const changes = [...pending].map(([id, p]) => ({ id, priceCents: p.priceCents, installments: p.installments }));
    try {
      const data = await api('prices', { method: 'POST', body: JSON.stringify({ revision, changes }) });
      for (const change of changes) Object.assign(products.find(p => p.id === change.id), { priceCents: change.priceCents, installments: change.installments });
      revision = data.revision; pending.clear(); errors.clear(); $('confirmation').close(); renderProducts();
      message(data.unchanged ? 'As alterações já estavam salvas. Nenhuma publicação adicional foi necessária.' : 'Preços e parcelas salvos e publicados no site.');
    } catch (error) { $('save-error').textContent = error.message; }
    finally { busy = false; $('products').inert = false; $('discard').disabled = false; $('reload').disabled = false; $('publish').disabled = false; $('publish').textContent = 'Salvar e publicar'; renderProducts(); }
  });
  $('confirmation').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('confirmation').addEventListener('submit', event => { if (busy) event.preventDefault(); });
  $('logout').addEventListener('click', async () => {
    if (pending.size && !confirm('Sair e descartar as alterações não salvas?')) return;
    try { await api('logout', { method: 'POST', body: '{}' }); pending.clear(); errors.clear(); location.reload(); }
    catch (error) { message(error.message, true); }
  });
  function openAccount() {
    $('account-form').reset(); $('account-username').value = username;
    $('account-description').textContent = 'Altere seu usuário e sua senha de acesso.';
    $('current-password-group').hidden = false; $('current-password').required = true;
    $('account-back').hidden = false; $('account-message').textContent = '';
    $('dashboard').hidden = true; $('login').hidden = true; $('account-screen').hidden = false;
    $('account-username').focus();
  }
  async function authenticated(data) {
    username = data.username || 'admin'; $('account-name').textContent = username;
    $('login').hidden = true; $('account-screen').hidden = true; $('dashboard').hidden = false;
    await load();
  }
  $('account-settings').addEventListener('click', openAccount);
  $('account-back').addEventListener('click', () => { $('account-screen').hidden = true; $('dashboard').hidden = false; });
  $('account-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button');
    button.disabled = true; button.textContent = 'Salvando…'; $('account-message').textContent = '';
    try {
      if ($('new-password').value !== $('new-password-repeat').value) throw new Error('As duas senhas precisam ser iguais.');
      const data = await api('account', { method: 'POST', body: JSON.stringify({ username: $('account-username').value.trim(), password: $('new-password').value, currentPassword: $('current-password').value }) });
      $('account-form').reset();
      username = data.username; $('account-name').textContent = username; $('account-screen').hidden = true; $('dashboard').hidden = false;
      message('Usuário e senha salvos. Use esses dados nos próximos acessos.');
    } catch (error) { $('account-message').textContent = error.message; }
    finally { button.disabled = false; button.textContent = 'Salvar meu acesso'; }
  });
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true; button.textContent = 'Entrando…'; $('login-message').textContent = '';
    try {
      const data = await api('login', { method: 'POST', body: JSON.stringify({ username: $('username').value.trim(), password: $('password').value }) });
      $('password').value = ''; await authenticated(data);
    }
    catch (error) { $('login-message').textContent = error.message; }
    finally { button.disabled = false; button.textContent = 'Entrar no painel'; }
  });
  window.addEventListener('beforeunload', event => { if (pending.size) { event.preventDefault(); event.returnValue = ''; } });
  async function start() {
    try {
      const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000) });
      const data = await response.json().catch(() => null);
      if (data?.service === 'rei-das-chaves-admin' && response.ok) {
        if (data.authenticated) await authenticated(data);
        else {
          $('login').hidden = false;
          $('password').focus();
        }
        return;
      }
      if (response.status >= 500 && data?.service === 'rei-das-chaves-admin') throw new Error(data.error);
      preview = true; $('dashboard').hidden = false; $('mode-notice').hidden = false;
      $('mode-notice').textContent = 'Prévia do painel. As fotos e os preços são do seu catálogo. A edição ficará disponível após a ativação do acesso seguro.';
      $('logout').hidden = true; $('account-settings').hidden = true; await load();
    } catch (error) { $('login').hidden = false; $('login-message').textContent = error.message || 'Não foi possível conectar ao painel.'; }
  }
  start();
})();
