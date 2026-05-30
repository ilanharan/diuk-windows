// Tab 2 — משפטי מפתח (GetQuoteList)
const TabArticles = (() => {

  // WooCommerce subscription products for משפטי מפתח (hacara.org.il)
  const MISHPETEI_URLS = {
    monthly: 'https://hacara.org.il/product/diuk-mishpetei-mafteach-monthly/', // WC #10066 — ₪24
    yearly:  'https://hacara.org.il/product/diuk-mishpetei-mafteach-yearly/',  // WC #10067 — ₪240
  };

  async function openRegisterUrl(url) {
    const uid = await Store.getUserId();
    const sep = url.includes('?') ? '&' : '?';
    window.open(`${url}${sep}diuk_uid=${encodeURIComponent(uid || '')}`);
  }

  async function render(container) {
    container.innerHTML = `
      <div class="list-header">משפטי מפתח</div>
      <div id="articles-list" class="content-list">
        ${skeletonHTML(5)}
      </div>
    `;

    try {
      const res  = await API.getKeyPhrases(0);
      const list = document.getElementById('articles-list');
      if (!list) return;

      const isPurchased = res?.data?.is_purchased === '1' || res?.data?.is_purchased === 1;
      if (!isPurchased) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🔒</div>
            <div class="empty-state-title">תוכן זה מיועד למנויים בלבד</div>
            <div class="empty-state-msg">רכוש מנוי למשפטי מפתח כדי לגשת לתכנים</div>
            <div style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
              <button class="premium-register-btn articles-register-month">הרשמה לחודש</button>
              <button class="premium-register-btn articles-register-year">הרשמה לשנה</button>
            </div>
          </div>`;
        const mBtn = list.querySelector('.articles-register-month');
        const yBtn = list.querySelector('.articles-register-year');
        if (mBtn) mBtn.addEventListener('click', () => openRegisterUrl(MISHPETEI_URLS.monthly));
        if (yBtn) yBtn.addEventListener('click', () => openRegisterUrl(MISHPETEI_URLS.yearly));
        return;
      }

      const items = extractList(res);
      list.innerHTML = '';

      if (items.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🔑</div>
            <div class="empty-state-title">אין משפטי מפתח</div>
          </div>`;
        return;
      }

      items.forEach(item => list.appendChild(buildCard(item)));

    } catch (err) {
      console.error('loadKeyPhrases:', err);
      const list = document.getElementById('articles-list');
      if (list) list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-title">שגיאה בטעינה</div>
        </div>`;
    }
  }

  function extractList(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.list)) return res.list;
    if (res.data && Array.isArray(res.data.list)) return res.data.list;
    if (Array.isArray(res.data)) return res.data;
    // list may be a JSON string
    if (res.data && typeof res.data.list === 'string') {
      try { return JSON.parse(res.data.list); } catch {}
    }
    console.log('[KeyPhrases] extractList found nothing. res keys:', Object.keys(res));
    return [];
  }

  function buildCard(item) {
    const el = document.createElement('div');
    el.className = 'keyphrase-card';

    const title = decodeUnicode(item.title || 'ללא כותרת');

    el.innerHTML = `
      <div class="keyphrase-card-inner">
        <div class="keyphrase-title">${escHtml(title)}</div>
        <button class="keyphrase-btn">לתוכן</button>
      </div>
    `;

    el.querySelector('.keyphrase-btn').addEventListener('click', () => {
      openQuoteModal(item.id, title);
    });

    return el;
  }

  async function openQuoteModal(quoteId, title) {
    const existing = document.getElementById('content-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'content-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;
      display:flex;align-items:flex-start;justify-content:center;
      overflow-y:auto;padding:20px;
    `;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:700px;width:100%;margin:auto;overflow:hidden;box-shadow:var(--shadow-lg)">
        <div style="background:var(--primary);padding:18px 20px;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:18px;font-weight:700;color:#fff">${escHtml(title)}</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="content-modal-share" title="שיתוף" style="background:none;border:none;color:#fff;cursor:pointer;padding:0 4px;display:flex;align-items:center"><svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg></button>
            <button id="content-modal-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:0 4px">✕</button>
          </div>
        </div>
        <div id="content-modal-body" style="padding:24px;direction:rtl;text-align:right;min-height:80px;display:flex;align-items:center;justify-content:center;">
          <div style="color:#888;font-size:14px;">טוען...</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#content-modal-close').addEventListener('click', () => modal.remove());
    const _shareBtn = modal.querySelector('#content-modal-share');
    if (_shareBtn) _shareBtn.addEventListener('click', () => window.ShareUI && ShareUI.open());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    try {
      const res  = await API.getQuoteDetail(quoteId);
      const body = document.getElementById('content-modal-body');
      if (!body) return;

      console.log('[QuoteDetail] raw response:', JSON.stringify(res).substring(0, 400));

      // GetQuoteDetail response may nest detail under data or be flat
      const detail = (res && res.detail)                  ? res.detail
                   : (res && res.data && res.data.detail) ? res.data.detail
                   : (res && res.data)                    ? res.data
                   : res;

      if (!detail) { body.innerHTML = '<div style="color:#888;">אין תוכן</div>'; return; }

      const desc     = detail.description || detail.quotes || detail.text || '';
      const videoUrl = detail.video_url   || '';
      const audioUrl = detail.audio_url   || '';

      if (window.AppShare) AppShare.setCurrent({ type: 'quote', id: quoteId, title, desc });

      let html = '';
      if (videoUrl) html += `<video controls style="width:100%;border-radius:8px;margin-bottom:16px;" src="${escAttr(videoUrl)}"></video>`;
      if (audioUrl && !videoUrl) html += `<audio controls style="width:100%;margin-bottom:16px;" src="${escAttr(audioUrl)}"></audio>`;
      if (desc) html += `<div style="font-size:15px;line-height:1.8;">${desc}</div>`;
      if (!html) html = '<div style="color:#888;">אין תוכן</div>';

      body.style.display = 'block';
      body.innerHTML = html;
    } catch (err) {
      console.error('openQuoteModal:', err);
      const body = document.getElementById('content-modal-body');
      if (body) body.innerHTML = '<div style="color:#c00;">שגיאה בטעינת התוכן</div>';
    }
  }

  function decodeUnicode(str) {
    if (!str) return '';
    return String(str).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }

  function skeletonHTML(n) {
    return Array(n).fill(`<div class="skeleton keyphrase-skeleton"></div>`).join('');
  }

  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { render };
})();
