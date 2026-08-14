import { db } from './firebase-init.js';
import {
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const statusEl = document.getElementById('catalogStatus');
const gridEl = document.getElementById('catalogGrid');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatPrice(price) {
  if (price === null || price === undefined || price === '') return 'Consulte no WhatsApp';
  return Number(price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function productCardHtml(id, p) {
  const img = p.imageUrl || '';
  return `
    <a class="product-card" href="produto?id=${encodeURIComponent(id)}">
      <div class="product-card-media">
        ${img ? `<img src="${img}" alt="${escapeHtml(p.name || '')}" loading="lazy">` : ''}
      </div>
      <div class="product-card-body">
        <span class="product-card-category">${escapeHtml(p.category || '')}</span>
        <div class="product-card-name">${escapeHtml(p.name || '')}</div>
        <div class="product-card-desc">${escapeHtml(p.shortDescription || '')}</div>
        <div class="product-card-price">${formatPrice(p.price)}</div>
      </div>
    </a>
  `;
}

async function loadProducts() {
  try {
    const q = query(collection(db, 'products'), where('active', '==', true));
    const snap = await getDocs(q);

    if (snap.empty) {
      statusEl.textContent = 'Nenhum produto cadastrado ainda. Fale com a gente no WhatsApp para saber mais!';
      return;
    }

    const byCategory = {};
    snap.forEach(doc => {
      const p = doc.data();
      const cat = p.category || 'Outros';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push({ id: doc.id, ...p });
    });

    let html = '';
    Object.keys(byCategory).sort().forEach(cat => {
      const items = byCategory[cat].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      html += `<h2 class="catalog-category-title">${escapeHtml(cat)}</h2>`;
      html += `<div class="catalog-grid">${items.map(p => productCardHtml(p.id, p)).join('')}</div>`;
    });

    gridEl.innerHTML = html;
    statusEl.hidden = true;
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Não foi possível carregar os produtos agora. Tente novamente mais tarde.';
    statusEl.classList.add('error');
  }
}

loadProducts();
