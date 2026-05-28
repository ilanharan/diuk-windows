// Tab 5 — Premium / Subscription content (GetSubscriptionContentInfoList)
const TabPremium = (() => {
  let page = 1;
  let loading = false;
  let hasMore = true;
  let allItems = [];

  async function render(container) {
    container.innerHTML = `
      <div class="list-header">מנויים</div>
      <div id="premium-list" class="content-list">
        ${Array(4).fill('<div class="skeleton skeleton-card"></div>').join('')}
      </div>
    `;
    await loadPage(container);

    container.addEventListener('scroll', () => {
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 80) {
        if (!loading && hasMore) { page++; loadPage(container); }
      }
    });
  }

  async function loadPage(container) {
    if (loading) return;
    loading = true;
    try {
      const res = await API.getSubscriptionContent(page);
      const list = document.getElementById('premium-list');
      if (!list) return;

      if (page === 1) list.innerHTML = '';

      // Some APIs return 'status: 0' for subscribers-only — handle gracefully
      if (res && (res.status === '0' || res.status === 0) && page === 1) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🔒</div>
            <div class="empty-state-title">תוכן זה למנויים בלבד</div>
            <div class="empty-state-msg">הירשם למנוי כדי לגשת לתכנים הבלעדיים</div>
            <button class="btn btn-accent" onclick="TabPremium.showSubscribeInfo()">פרטי מנוי</button>
          </div>`;
        loading = false;
        return;
      }

      const items = extractList(res);
      hasMore = items.length >= 10;
      allItems = [...allItems, ...items];

      if (allItems.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">⭐</div>
            <div class="empty-state-title">אין תוכן זמין</div>
          </div>`;
        loading = false;
        return;
      }

      items.forEach(item => list.appendChild(buildCard(item)));

    } catch (err) {
      console.error('loadPremium:', err);
      if (page === 1) {
        const list = document.getElementById('premium-list');
        if (list) list.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <div class="empty-state-title">שגיאה בטעינה</div>
          </div>`;
      }
    } finally {
      loading = false;
    }
  }

  function extractList(res) {
    if (!res) return [];
    if (Array.isArray(res.data)) return res.data;
    if (res.data && Array.isArray(res.data.list)) return res.data.list;
    return [];
  }

  function buildCard(item) {
    const el = document.createElement('div');
    el.className = 'card';
    el.style.cursor = 'pointer';

    const title  = item.sub_content_title || item.title || item.content_title || 'ללא כותרת';
    const desc   = stripHtml(item.sub_content_description || item.description || '');
    const date   = formatDate(item.sub_content_date || item.date || '');
    const img    = item.sub_content_image || item.image || '';
    const isNew  = item.is_new === '1' || item.is_new === 1;

    el.innerHTML = `
      ${img ? `<img class="card-image" src="${escAttr(img)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="card-body">
        <div style="margin-bottom:8px;display:flex;gap:6px;align-items:center;">
          <span style="background:var(--accent);color:#fff;font-size:11px;padding:3px 10px;border-radius:12px;">⭐ מנויים</span>
          ${isNew ? `<span style="background:var(--success);color:#fff;font-size:11px;padding:3px 10px;border-radius:12px;">חדש!</span>` : ''}
        </div>
        <div class="card-title">${title}</div>
        ${desc ? `<div class="card-excerpt">${desc.substring(0,180)}${desc.length>180?'...':''}</div>` : ''}
        <div class="card-meta" style="margin-top:10px;">${date}</div>
      </div>
    `;

    el.addEventListener('click', () => {
      const content = item.sub_content_description || item.description || '';
      showDetailModal(title, content);
    });
    return el;
  }

  async function showSubscribeInfo() {
    try {
      const res = await API.getBundleSubscription();
      if (res && res.data) {
        const bundles = Array.isArray(res.data) ? res.data : [res.data];
        const html = bundles.map(b => `
          <div style="border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">
            <div style="font-size:17px;font-weight:700;">${b.bundle_name || b.name || 'מנוי'}</div>
            <div style="font-size:24px;font-weight:700;color:var(--accent);margin:8px 0;">${b.bundle_price || b.price || ''}</div>
            <div style="font-size:14px;color:var(--text-muted);">${b.bundle_description || b.description || ''}</div>
          </div>
        `).join('');
        showDetailModal('פרטי מנוי', `<div>${html}<p style="margin-top:16px;font-size:13px;color:var(--text-muted);">לרכישת מנוי אנא פנה לצוות דיוק</p></div>`);
      }
    } catch (e) {
      console.error('showSubscribeInfo:', e);
    }
  }

  function stripHtml(html) {
    const t = document.createElement('div');
    t.innerHTML = html;
    return t.textContent || '';
  }

  function formatDate(d) {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return d; }
  }

  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }

  return { render, showSubscribeInfo };
})();
