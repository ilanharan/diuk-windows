// Global content search (SearchAllList1) — opened from the header search icon.
// Searches across all content (daily messages, subscription content, quotes…);
// clicking a result opens it via GetMessageDetail.
const AppSearch = (() => {
  const IMG_BASE = 'https://app.diuk.co.il/app/assets/images/';
  let _gen = 0; // cancels stale async renders

  function open() {
    const existing = document.getElementById('search-overlay');
    if (existing) { existing.querySelector('#search-input').focus(); return; }

    const ov = document.createElement('div');
    ov.id = 'search-overlay';
    ov.innerHTML = `
      <div class="search-bar">
        <button id="search-back" class="btn-icon" title="סגור" style="color:var(--primary);font-size:22px;">→</button>
        <input id="search-input" type="search" placeholder="חיפוש בכל התכנים..." autocomplete="off">
        <button id="search-clear" class="btn-icon" title="נקה" style="color:var(--text-muted);">✕</button>
      </div>
      <div id="search-results" class="search-results">
        <div class="search-hint">הקלד מילה כדי לחפש בכל התכנים</div>
      </div>`;
    document.body.appendChild(ov);

    const input   = ov.querySelector('#search-input');
    const results = ov.querySelector('#search-results');

    ov.querySelector('#search-back').addEventListener('click', () => ov.remove());
    ov.querySelector('#search-clear').addEventListener('click', () => { input.value = ''; input.focus(); runSearch('', results); });

    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      timer = setTimeout(() => runSearch(q, results), 350);
    });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') ov.remove(); });
    setTimeout(() => input.focus(), 60);
  }

  async function runSearch(query, results) {
    const gen = ++_gen;
    if (!query || query.length < 2) {
      results.innerHTML = `<div class="search-hint">הקלד לפחות 2 תווים</div>`;
      return;
    }
    results.innerHTML = `<div class="loading-state"><div class="spinner" style="border-top-color:var(--accent);"></div></div>`;
    try {
      const res  = await API.searchAll(query, 0);
      if (gen !== _gen) return; // a newer search started
      const list = (res && res.data && res.data.list) || [];
      if (!list.length) {
        results.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">לא נמצאו תוצאות</div></div>`;
        return;
      }
      results.innerHTML = '';
      list.forEach(item => results.appendChild(buildResult(item)));
    } catch (err) {
      if (gen !== _gen) return;
      console.error('search:', err);
      results.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">שגיאה בחיפוש</div></div>`;
    }
  }

  function buildResult(item) {
    const el = document.createElement('div');
    el.className = 'search-result';
    const title = decodeUnicode(item.title || 'ללא כותרת');
    const cat   = decodeUnicode(item.subs_cat_title || '');
    const desc  = stripHtml(item.msg_desc || '');
    const date  = formatDate(item.msg_date || '');
    el.innerHTML = `
      <div class="search-result-title">${escHtml(title)}</div>
      ${cat ? `<span class="search-result-cat">${escHtml(cat)}</span>` : ''}
      ${desc ? `<div class="search-result-desc">${escHtml(desc.substring(0,120))}${desc.length>120?'…':''}</div>` : ''}
      ${date ? `<div class="search-result-date">${escHtml(date)}</div>` : ''}`;
    el.addEventListener('click', () => openResult(item));
    return el;
  }

  async function openResult(item) {
    const title = decodeUnicode(item.title || '');
    const modal = makeModal(title);
    const body  = modal.querySelector('#search-modal-body');
    try {
      const res    = await API.getMessageDetail(item.id, item.msg_type);
      const detail = (res && res.data && (res.data.detail || (res.data.list && res.data.list[0]))) || {};
      const video  = detail.video_url && String(detail.video_url).trim();
      const audio  = detail.audio_url && String(detail.audio_url).trim();
      const desc   = detail.description || item.msg_desc || '';
      const img    = detail.img_name ? IMG_BASE + detail.img_name : '';

      // make this the shareable "current content"
      if (window.AppShare) AppShare.setCurrent({ type: item.msg_type, id: item.id, title, desc: stripHtml(desc) });

      let html = '';
      if (video)      html += `<video controls playsinline preload="metadata" style="width:100%;border-radius:8px;margin-bottom:14px;" src="${escAttr(video)}"></video>`;
      else if (audio) html += `<audio controls style="width:100%;margin-bottom:14px;" src="${escAttr(audio)}"></audio>`;
      if (img)  html += `<img src="${escAttr(img)}" alt="" style="width:100%;border-radius:8px;margin-bottom:14px;" onerror="this.style.display='none'">`;
      if (desc) html += `<div style="font-size:15px;line-height:1.8;">${desc}</div>`;
      if (!html) html = `<div style="color:#888;">אין תצוגה לתוכן זה.</div>`;
      body.innerHTML = html;
    } catch (err) {
      console.error('openResult:', err);
      body.innerHTML = `<div style="color:#c00;">שגיאה בטעינת התוכן.</div>`;
    }
  }

  function makeModal(title) {
    const modal = document.createElement('div');
    modal.id = 'search-content-modal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:3600;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:20px;`;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:680px;width:100%;margin:auto;overflow:hidden;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;max-height:92vh;">
        <div style="background:var(--primary);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <div style="font-size:18px;font-weight:700;color:#fff;">${escHtml(title)}</div>
          <div style="display:flex;gap:6px;">
            <button id="search-modal-share" title="שיתוף" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;">↗</button>
            <button id="search-modal-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;">✕</button>
          </div>
        </div>
        <div id="search-modal-body" style="padding:20px;direction:rtl;text-align:right;overflow-y:auto;"><div class="loading-state"><div class="spinner" style="border-top-color:var(--accent);"></div></div></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#search-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    const sb = modal.querySelector('#search-modal-share');
    if (sb) sb.addEventListener('click', () => window.ShareUI && ShareUI.open());
    return modal;
  }

  function decodeUnicode(str) {
    if (!str) return '';
    return String(str).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  function stripHtml(html) { const t = document.createElement('div'); t.innerHTML = html || ''; return (t.textContent || '').trim(); }
  function formatDate(d) {
    if (!d) return '';
    const dt = new Date(d); if (isNaN(dt.getTime())) return d;
    try { return dt.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; }
  }
  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  return { open };
})();
