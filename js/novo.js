(function () {
  'use strict';

  const PHONE = '5547991713761';

  /* ── Serviços → WhatsApp ── */
  document.querySelectorAll('.service-card[data-msg]').forEach(card => {
    card.addEventListener('click', () => {
      const url = `https://wa.me/${PHONE}?text=${encodeURIComponent(card.dataset.msg)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  });

  /* ── Menu lateral (drawer) ── */
  const menuToggle = document.getElementById('menuToggle');
  const sideDrawer = document.getElementById('sideDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const drawerClose = document.getElementById('drawerClose');

  function openDrawer() {
    sideDrawer.classList.add('open');
    drawerOverlay.classList.add('open');
    menuToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    sideDrawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  if (menuToggle && sideDrawer && drawerOverlay && drawerClose) {
    menuToggle.addEventListener('click', openDrawer);
    drawerClose.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeDrawer();
    });
    sideDrawer.querySelectorAll('.drawer-link').forEach(link => {
      link.addEventListener('click', closeDrawer);
    });
  }

  /* ── Galeria de fotos (página de produto) ── */
  const galleryMainImage = document.getElementById('galleryMainImage');
  const galleryMainBtn = document.getElementById('galleryMainBtn');
  const galleryThumbs = document.getElementById('galleryThumbs');
  const galleryDots = document.getElementById('galleryDots');

  if (galleryMainImage && galleryThumbs && galleryDots) {
    const images = Array.from(galleryThumbs.querySelectorAll('.product-thumb')).map(t => t.dataset.img);
    const thumbs = Array.from(galleryThumbs.querySelectorAll('.product-thumb'));
    const dots = Array.from(galleryDots.querySelectorAll('.gallery-dot'));
    let current = 0;

    function showImage(index) {
      current = (index + images.length) % images.length;
      galleryMainImage.src = images[current];
      thumbs.forEach((t, i) => t.classList.toggle('active', i === current));
      dots.forEach((d, i) => d.classList.toggle('active', i === current));
    }

    thumbs.forEach((t, i) => t.addEventListener('click', () => showImage(i)));
    dots.forEach((d, i) => d.addEventListener('click', () => showImage(i)));
    if (galleryMainBtn) {
      galleryMainBtn.addEventListener('click', () => showImage(current + 1));
    }
  }

  /* ── Sanfona de descrição (página de produto) ── */
  const descAccordion = document.getElementById('descAccordion');
  const descAccordionToggle = document.getElementById('descAccordionToggle');
  if (descAccordion && descAccordionToggle) {
    descAccordionToggle.addEventListener('click', () => {
      const open = descAccordion.classList.toggle('open');
      descAccordionToggle.setAttribute('aria-expanded', String(open));
    });
  }

  /* ── Barra fixa de compra (página de produto) ── */
  const stickyBuyBar = document.getElementById('stickyBuyBar');
  const productTop = document.getElementById('productTop');
  const whatsappFloat = document.querySelector('.whatsapp-float');
  if (stickyBuyBar && productTop && 'IntersectionObserver' in window) {
    const stickyObs = new IntersectionObserver(
      entries => entries.forEach(e => {
        const showSticky = !e.isIntersecting;
        stickyBuyBar.classList.toggle('visible', showSticky);
        if (whatsappFloat) whatsappFloat.classList.toggle('hidden-by-sticky', showSticky);
      }),
      { threshold: 0 }
    );
    stickyObs.observe(productTop);
  }

  /* ── Animações de entrada com IntersectionObserver ── */
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      }),
      { threshold: 0.1 }
    );
    document.querySelectorAll('.fade-up').forEach(el => obs.observe(el));
  } else {
    document.querySelectorAll('.fade-up').forEach(el => el.classList.add('visible'));
  }
})();
