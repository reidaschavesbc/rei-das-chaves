(() => {
  'use strict';
  const page = location.pathname.replace(/\.html$/, '').replace(/^\/index$/, '/');

  function record(action) {
    fetch('/api/analytics/events', {
      method: 'POST', credentials: 'omit', keepalive: true, referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, action }),
    }).catch(() => {});
  }

  record('views');
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (link) {
      const url = new URL(link.href, location.href);
      if (url.protocol === 'tel:') record('phone');
      else if (url.protocol === 'https:' && ['wa.me', 'api.whatsapp.com'].includes(url.hostname)) record('whatsapp');
    } else if (event.target.closest?.('.service-card[data-msg]')) {
      record('whatsapp');
    }
  });
  document.addEventListener('rdc:whatsapp', () => record('whatsapp'));
})();
