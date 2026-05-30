// Tab 1 — Daily Messages (horizontal carousel)
const TabDaily = (() => {
  let messages = [];
  let currentIndex = 0;
  let page = 1;
  let loading = false;
  let hasMore = true;
  let isSubscribed = false;   // מסר יומי subscription (backend is_subscribed)
  let limitReached = false;   // backend is_msg_limit_over — older messages gated behind a subscription

  // WooCommerce subscription products for מסר יומי (hacara.org.il)
  const MASAR_URLS = {
    monthly: 'https://hacara.org.il/product/diuk-masar-yomi-monthly/', // WC #10068 — ₪18
    yearly:  'https://hacara.org.il/product/diuk-masar-yomi-yearly/',  // WC #10069 — ₪180
  };

  // gated = user can't see older messages without subscribing
  const dailyGated = () => !isSubscribed && limitReached;

  async function openRegisterUrl(url) {
    const uid = await Store.getUserId();
    const sep = url.includes('?') ? '&' : '?';
    window.open(`${url}${sep}diuk_uid=${encodeURIComponent(uid || '')}`);
  }

  async function render(container) {
    container.innerHTML = `
      <div class="daily-container">
        <div class="daily-slider-wrap" id="daily-slider-wrap">
          <div class="daily-slider" id="daily-slider"></div>
        </div>
        <div class="daily-nav">
          <button class="daily-nav-btn" id="daily-prev">&#8592; הקודמת</button>
          <div class="daily-dots" id="daily-dots"></div>
          <button class="daily-nav-btn" id="daily-next">הבאה &#8594;</button>
        </div>
      </div>
    `;

    // Messages are returned newest-first (index 0 = today, higher index = older)
    // "הקודמת" = go to older message = index+1; "הבאה" = go to newer = index-1
    document.getElementById('daily-prev').addEventListener('click', () => navigate(+1));
    document.getElementById('daily-next').addEventListener('click', () => navigate(-1));

    await loadMessages();
  }

  async function loadMessages() {
    if (loading) return;
    loading = true;

    const slider = document.getElementById('daily-slider');
    if (!slider) return;

    if (messages.length === 0) {
      slider.innerHTML = `
        <div class="daily-card" style="align-items:center;justify-content:center;">
          <div class="loading-state"><div class="spinner" style="border-top-color:var(--accent);"></div></div>
        </div>`;
    }

    try {
      const res = await API.getDailyMessages();
      const extracted = (() => {
        if (!res) return [];
        if (Array.isArray(res.data)) return res.data;
        if (res.data && Array.isArray(res.data.list)) return res.data.list;
        return [];
      })();
      if (extracted.length > 0 || (res && res.status == 1)) {
        const newMessages = extracted;
        hasMore = false; // backend returns the allowed window in one call
        messages = [...messages, ...newMessages];
        if (messages.length === 0) { showEmpty(); return; }

        // מסר יומי subscription gating (backend-enforced limit on previous messages)
        isSubscribed = String(res?.data?.is_subscribed)    === '1';
        limitReached = String(res?.data?.is_msg_limit_over) === '1';

        // Jump to today's message using position_id from server
        const positionId = res && res.data && res.data.position_id;
        if (positionId) {
          const idx = messages.findIndex(m => String(m.id) === String(positionId));
          currentIndex = idx >= 0 ? idx : 0;
        } else {
          currentIndex = 0; // fallback: newest message
        }
        window._todayMsgId    = messages[currentIndex] ? messages[currentIndex].id    : null;
        window._todayMsgTitle = messages[currentIndex] ? messages[currentIndex].title : null;
        renderSlider();
      } else {
        if (messages.length === 0) showEmpty();
      }
    } catch (err) {
      console.error('loadMessages:', err);
      if (messages.length === 0) showError(err.message || String(err));
    } finally {
      loading = false;
    }
  }

  function renderSlider() {
    showCard(currentIndex);
    updateNav();
  }

  function showCard(index) {
    const slider = document.getElementById('daily-slider');
    if (!slider) return;

    const msg = messages[index];
    if (!msg) return;

    slider.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'daily-card';
    card.innerHTML = buildCardHTML(msg);
    slider.appendChild(card);

    const toggle = card.querySelector('.comment-toggle');
    if (toggle) toggle.addEventListener('click', () => toggleComments(msg, card));

    const addBtn = card.querySelector('.comment-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => openAddCommentModal(msg, card));

    card.querySelectorAll('.rating-btn').forEach(btn => {
      btn.addEventListener('click', () => rateMessage(msg, card, parseInt(btn.dataset.value)));
    });

    const player = card.querySelector('.audio-player');
    if (player) bindAudioPlayer(player);

    setHeaderDate(msg);
    if (window.AppShare) AppShare.setCurrent({ type: 'daily_msg', id: msg.id, title: msg.title, desc: msg.description });
    updateDots();
  }

  const IMG_BASE = 'https://app.diuk.co.il/app/assets/images/';

  function buildCardHTML(msg) {
    const imgSrc = msg.img_name ? IMG_BASE + msg.img_name : '';
    const bgSrc  = msg.background_image ? IMG_BASE + msg.background_image : '';

    const bgStyle = bgSrc
      ? `background-image:url('${escapeAttr(bgSrc)}');background-size:cover;background-position:center;`
      : '';

    const imageHtml = imgSrc
      ? `<img class="daily-card-image" src="${escapeAttr(imgSrc)}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : '';

    const hasAudio = msg.audio_url && String(msg.audio_url).trim();
    const hasVideo = msg.video_url && String(msg.video_url).trim();
    const mediaHtml = hasVideo
      ? `<video controls dir="ltr" preload="none" style="width:100%;border-radius:8px;margin-top:12px;" src="${escapeAttr(msg.video_url)}"></video>`
      : hasAudio
        ? `<div class="audio-player" data-src="${escapeAttr(msg.audio_url)}">
             <button class="audio-play-btn" title="נגן">&#9654;</button>
             <div class="audio-progress-wrap">
               <div class="audio-progress-bar"></div>
             </div>
             <span class="audio-time">0:00</span>
           </div>`
        : '';

    const txtColor   = msg.txt_color   ? `color:${escapeAttr(msg.txt_color)};`   : '';
    const titleColor = msg.title_color ? `color:${escapeAttr(msg.title_color)};` : '';

    const commentCount = Array.isArray(msg.comments) ? msg.comments.length : (msg.comments_count || 0);
    const commentsLabel = commentCount ? `💬 ${commentCount} תגובות` : '💬 תגובות';

    // ── Rating (butterflies) ──
    const myRating  = msg.is_rating_by_me === '1' ? Math.round(parseFloat(msg.last_rating_by_me || 0)) : 0;
    const ratingAvg = msg.rating_avg || '';
    const butterflies = [1,2,3,4,5].map(i =>
      `<button class="rating-btn${i <= myRating ? ' active' : ''}" data-value="${i}" title="דרג ${i}">🦋</button>`
    ).join('');
    const ratingHtml = `
      <div class="rating-section">
        <div class="rating-row">
          <span class="rating-label">דירוג המסר</span>
          <div class="rating-stars">${butterflies}</div>
        </div>
        ${ratingAvg ? `<div class="rating-avg">דירוג כללי ${ratingAvg}</div>` : ''}
      </div>`;

    return `
      <div class="daily-card-inner" style="${bgStyle}">
        ${imageHtml}
        <div class="daily-card-body" style="${txtColor}">
          <div class="daily-card-title" style="${titleColor}">${msg.title || ''}</div>
          ${mediaHtml}
          <div class="daily-card-content">${msg.description || ''}</div>
          ${ratingHtml}
          <div class="comment-section">
            <div class="comment-section-btns">
              <button class="comment-toggle" style="${txtColor}">${commentsLabel}</button>
              <button class="comment-add-btn" style="${txtColor}">✏️ הוסף תגובה</button>
            </div>
            <div class="comments-list" style="display:none"></div>
          </div>
        </div>
      </div>
    `;
  }

  function bindAudioPlayer(playerEl) {
    const src    = playerEl.dataset.src;
    const btn    = playerEl.querySelector('.audio-play-btn');
    const bar    = playerEl.querySelector('.audio-progress-bar');
    const wrap   = playerEl.querySelector('.audio-progress-wrap');
    const timeEl = playerEl.querySelector('.audio-time');
    let audio    = null;

    function fmt(s) {
      if (!isFinite(s)) return '0:00';
      const m = Math.floor(s / 60), sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
    }

    function initAudio() {
      if (audio) return;
      audio = new Audio(src);
      audio.preload = 'metadata'; // only fetch headers, not full file
      audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        bar.style.width = (audio.currentTime / audio.duration * 100) + '%';
        timeEl.textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
      });
      audio.addEventListener('loadedmetadata', () => {
        timeEl.textContent = '0:00 / ' + fmt(audio.duration);
      });
      audio.addEventListener('ended', () => {
        btn.innerHTML = '&#9654;';
        bar.style.width = '0%';
        audio.currentTime = 0;
      });
    }

    btn.addEventListener('click', () => {
      initAudio();
      if (audio.paused) { audio.play(); btn.innerHTML = '&#9646;&#9646;'; }
      else              { audio.pause(); btn.innerHTML = '&#9654;'; }
    });

    wrap.addEventListener('click', (e) => {
      if (!audio || !audio.duration) return;
      const rect = wrap.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
    });
  }

  async function rateMessage(msg, card, rating) {
    // Update UI immediately (optimistic)
    card.querySelectorAll('.rating-btn').forEach((btn, i) => {
      btn.classList.toggle('active', i + 1 <= rating);
    });
    // Update avg display
    const avgEl = card.querySelector('.rating-avg');
    try {
      const res = await API.addDailyMessageRating(msg.id, msg.user_msg_id, rating);
      msg.is_rating_by_me = '1';
      msg.last_rating_by_me = String(rating);
      if (res && res.data && res.data.rating_avg && avgEl) {
        avgEl.textContent = `דירוג כללי ${res.data.rating_avg}`;
      }
    } catch (err) {
      console.error('rateMessage:', err);
    }
  }

  function openAddCommentModal(msg, card) {
    const existing = document.getElementById('add-comment-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'add-comment-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:3000;
      display:flex;align-items:center;justify-content:center;padding:20px;
    `;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:500px;width:100%;
                  box-shadow:0 8px 40px rgba(0,0,0,0.25);overflow:hidden;">
        <div style="background:var(--primary);padding:16px 20px;
                    display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:16px;font-weight:700;color:#fff;">הוסף תגובה</div>
          <button id="cmt-modal-close"
            style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;">✕</button>
        </div>
        <div style="padding:20px;">
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
            תגובה על: <strong>${msg.title || ''}</strong>
          </div>
          <textarea id="cmt-textarea"
            placeholder="כתוב את תגובתך כאן..."
            style="width:100%;min-height:110px;padding:12px;border:1.5px solid var(--border);
                   border-radius:10px;font-family:inherit;font-size:15px;resize:vertical;
                   direction:rtl;text-align:right;box-sizing:border-box;outline:none;
                   transition:border-color .2s;"
          ></textarea>

          <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;color:var(--text);">
              <input type="checkbox" id="cmt-share-chat" style="width:18px;height:18px;accent-color:var(--primary);cursor:pointer;">
              פרסום בצ'אט
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;color:var(--text);">
              <input type="checkbox" id="cmt-send-admin" style="width:18px;height:18px;accent-color:var(--primary);cursor:pointer;">
              שליחה למנהל הקהילה
            </label>
          </div>

          <div id="cmt-error"
            style="color:var(--danger);font-size:13px;margin-top:8px;display:none;"></div>
          <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-start;">
            <button id="cmt-send-btn" class="btn btn-primary">שלח תגובה</button>
            <button id="cmt-cancel-btn" class="btn btn-outline">ביטול</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => modal.querySelector('#cmt-textarea').focus(), 80);

    // focus ring
    const ta = modal.querySelector('#cmt-textarea');
    ta.addEventListener('focus', () => ta.style.borderColor = 'var(--primary)');
    ta.addEventListener('blur',  () => ta.style.borderColor = 'var(--border)');

    const closeModal = () => modal.remove();
    modal.querySelector('#cmt-modal-close').addEventListener('click', closeModal);
    modal.querySelector('#cmt-cancel-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    modal.querySelector('#cmt-send-btn').addEventListener('click', async () => {
      const text = ta.value.trim();
      if (!text) {
        ta.style.borderColor = 'var(--danger)';
        ta.focus();
        return;
      }
      const sendBtn = modal.querySelector('#cmt-send-btn');
      sendBtn.disabled = true;
      sendBtn.textContent = 'שולח...';
      const errEl = modal.querySelector('#cmt-error');
      errEl.style.display = 'none';

      try {
        const shareInChat = modal.querySelector('#cmt-share-chat').checked;
        const sendToAdmin = modal.querySelector('#cmt-send-admin').checked;
        await API.addDailyMessageComment(msg.id, text, shareInChat, sendToAdmin);
        closeModal();

        // ── Add new comment to the top of the open comments list ──
        const list = card.querySelector('.comments-list');
        if (list && list.style.display !== 'none') {
          const el = document.createElement('div');
          el.className = 'comment-item new-comment';
          el.innerHTML = `
            <div class="comment-author">אתה</div>
            <div class="comment-text">${text.replace(/\n/g, '<br>')}</div>
            <div class="comment-date">עכשיו</div>
          `;
          list.insertBefore(el, list.firstChild);
        }

        // ── Bump comment counter on the toggle button ──
        const toggle = card.querySelector('.comment-toggle');
        if (toggle) {
          const m = toggle.textContent.match(/\d+/);
          const n = m ? parseInt(m[0]) + 1 : 1;
          toggle.textContent = `💬 ${n} תגובות`;
        }

        // ── Mark Quotes tab stale — it will reload fresh on next visit ──
        if (window._appRenderedTabs) window._appRenderedTabs.delete('quotes');

      } catch (err) {
        errEl.textContent = 'שגיאה בשליחת תגובה. נסה שוב.';
        errEl.style.display = 'block';
        sendBtn.disabled = false;
        sendBtn.textContent = 'שלח תגובה';
      }
    });
  }

  async function toggleComments(msg, card) {
    const list = card.querySelector('.comments-list');
    if (!list) return;

    if (list.style.display === 'none') {
      list.style.display = 'flex';
      if (list.children.length === 0) {
        list.innerHTML = '<div class="spinner-sm"></div>';
        try {
          const preloaded = Array.isArray(msg.comments) && msg.comments.length > 0 ? msg.comments : null;
          const comments = preloaded || (await API.getDailyMessageComments(msg.id).then(r => (r && r.data) || []));
          list.innerHTML = '';
          if (comments.length === 0) {
            list.innerHTML = '<p style="font-size:13px;color:var(--text-muted);text-align:center">אין תגובות עדיין</p>';
          } else {
            comments.forEach(c => {
              const el = document.createElement('div');
              el.className = 'comment-item';
              el.innerHTML = `
                <div class="comment-author">${c.user_name || 'משתמש'}</div>
                <div class="comment-text">${c.comment || ''}</div>
                <div class="comment-date">${formatDate(c.comment_date || '')}</div>
              `;
              list.appendChild(el);
            });
          }
        } catch (e) {
          list.innerHTML = '<p style="font-size:13px;color:var(--danger)">שגיאה בטעינת תגובות</p>';
        }
      }
    } else {
      list.style.display = 'none';
    }
  }

  function navigate(dir) {
    const newIndex = currentIndex + dir;
    // Trying to go older than the allowed window → subscription wall (non-subscribers)
    if (dir > 0 && newIndex >= messages.length) {
      if (dailyGated()) showDailySubWall();
      return;
    }
    if (newIndex < 0 || newIndex >= messages.length) return;
    goTo(newIndex, true);
  }

  function setHeaderDate(msg) {
    const el = document.getElementById('header-date');
    if (el) el.textContent = msg ? formatDate(msg.user_notification_date || msg.date || '') : '';
  }

  function goTo(index, animate) {
    currentIndex = Math.max(0, Math.min(index, messages.length - 1));
    showCard(currentIndex);
    updateNav();
  }

  function updateDots() {
    const el = document.getElementById('daily-dots');
    if (el) el.textContent = messages.length ? `${currentIndex + 1} / ${messages.length}` : '';
  }

  function updateNav() {
    const prev = document.getElementById('daily-prev');
    const next = document.getElementById('daily-next');
    const atOldest = currentIndex >= messages.length - 1;
    // prev ("הקודמת") = go to older (index+1) — disabled at oldest, UNLESS older messages
    // are gated behind a subscription (then keep it clickable to surface the register wall)
    if (prev) prev.disabled = atOldest && !dailyGated();
    // next ("הבאה") = go to newer (index-1) — disabled when at today's message (index 0)
    if (next) next.disabled = currentIndex <= 0;
  }

  function showDailySubWall() {
    const slider = document.getElementById('daily-slider');
    if (!slider) return;
    slider.innerHTML = `
      <div class="daily-card">
        <div class="empty-state">
          <div class="empty-state-icon">🔒</div>
          <div class="empty-state-title">הגעת למגבלת המסרים</div>
          <div class="empty-state-msg">רכוש מנוי למסר יומי כדי לצפות במסרים קודמים</div>
          <div style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button class="premium-register-btn daily-register-month">הרשמה לחודש</button>
            <button class="premium-register-btn daily-register-year">הרשמה לשנה</button>
          </div>
        </div>
      </div>`;
    const mBtn = slider.querySelector('.daily-register-month');
    const yBtn = slider.querySelector('.daily-register-year');
    if (mBtn) mBtn.addEventListener('click', () => openRegisterUrl(MASAR_URLS.monthly));
    if (yBtn) yBtn.addEventListener('click', () => openRegisterUrl(MASAR_URLS.yearly));
    // Can't go further back; allow returning to newer messages
    const prev = document.getElementById('daily-prev');
    const next = document.getElementById('daily-next');
    if (prev) prev.disabled = true;
    if (next) next.disabled = false;
  }

  function showEmpty() {
    const slider = document.getElementById('daily-slider');
    if (slider) slider.innerHTML = `
      <div class="daily-card">
        <div class="empty-state">
          <div class="empty-state-icon">☀️</div>
          <div class="empty-state-title">אין הודעות</div>
          <div class="empty-state-msg">אין הודעות יומיות זמינות כרגע</div>
        </div>
      </div>`;
  }

  function showError(detail) {
    const slider = document.getElementById('daily-slider');
    if (slider) slider.innerHTML = `
      <div class="daily-card">
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-title">שגיאה בטעינה</div>
          <div style="font-size:11px;color:#888;word-break:break-all;padding:8px;background:#f0f0f0;border-radius:6px;text-align:left;direction:ltr;max-width:400px;">${detail || ''}</div>
          <button class="btn btn-primary btn-sm" onclick="TabDaily.reload()">נסה שוב</button>
        </div>
      </div>`;
  }

  function reload() {
    messages = []; currentIndex = 0; page = 1; hasMore = true;
    isSubscribed = false; limitReached = false;
    const container = document.getElementById('tab-daily');
    if (container) render(container);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return dateStr; }
  }

  function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  return { render, reload };
})();
