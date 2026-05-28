// Tab 3 — Chat (GetDailyMessageAllComment)
const TabQuotes = (() => {
  let offset         = 0;
  let loading        = false;
  let hasMore        = true;
  let allItems       = [];
  let seenIds        = new Set();
  let readIds        = new Set();
  let _scrollEl      = null;
  let _scrollHandler = null;
  let _gen           = 0; // generation counter — cancels stale timeouts on refresh

  async function render(container) {
    // Cancel stale timeouts from previous render
    const gen = ++_gen;

    if (_scrollEl && _scrollHandler) {
      _scrollEl.removeEventListener('scroll', _scrollHandler);
      _scrollEl = null;
      _scrollHandler = null;
    }

    offset  = 0;
    loading = false;
    hasMore = true;
    allItems = [];
    seenIds  = new Set();

    await loadReadIds();

    container.innerHTML = `
      <div class="list-header">צ'אט</div>
      <div id="quotes-list" class="chat-list">
        ${skeletonHTML(5)}
      </div>
      <div class="chat-fabs">
        <button class="fab-btn fab-plus" id="chat-fab-plus" title="הוספת תגובה">＋</button>
        <button class="fab-btn fab-check" id="chat-fab-check" title="סמן הכל כנקרא">✓</button>
      </div>
    `;

    document.getElementById('chat-fab-plus').addEventListener('click', openCommentForm);
    document.getElementById('chat-fab-check').addEventListener('click', handleMarkAllRead);

    await loadPage(gen);

    if (gen !== _gen) return; // superseded by a newer render

    _scrollHandler = () => {
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 80) {
        if (!loading && hasMore) loadPage(gen);
      }
    };
    _scrollEl = container;
    container.addEventListener('scroll', _scrollHandler);
    // One-shot viewport fill check after layout settles
    setTimeout(() => { if (gen === _gen && _scrollHandler) _scrollHandler(); }, 120);
  }

  async function loadReadIds() {
    const stored = await Store.get('chat_read_ids', []);
    readIds = new Set(Array.isArray(stored) ? stored.map(String) : []);
  }

  async function markAsRead(id) {
    readIds.add(String(id));
    await Store.set('chat_read_ids', [...readIds]);
  }

  async function handleMarkAllRead() {
    // Clear badge synchronously first — before any await that could fail
    document.querySelector('.tab-btn[data-tab="quotes"] .tab-badge')?.remove();

    const btn = document.getElementById('chat-fab-check');
    if (btn) btn.disabled = true;
    try { await API.markAllRead(); } catch {}
    allItems.forEach(item => readIds.add(String(item.id)));
    try { await Store.set('chat_read_ids', [...readIds]); } catch {}
    try {
      const res = await API.getBadgeCount();
      const serverCount = res?.data?.badge_count || res?.data?.count || 0;
      await Store.set('badge_baseline', serverCount);
    } catch {}
    document.querySelectorAll('.chat-item--unread').forEach(el => {
      el.classList.remove('chat-item--unread');
      el.querySelector('.chat-unread-dot')?.remove();
    });
    if (btn) btn.disabled = false;
  }

  function openCommentForm() {
    const msgId = window._todayMsgId;
    if (!msgId) {
      alert('יש לפתוח תחילה את המסר היומי');
      return;
    }

    const existing = document.getElementById('comment-form-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'comment-form-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;
      display:flex;align-items:center;justify-content:center;padding:20px;
    `;

    function renderStep1() {
      modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;max-width:500px;width:100%;box-shadow:var(--shadow-lg);overflow:hidden;">
          <div style="background:var(--primary);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:17px;font-weight:700;color:#fff;">הודעה חדשה</div>
            <button id="comment-modal-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;">✕</button>
          </div>
          <div style="padding:20px;display:flex;flex-direction:column;gap:14px;direction:rtl;">
            <div style="font-size:14px;color:var(--text-muted);">הקלד כותרת</div>
            <input id="comment-title" type="text" placeholder="כותרת ההודעה..."
              style="width:100%;padding:12px;border:2px solid var(--border);border-radius:10px;
                     font-family:inherit;font-size:14px;direction:rtl;outline:none;transition:border-color 0.2s;"
              onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'">
            <div id="step1-error" style="display:none;color:var(--danger);font-size:13px;"></div>
            <button id="step1-ok" class="btn btn-primary btn-full">אישור</button>
          </div>
        </div>
      `;
      modal.querySelector('#comment-modal-close').addEventListener('click', () => modal.remove());
      modal.querySelector('#clear-title').addEventListener('click', () => {
        modal.querySelector('#comment-title').value = '';
        modal.querySelector('#comment-title').focus();
      });
      modal.querySelector('#step1-ok').addEventListener('click', () => {
        const title = modal.querySelector('#comment-title').value.trim();
        const errEl = modal.querySelector('#step1-error');
        if (!title) { errEl.textContent = 'יש להזין כותרת'; errEl.style.display = 'block'; return; }
        renderStep2(title);
      });
      modal.querySelector('#comment-title').addEventListener('keydown', e => {
        if (e.key === 'Enter') modal.querySelector('#step1-ok').click();
      });
      setTimeout(() => modal.querySelector('#comment-title').focus(), 100);
    }

    function renderStep2(title) {
      modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;max-width:500px;width:100%;box-shadow:var(--shadow-lg);overflow:hidden;">
          <div style="background:var(--primary);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:17px;font-weight:700;color:#fff;">הוספת תגובה</div>
            <button id="comment-modal-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;">✕</button>
          </div>
          <div style="padding:20px;display:flex;flex-direction:column;gap:14px;direction:rtl;">
            <div style="font-size:13px;color:var(--text-muted);font-weight:600;">${escHtml(title)}</div>
            <textarea id="comment-text" rows="4" placeholder="כתוב את התגובה שלך..."
              style="width:100%;padding:12px;border:2px solid var(--border);border-radius:10px;
                     font-family:inherit;font-size:14px;resize:vertical;direction:rtl;
                     outline:none;transition:border-color 0.2s;"
              onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'"></textarea>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;">
              <input type="checkbox" id="comment-chat" style="width:16px;height:16px;accent-color:var(--primary);">
              פרסום בצ'אט
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;">
              <input type="checkbox" id="comment-admin" style="width:16px;height:16px;accent-color:var(--primary);">
              שליחה למנהל הקהילה
            </label>
            <div id="comment-error" style="display:none;color:var(--danger);font-size:13px;"></div>
            <div style="display:flex;gap:10px;">
              <button id="comment-back" class="btn btn-outline" style="flex:1;">חזרה</button>
              <button id="comment-submit" class="btn btn-primary" style="flex:2;">שליחה</button>
            </div>
          </div>
        </div>
      `;
      modal.querySelector('#comment-modal-close').addEventListener('click', () => modal.remove());
      modal.querySelector('#comment-back').addEventListener('click', () => renderStep1());

      modal.querySelector('#comment-submit').addEventListener('click', async () => {
        const text      = modal.querySelector('#comment-text').value.trim();
        const inChat    = modal.querySelector('#comment-chat').checked;
        const toAdmin   = modal.querySelector('#comment-admin').checked;
        const errEl     = modal.querySelector('#comment-error');
        const submitBtn = modal.querySelector('#comment-submit');

        if (!text) { errEl.textContent = 'יש להזין תגובה'; errEl.style.display = 'block'; return; }
        errEl.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'שולח...';
        try {
          await API.addDailyMessageComment(msgId, title + '\n' + text, inChat, toAdmin);
          modal.remove();
          if (inChat) {
            const container = document.getElementById('tab-quotes');
            if (container) {
              window._appRenderedTabs && window._appRenderedTabs.delete('quotes');
              container.innerHTML = '';
              TabQuotes.render(container);
            }
          }
        } catch {
          errEl.textContent = 'שגיאה בשליחה, נסה שוב';
          errEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'שליחה';
        }
      });

      setTimeout(() => modal.querySelector('#comment-text').focus(), 100);
    }

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    renderStep1();
  }

  async function loadPage(gen) {
    if (loading || !hasMore) return;
    if (gen !== _gen) return;
    loading = true;
    const currentOffset = offset;
    try {
      const res  = await API.getQuotes(currentOffset);
      const list = document.getElementById('quotes-list');
      if (!list) return;

      if (currentOffset === 0) list.innerHTML = '';

      const raw   = extractList(res);
      const items = raw.filter(item => {
        const key = item.id || JSON.stringify(item);
        if (seenIds.has(key)) return false;
        seenIds.add(key);
        return true;
      });
      hasMore  = items.length > 0;
      offset  += 10;
      allItems = [...allItems, ...items];

      if (allItems.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">💬</div>
            <div class="empty-state-title">אין הודעות בצ'אט</div>
          </div>`;
        return;
      }

      items.forEach(item => list.appendChild(buildCard(item)));

      // If viewport not yet filled, auto-load next page
      if (hasMore && _scrollEl) {
        setTimeout(() => {
          if (gen !== _gen) return;
          if (_scrollEl && _scrollEl.scrollHeight <= _scrollEl.clientHeight + 80) {
            loadPage(gen);
          }
        }, 50);
      }

    } catch (err) {
      console.error('loadChat:', err);
      if (currentOffset === 0) {
        const list = document.getElementById('quotes-list');
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
    const el     = document.createElement('div');
    el.className = 'chat-item';

    const isUnread = !readIds.has(String(item.id || ''));
    if (isUnread) el.classList.add('chat-item--unread');

    const rawDesc = decodeUnicode(item.description || item.comment || '');
    let title, desc;
    if (rawDesc.includes('\n')) {
      const nlIdx = rawDesc.indexOf('\n');
      title = rawDesc.substring(0, nlIdx).trim() || decodeUnicode(item.msg_title || item.title || '');
      desc  = rawDesc.substring(nlIdx + 1).trim();
    } else {
      title = decodeUnicode(item.msg_title || item.title || '');
      desc  = rawDesc;
    }
    const author = decodeUnicode(item.user_name || item.author || '');
    const date   = formatDate(item.date || item.date_added || '');
    const rawImg = item.user_image || '';
    const imgUrl = rawImg
      ? (rawImg.startsWith('http') ? rawImg : 'https://app.diuk.co.il/app/assets/images/' + rawImg)
      : '';

    const avatarHtml = imgUrl
      ? `<img class="chat-avatar" src="${escAttr(imgUrl)}" alt="" onerror="this.style.display='none'">`
      : `<div class="chat-avatar chat-avatar-placeholder">👤</div>`;

    const _tmp = document.createElement('div');
    _tmp.innerHTML = desc;
    const clean       = (_tmp.textContent || _tmp.innerText || '').trim();
    const descPreview = clean.length > 80 ? clean.substring(0, 80) + '…' : clean;

    el.innerHTML = `
      <div class="chat-item-inner">
        ${avatarHtml}
        <div class="chat-item-body">
          <div class="chat-item-title">${escHtml(title)}</div>
          <div class="chat-item-category">מסר יומי</div>
          ${descPreview ? `<div class="chat-item-desc">${escHtml(descPreview)}</div>` : ''}
          ${author      ? `<div class="chat-item-author">${escHtml(author)}</div>`    : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
          <div class="chat-item-date">${date}</div>
          ${isUnread ? '<div class="chat-unread-dot"></div>' : ''}
        </div>
      </div>
    `;

    el.addEventListener('click', async () => {
      if (el.classList.contains('chat-item--unread')) {
        el.classList.remove('chat-item--unread');
        el.querySelector('.chat-unread-dot')?.remove();
        markAsRead(item.id);
      }
      const myId = await Store.getUserId();
      const isOwner = myId && String(item.uid) === String(myId);
      showChatDetailModal({ item, title, desc, author, date, isOwner, cardEl: el });
    });

    return el;
  }

  function showChatDetailModal({ item, title, desc, author, date, isOwner, cardEl }) {
    const existing = document.getElementById('chat-detail-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'chat-detail-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;
      display:flex;align-items:flex-start;justify-content:center;
      overflow-y:auto;padding:20px;
    `;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:700px;width:100%;margin:auto;overflow:hidden;box-shadow:var(--shadow-lg);">
        <div style="background:var(--primary);padding:18px 20px;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:18px;font-weight:700;color:#fff;">${escHtml(title)}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${isOwner ? `<button id="delete-comment-btn" title="מחק הודעה"
              style="background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:18px;
                     cursor:pointer;padding:4px 8px;border-radius:6px;transition:background 0.2s;"
              onmouseover="this.style.background='rgba(231,76,60,0.6)'"
              onmouseout="this.style.background='rgba(255,255,255,0.15)'">🗑️</button>` : ''}
            <button id="chat-modal-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:0 4px;">✕</button>
          </div>
        </div>
        <div style="padding:24px;font-size:15px;line-height:1.8;direction:rtl;text-align:right;">
          <div style="margin-bottom:12px;font-size:13px;color:var(--text-muted);">
            ${author ? `<strong>${escHtml(author)}</strong> • ` : ''}${date}
          </div>
          <div>${desc || escHtml(title)}</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#chat-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    if (isOwner) {
      modal.querySelector('#delete-comment-btn').addEventListener('click', async () => {
        if (!confirm('למחוק את ההודעה?')) return;
        try {
          await API.deleteComment(item.id);
          modal.remove();
          cardEl.remove();
          allItems = allItems.filter(i => i.id !== item.id);
        } catch {
          alert('שגיאה במחיקה, נסה שוב');
        }
      });
    }
  }

  function skeletonHTML(n) {
    return Array(n).fill(`
      <div class="skeleton-chat">
        <div class="skeleton" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
          <div class="skeleton" style="height:16px;width:60%;border-radius:4px;"></div>
          <div class="skeleton" style="height:12px;width:40%;border-radius:4px;"></div>
          <div class="skeleton" style="height:12px;width:80%;border-radius:4px;"></div>
        </div>
      </div>
    `).join('');
  }

  function formatDate(d) {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
    } catch { return d; }
  }

  function decodeUnicode(str) {
    if (!str) return str;
    return String(str).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  }

  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { render };
})();
