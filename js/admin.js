import { auth, db } from './firebase-init.js';
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ── Elementos ── */
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const adminUserEmail = document.getElementById('adminUserEmail');

const newProductBtn = document.getElementById('newProductBtn');
const adminStatus = document.getElementById('adminStatus');
const productsTable = document.getElementById('productsTable');
const productsTableBody = document.getElementById('productsTableBody');

const productModalOverlay = document.getElementById('productModalOverlay');
const productModal = document.getElementById('productModal');
const productModalClose = document.getElementById('productModalClose');
const productModalTitle = document.getElementById('productModalTitle');
const productForm = document.getElementById('productForm');
const productIdInput = document.getElementById('productId');
const productNameInput = document.getElementById('productName');
const productCategoryInput = document.getElementById('productCategory');
const productPriceInput = document.getElementById('productPrice');
const productShortDescInput = document.getElementById('productShortDesc');
const productDescriptionInput = document.getElementById('productDescription');
const productImagePathInput = document.getElementById('productImagePath');
const productImagePreview = document.getElementById('productImagePreview');
const productVideoInput = document.getElementById('productVideo');
const productActiveInput = document.getElementById('productActive');
const productFormError = document.getElementById('productFormError');
const deleteProductBtn = document.getElementById('deleteProductBtn');
const productSubmitBtn = document.getElementById('productSubmitBtn');

/* ── Autenticação ── */
function authErrorMessage(err) {
  const map = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  };
  return map[err.code] || 'Não foi possível entrar. Tente novamente.';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
  } catch (err) {
    loginError.textContent = authErrorMessage(err);
    loginError.hidden = false;
  }
});

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.hidden = true;
    dashboard.hidden = false;
    adminUserEmail.textContent = user.email;
    loadProducts();
  } else {
    dashboard.hidden = true;
    loginScreen.hidden = false;
    loginForm.reset();
  }
});

/* ── Listagem ── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatPrice(price) {
  if (price === null || price === undefined || price === '') return '—';
  return Number(price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

let productsCache = [];

async function loadProducts() {
  adminStatus.hidden = false;
  adminStatus.classList.remove('error');
  adminStatus.textContent = 'Carregando produtos…';
  productsTable.hidden = true;

  try {
    const snap = await getDocs(collection(db, 'products'));
    productsCache = [];
    snap.forEach(d => productsCache.push({ id: d.id, ...d.data() }));
    productsCache.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (productsCache.length === 0) {
      adminStatus.textContent = 'Nenhum produto cadastrado ainda. Clique em "+ Novo Produto" pra começar.';
      return;
    }

    productsTableBody.innerHTML = productsCache.map(p => `
      <tr data-id="${p.id}">
        <td><img class="admin-table-thumb" src="${p.imageUrl || ''}" alt=""></td>
        <td>${escapeHtml(p.name || '')}</td>
        <td>${escapeHtml(p.category || '')}</td>
        <td>${formatPrice(p.price)}</td>
        <td><span class="admin-status-pill ${p.active === false ? 'inactive' : 'active'}">${p.active === false ? 'Inativo' : 'Ativo'}</span></td>
        <td>
          <div class="admin-row-actions">
            <button type="button" class="admin-icon-btn" data-edit="${p.id}" aria-label="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    adminStatus.hidden = true;
    productsTable.hidden = false;
  } catch (err) {
    console.error(err);
    adminStatus.textContent = 'Não foi possível carregar os produtos. Verifique a configuração do Firebase.';
    adminStatus.classList.add('error');
  }
}

productsTableBody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-edit]');
  if (!btn) return;
  const product = productsCache.find(p => p.id === btn.dataset.edit);
  if (product) openModal(product);
});

/* ── Modal ── */
function openModal(product) {
  productForm.reset();
  productFormError.hidden = true;
  productImagePreview.hidden = true;

  if (product) {
    productModalTitle.textContent = 'Editar Produto';
    productIdInput.value = product.id;
    productNameInput.value = product.name || '';
    productCategoryInput.value = product.category || '';
    productPriceInput.value = product.price ?? '';
    productShortDescInput.value = product.shortDescription || '';
    productDescriptionInput.value = product.description || '';
    productImagePathInput.value = product.imageUrl || '';
    productVideoInput.value = product.videoUrl || '';
    productActiveInput.checked = product.active !== false;
    if (product.imageUrl) {
      productImagePreview.src = product.imageUrl;
      productImagePreview.hidden = false;
    }
    deleteProductBtn.hidden = false;
    productSubmitBtn.textContent = 'Salvar Alterações';
  } else {
    productModalTitle.textContent = 'Novo Produto';
    productIdInput.value = '';
    productCategoryInput.value = 'Fechaduras Eletrônicas';
    productActiveInput.checked = true;
    deleteProductBtn.hidden = true;
    productSubmitBtn.textContent = 'Salvar Produto';
  }

  productModalOverlay.classList.add('open');
  productModal.classList.add('open');
}

function closeModal() {
  productModalOverlay.classList.remove('open');
  productModal.classList.remove('open');
}

newProductBtn.addEventListener('click', () => openModal(null));
productModalClose.addEventListener('click', closeModal);
productModalOverlay.addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && productModal.classList.contains('open')) closeModal();
});

productImagePathInput.addEventListener('input', () => {
  const path = productImagePathInput.value.trim();
  if (path) {
    productImagePreview.src = path;
    productImagePreview.hidden = false;
  } else {
    productImagePreview.hidden = true;
  }
});

/* ── Salvar (criar/editar) ── */
productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  productFormError.hidden = true;

  const id = productIdInput.value;
  const isNew = !id;

  productSubmitBtn.disabled = true;
  productSubmitBtn.textContent = 'Salvando…';

  try {
    const priceValue = productPriceInput.value.trim();
    const data = {
      name: productNameInput.value.trim(),
      category: productCategoryInput.value.trim(),
      shortDescription: productShortDescInput.value.trim(),
      description: productDescriptionInput.value.trim(),
      price: priceValue === '' ? null : Number(priceValue),
      active: productActiveInput.checked,
      imageUrl: productImagePathInput.value.trim(),
      videoUrl: productVideoInput.value.trim(),
    };

    if (isNew) {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'products'), data);
    } else {
      await updateDoc(doc(db, 'products', id), data);
    }

    closeModal();
    await loadProducts();
  } catch (err) {
    console.error(err);
    productFormError.textContent = 'Não foi possível salvar o produto. Tente novamente.';
    productFormError.hidden = false;
  } finally {
    productSubmitBtn.disabled = false;
    productSubmitBtn.textContent = isNew ? 'Salvar Produto' : 'Salvar Alterações';
  }
});

/* ── Excluir ── */
deleteProductBtn.addEventListener('click', async () => {
  const id = productIdInput.value;
  if (!id) return;
  if (!confirm('Tem certeza que deseja excluir este produto? Essa ação não pode ser desfeita.')) return;

  deleteProductBtn.disabled = true;
  try {
    await deleteDoc(doc(db, 'products', id));
    closeModal();
    await loadProducts();
  } catch (err) {
    console.error(err);
    productFormError.textContent = 'Não foi possível excluir o produto. Tente novamente.';
    productFormError.hidden = false;
  } finally {
    deleteProductBtn.disabled = false;
  }
});
