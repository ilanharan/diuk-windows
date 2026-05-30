// Tab 4 — מחשבונים (Calculators / Surveys)
// Each calculator has 3 actions: דף הסבר · הפעלת מחשבון · תוצאות קודמות
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
    page = 1; allItems = []; hasMore = true;
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
            <div class="empty-state-icon">🧮</div>
            <div class="empty-state-title">אין מחשבונים</div>
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

    const title = decodeUnicode(item.title || 'ללא כותרת');
    const desc  = stripHtml(item.description || '');
    const img   = item.image_url || item.image || '';
    const color = item.button_color || 'var(--primary)';

    el.innerHTML = `
      ${img ? `<img class="card-image" src="${escAttr(img)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="card-body">
        <div class="card-title">${escHtml(title)}</div>
        ${desc ? `<div class="card-excerpt">${escHtml(desc.substring(0,160))}${desc.length>160?'...':''}</div>` : ''}
        <div class="guide-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
          <button class="guide-btn guide-btn-info">דף הסבר</button>
          <button class="guide-btn guide-btn-run" style="background:${escAttr(color)};">הפעלת מחשבון</button>
          <button class="guide-btn guide-btn-history">תוצאות קודמות</button>
        </div>
      </div>
    `;

    el.querySelector('.guide-btn-info').addEventListener('click', () => openExplanation(item));
    el.querySelector('.guide-btn-run').addEventListener('click', () => openCalculator(item));
    el.querySelector('.guide-btn-history').addEventListener('click', () => openHistory(item));
    return el;
  }

  // ── Generic modal shell ─────────────────────────────────────────────────────
  function openModal(title, bodyHtml) {
    const existing = document.getElementById('guide-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'guide-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2500;
      display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:20px;`;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:680px;width:100%;margin:auto;overflow:hidden;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;max-height:92vh;">
        <div style="background:var(--primary);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <div style="font-size:18px;font-weight:700;color:#fff;">${escHtml(title)}</div>
          <button id="guide-modal-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:0 4px;line-height:1;">✕</button>
        </div>
        <div id="guide-modal-body" style="padding:20px;direction:rtl;text-align:right;overflow-y:auto;">${bodyHtml}</div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#guide-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    return modal;
  }

  // ── דף הסבר ─────────────────────────────────────────────────────────────────
  function openExplanation(item) {
    const title = decodeUnicode(item.title || '');
    const desc  = item.description || '';
    const body  = desc
      ? `<div style="font-size:15px;line-height:1.8;">${desc}</div>`
      : `<div style="color:#888;">אין דף הסבר למחשבון זה.</div>`;
    openModal(title, body);
  }

  // ── הפעלת מחשבון ────────────────────────────────────────────────────────────
  async function openCalculator(item) {
    const title = decodeUnicode(item.title || '');
    const modal = openModal(title, `<div class="loading-state"><div class="spinner" style="border-top-color:var(--accent);"></div></div>`);
    const body  = modal.querySelector('#guide-modal-body');

    try {
      const res = await API.getSurveyDetail(item.id);
      const questions = (res && res.data && res.data.list) || [];
      if (!questions.length) { body.innerHTML = '<div style="color:#888;">אין שאלות במחשבון זה.</div>'; return; }

      const answers = {}; // question_id -> selected value

      const qHtml = questions.map((q, idx) => {
        const qText = decodeUnicode(q.question || `שאלה ${idx+1}`);
        const opts = [];
        for (let i = 0; i <= 5; i++) {
          const v = q['ans' + i];
          if (v !== undefined && v !== null && String(v).trim() !== '') opts.push(String(v));
        }
        const optHtml = opts.map(v =>
          `<button type="button" class="calc-opt" data-q="${escAttr(q.id)}" data-v="${escAttr(v)}">${escHtml(v)}</button>`
        ).join('');
        return `
          <div class="calc-q" data-qid="${escAttr(q.id)}" style="padding:12px 0;border-bottom:1px solid var(--border);">
            <div style="font-size:15px;font-weight:600;margin-bottom:8px;">${escHtml(qText)}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">${optHtml}</div>
          </div>`;
      }).join('');

      body.innerHTML = `
        <div id="calc-questions">${qHtml}</div>
        <div id="calc-error" style="color:var(--danger);font-size:14px;margin-top:10px;display:none;"></div>
        <button id="calc-submit" class="btn btn-primary" style="margin-top:16px;width:100%;">חשב תוצאה</button>`;

      body.querySelectorAll('.calc-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          const qid = btn.dataset.q;
          answers[qid] = btn.dataset.v;
          body.querySelectorAll(`.calc-opt[data-q="${qid}"]`).forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });

      body.querySelector('#calc-submit').addEventListener('click', async () => {
        const unanswered = questions.filter(q => answers[q.id] === undefined);
        const errEl = body.querySelector('#calc-error');
        if (unanswered.length) {
          errEl.textContent = `יש לענות על כל השאלות (חסרות ${unanswered.length})`;
          errEl.style.display = 'block';
          const first = body.querySelector(`.calc-q[data-qid="${unanswered[0].id}"]`);
          if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        errEl.style.display = 'none';
        const submitBtn = body.querySelector('#calc-submit');
        submitBtn.disabled = true; submitBtn.textContent = 'מחשב...';

        try {
          const payload = questions.map(q => ({ question_id: String(q.id), ans: String(answers[q.id]) }));
          const sres = await API.submitSurvey(item.id, payload);
          const data  = (sres && sres.data) || {};
          const score = data.total_score ?? data.score;
          const label = data.msg2 || 'התוצאה שלך';
          const note  = data.msg || data.msg1 || '';
          showResult(body, label, score, note);
        } catch (e) {
          errEl.textContent = 'שגיאה בשליחת המחשבון. נסה שוב.';
          errEl.style.display = 'block';
          submitBtn.disabled = false; submitBtn.textContent = 'חשב תוצאה';
        }
      });

    } catch (err) {
      console.error('openCalculator:', err);
      body.innerHTML = '<div style="color:#c00;">שגיאה בטעינת המחשבון.</div>';
    }
  }

  function showResult(body, label, score, note) {
    body.innerHTML = `
      <div style="text-align:center;padding:20px 10px;">
        <div style="font-size:16px;color:var(--text-muted);margin-bottom:8px;">${escHtml(label || 'התוצאה שלך')}</div>
        <div style="font-size:54px;font-weight:800;color:var(--primary);line-height:1.1;">${escHtml(String(score ?? '—'))}</div>
        ${note ? `<div style="font-size:15px;line-height:1.7;margin-top:16px;">${escHtml(stripHtml(note))}</div>` : ''}
        <button id="calc-done" class="btn btn-primary" style="margin-top:24px;">סגור</button>
      </div>`;
    const done = body.querySelector('#calc-done');
    if (done) done.addEventListener('click', () => {
      const m = document.getElementById('guide-modal');
      if (m) m.remove();
    });
  }

  // ── תוצאות קודמות ───────────────────────────────────────────────────────────
  async function openHistory(item) {
    const title = decodeUnicode(item.title || '');
    const modal = openModal('תוצאות קודמות — ' + title, `<div class="loading-state"><div class="spinner" style="border-top-color:var(--accent);"></div></div>`);
    const body  = modal.querySelector('#guide-modal-body');

    try {
      const res = await API.getSurveyHistoryList(item.id);
      const subscribed = !(res && res.data && (res.data.is_subscribed === '0' || res.data.is_subscribed === 0))
                         && !(res && (res.status === 0 || res.status === '0'));

      if (!subscribed) {
        body.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🔒</div>
            <div class="empty-state-title">תוצאות קודמות זמינות למנויים</div>
            <div class="empty-state-msg">היסטוריית התוצאות שלך נשמרת עבור מנויים</div>
          </div>`;
        return;
      }

      const list = (res && res.data && res.data.list) || [];
      if (!list.length) {
        body.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-title">עדיין אין תוצאות</div><div class="empty-state-msg">הפעל את המחשבון כדי לשמור תוצאה</div></div>`;
        return;
      }

      body.innerHTML = list.map(h => {
        const score = h.total_score ?? h.score ?? '—';
        const date  = formatDate(h.submit_date || h.date_added || h.date || '');
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 4px;border-bottom:1px solid var(--border);">
            <div style="font-size:14px;color:var(--text-muted);">${escHtml(date)}</div>
            <div style="font-size:22px;font-weight:700;color:var(--primary);">${escHtml(String(score))}</div>
          </div>`;
      }).join('');

    } catch (err) {
      console.error('openHistory:', err);
      body.innerHTML = '<div style="color:#c00;">שגיאה בטעינת התוצאות.</div>';
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  function decodeUnicode(str) {
    if (!str) return '';
    return String(str).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
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
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { render };
})();
