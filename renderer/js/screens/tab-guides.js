// Tab 4 — Guides / Surveys (GetSurveyList)
const TabGuides = (() => {
  let page = 1;
  let loading = false;
  let hasMore = true;
  let allItems = [];

  async function render(container) {
    container.innerHTML = `
      <div class="list-header">מחשבונים</div>
      <div id="guides-list" class="content-list">
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
      const res = await API.getSurveyList(page);
      const list = document.getElementById('guides-list');
      if (!list) return;

      if (page === 1) list.innerHTML = '';

      const items = extractList(res);
      hasMore = items.length >= 10;
      allItems = [...allItems, ...items];

      if (allItems.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🧭</div>
            <div class="empty-state-title">אין מדריכים</div>
          </div>`;
        return;
      }

      items.forEach(item => list.appendChild(buildCard(item)));

    } catch (err) {
      console.error('loadGuides:', err);
      if (page === 1) {
        const list = document.getElementById('guides-list');
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

    const title   = item.survey_name || item.title || item.guide_title || 'ללא כותרת';
    const desc    = stripHtml(item.survey_description || item.description || '');
    const date    = formatDate(item.survey_date || item.date || '');
    const img     = item.survey_image || item.image || '';
    const type    = item.survey_type || '';
    const badge   = type === '1' ? '📊 סקר' : '🧭 מדריך';

    el.innerHTML = `
      ${img ? `<img class="card-image" src="${escAttr(img)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="card-body">
        <div style="margin-bottom:8px;">
          <span style="background:var(--primary);color:#fff;font-size:11px;padding:3px 10px;border-radius:12px;">${badge}</span>
        </div>
        <div class="card-title">${title}</div>
        ${desc ? `<div class="card-excerpt">${desc.substring(0,180)}${desc.length>180?'...':''}</div>` : ''}
        <div class="card-meta" style="margin-top:10px;">${date}</div>
      </div>
    `;

    el.addEventListener('click', () => {
      const content = item.survey_description || item.description || '';
      showDetailModal(title, content);
    });
    return el;
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

  return { render };
})();
