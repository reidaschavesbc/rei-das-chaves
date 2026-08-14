import { db } from './firebase-init.js';
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PHONE = '5547991713761';

const statusEl = document.getElementById('productStatus');
const detailEl = document.getElementById('productDetail');

function formatPrice(price) {
  if (price === null || price === undefined || price === '') return 'Consulte no WhatsApp';
  return Number(price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function youtubeEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  if (!match) return null;
  const params = new URLSearchParams({
    modestbranding: '1',
    rel: '0',
    iv_load_policy: '3',
  });
  return `https://www.youtube.com/embed/${match[1]}?${params}`;
}

function setupVideo(videoUrl) {
  if (!videoUrl) return;

  const section = document.getElementById('productVideoSection');
  const iframe = document.getElementById('productVideoFrame');
  const videoFile = document.getElementById('productVideoFile');

  const embedUrl = youtubeEmbedUrl(videoUrl);
  if (embedUrl) {
    iframe.src = embedUrl;
    iframe.hidden = false;
  } else {
    videoFile.src = videoUrl;
    videoFile.hidden = false;
  }
  section.hidden = false;
}

async function loadProduct() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    statusEl.textContent = 'Produto não encontrado.';
    statusEl.classList.add('error');
    return;
  }

  try {
    const snap = await getDoc(doc(db, 'products', id));

    if (!snap.exists() || snap.data().active === false) {
      statusEl.textContent = 'Produto não encontrado.';
      statusEl.classList.add('error');
      return;
    }

    const p = snap.data();

    document.getElementById('pageTitle').textContent = `${p.name} | Rei das Chaves`;
    document.getElementById('productCategory').textContent = p.category || '';
    document.getElementById('productName').textContent = p.name || '';
    document.getElementById('productPrice').textContent = formatPrice(p.price);

    const highlightsList = document.getElementById('productHighlights');
    const lines = (p.description || '').split('\n').map(l => l.trim()).filter(Boolean);
    highlightsList.innerHTML = lines.map(line => `
      <li>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span></span>
      </li>
    `).join('');
    highlightsList.querySelectorAll('li span').forEach((el, i) => { el.textContent = lines[i]; });

    const img = document.getElementById('productImage');
    const placeholder = document.getElementById('productImagePlaceholder');
    if (p.imageUrl) {
      img.src = p.imageUrl;
      img.alt = p.name || '';
      img.hidden = false;
      placeholder.hidden = true;
    } else {
      img.hidden = true;
      placeholder.hidden = false;
    }

    const waMsg = `Olá! Tenho interesse no produto "${p.name}" que vi no site.`;
    document.getElementById('productWhatsapp').href =
      `https://wa.me/${PHONE}?text=${encodeURIComponent(waMsg)}`;

    setupVideo(p.videoUrl);

    statusEl.hidden = true;
    detailEl.hidden = false;
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Não foi possível carregar o produto agora. Tente novamente mais tarde.';
    statusEl.classList.add('error');
  }
}

loadProduct();
