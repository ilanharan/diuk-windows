// Main app controller — auth state, routing, tab management
(async function init() {
  const splash     = document.getElementById('splash');
  const appEl      = document.getElementById('app');
  const screenMain = document.getElementById('screen-main');
  const screenLogin= document.getElementById('screen-login');

  let currentTab = 'daily';
  let renderedTabs = new Set();
  window._appRenderedTabs = renderedTabs; // allow other modules to mark tabs stale

  // ── Tab routing ───────────────────────────────────────────────────────────
  const TAB_MODULES = {
    daily:    TabDaily,
    articles: TabArticles,
    quotes:   TabQuotes,
    guides:   TabGuides,
    premium:  TabPremium,
  };

  function showTab(name) {
    if (!TAB_MODULES[name]) return;

    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
    });

    // Hide all panes, show target
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    const pane = document.getElementById(`tab-${name}`);
    if (pane) pane.classList.remove('hidden');

    // Lazy-render tab on first visit
    if (!renderedTabs.has(name)) {
      renderedTabs.add(name);
      TAB_MODULES[name].render(pane);
    }

    currentTab = name;
  }

  // Bind tab bar buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  // ── Header ────────────────────────────────────────────────────────────────
  async function buildHeader() {
    const name = await Store.getUserName();
    const initials = (name || 'א').trim().substring(0, 1);

    const header = document.createElement('div');
    header.className = 'app-header';
    header.innerHTML = `
      <div class="header-actions">
        <button class="btn-icon" id="menu-btn" title="תפריט">☰</button>
        <button class="btn-icon" id="refresh-btn" title="רענן">↻</button>
        <div id="header-date" class="header-date"></div>
      </div>
      <div class="header-title">דיוק</div>
      <div class="header-user">
        <div class="header-avatar" id="avatar-btn">${initials}</div>
      </div>
    `;
    // Insert header before the tab bar
    const tabBar = screenMain.querySelector('.tab-bar');
    screenMain.insertBefore(header, tabBar);

    header.querySelector('#menu-btn').addEventListener('click', openDrawer);

    header.querySelector('#refresh-btn').addEventListener('click', () => location.reload());

    header.querySelector('#avatar-btn').addEventListener('click', () => showProfilePopup());
  }

  // ── Profile popup ─────────────────────────────────────────────────────────
  async function showProfilePopup() {
    const existing = document.getElementById('profile-popup');
    if (existing) { existing.remove(); return; }

    const name    = await Store.getUserName();
    const phone   = await Store.get('user_phone', '');
    const isGuest = await Store.isGuest();

    const popup = document.createElement('div');
    popup.id = 'profile-popup';
    popup.className = 'profile-popup';
    popup.innerHTML = `
      <div class="profile-card">
        <div class="profile-name">${isGuest ? 'אורח' : (name || 'משתמש')}</div>
        ${phone ? `<div class="profile-phone" style="direction:ltr;text-align:left;">+972 ${phone.replace(/^0/,'').substring(0,2)} ${phone.replace(/^0/,'').substring(2)}</div>` : ''}
        <div class="profile-actions">
          <button class="profile-action-btn danger" id="logout-btn">התנתקות</button>
        </div>
      </div>
    `;
    document.body.appendChild(popup);

    popup.querySelector('#logout-btn').addEventListener('click', logout);
    popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async function logout() {
    await Store.clearUser();
    try { await firebaseAuth.signOut(); } catch {}
    location.reload();
  }

  // ── Badge polling ─────────────────────────────────────────────────────────
  async function pollBadges() {
    try {
      const res = await API.getBadgeCount();
      if (res && res.data) {
        const count    = res.data.badge_count || res.data.count || 0;
        window._badgeServerCount = count; // exposed so mark-all-read can save baseline

        const baseline = await Store.get('badge_baseline', 0);
        const display  = Math.max(0, count - baseline);

        const quotesBtn = document.querySelector('.tab-btn[data-tab="quotes"]');
        if (!quotesBtn) return;
        let badge = quotesBtn.querySelector('.tab-badge');
        if (display > 0) {
          if (!badge) {
            badge = document.createElement('div');
            badge.className = 'tab-badge';
            quotesBtn.style.position = 'relative';
            quotesBtn.appendChild(badge);
          }
          badge.textContent = display > 99 ? '99+' : display;
        } else {
          badge?.remove();
        }
      }
    } catch {}
  }

  // ── Main boot sequence ────────────────────────────────────────────────────
  async function boot() {
    const loggedIn = await Store.isLoggedIn();
    const isGuest  = await Store.isGuest();

    // Short splash delay so fonts load
    await new Promise(r => setTimeout(r, 800));

    splash.style.opacity = '0';
    splash.style.transition = 'opacity 0.4s';
    setTimeout(() => splash.classList.add('hidden'), 400);

    appEl.classList.remove('hidden');

    // Force phone login — guests must log in properly to see content
    if (loggedIn && !isGuest) {
      await showMainApp();
    } else {
      await Store.clearUser(); // clear any stale guest session
      showLoginScreen();
    }
  }

  function showLoginScreen() {
    screenLogin.classList.remove('hidden');
    LoginScreen.render(screenLogin, async (profile) => {
      screenLogin.classList.add('hidden');
      await showMainApp();
    });
  }

  async function showMainApp() {
    screenMain.classList.remove('hidden');
    await buildHeader();
    buildDrawer();
    showTab('daily');
    setTimeout(pollBadges, 2000);
    setInterval(pollBadges, 5 * 60 * 1000);
  }

  // ── Side Drawer ───────────────────────────────────────────────────────────
  function buildDrawer() {
    const overlay = document.createElement('div');
    overlay.id = 'drawer-overlay';
    overlay.className = 'drawer-overlay';
    overlay.addEventListener('click', closeDrawer);

    const drawer = document.createElement('div');
    drawer.id = 'side-drawer';
    drawer.className = 'side-drawer';

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
  }

  function openDrawer() {
    document.getElementById('drawer-overlay')?.classList.add('open');
    document.getElementById('side-drawer')?.classList.add('open');
    populateDrawer();
  }

  function closeDrawer() {
    document.getElementById('drawer-overlay')?.classList.remove('open');
    document.getElementById('side-drawer')?.classList.remove('open');
  }

  async function populateDrawer() {
    const drawer = document.getElementById('side-drawer');
    if (!drawer) return;

    const name     = await Store.getUserName();
    const phone    = await Store.get('user_phone', '');
    const initials = (name || 'א').trim().substring(0, 1);

    drawer.innerHTML = `
      <div class="drawer-head">
        <div class="drawer-avatar-lg">${initials}</div>
        <div class="drawer-user-name">${escHtml(name || 'משתמש')}</div>
        ${phone ? `<div class="drawer-user-phone" style="direction:ltr;text-align:left;">+972 ${phone.replace(/^0/,'').substring(0,2)} ${phone.replace(/^0/,'').substring(2)}</div>` : ''}
      </div>
      <div class="drawer-body" id="drawer-body">
        <div class="drawer-item" style="justify-content:center;">
          <span class="spinner-sm"></span>
        </div>
      </div>
      <div class="drawer-foot">
        <button class="drawer-logout-btn" id="drawer-logout-btn">התנתקות</button>
      </div>
    `;

    drawer.querySelector('.drawer-head').addEventListener('click', showProfileModal);
    drawer.querySelector('#drawer-logout-btn').addEventListener('click', logout);

    try {
      const res   = await API.getAllMenu();
      const items = extractMenuItems(res);
      const body  = document.getElementById('drawer-body');
      if (!body) return;

      if (items.length === 0) {
        body.innerHTML = `<div class="drawer-item" style="color:var(--text-muted);">אין פריטים בתפריט</div>`;
        return;
      }

      body.innerHTML = '';
      items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'drawer-item';
        const title = escHtml(item.title || item.name || item.menu_name || item.menu_title || '');
        const icon  = item.icon || item.menu_icon || '📄';
        el.innerHTML = `<span class="drawer-item-icon">${icon}</span><span>${title}</span>`;
        el.addEventListener('click', () => { closeDrawer(); openMenuPage(item); });
        body.appendChild(el);
      });
    } catch {
      const body = document.getElementById('drawer-body');
      if (body) body.innerHTML = `<div class="drawer-item" style="color:var(--text-muted);">שגיאה בטעינה</div>`;
    }
  }

  function extractMenuItems(res) {
    if (!res) return [];
    if (Array.isArray(res))                                  return res;
    if (Array.isArray(res.data))                             return res.data;
    if (res.data?.list && Array.isArray(res.data.list))      return res.data.list;
    if (res.data?.menu && Array.isArray(res.data.menu))      return res.data.menu;
    return [];
  }

  async function openMenuPage(item) {
    const menuId = String(item.id || item.menu_id || '');
    const title  = item.title || item.name || item.menu_name || item.menu_title || '';

    const screen = document.createElement('div');
    screen.className = 'menu-page-screen';
    screen.innerHTML = `
      <div class="menu-page-header">
        <button class="btn-icon" id="menu-back-btn">✕</button>
        <div class="menu-page-title">${escHtml(title)}</div>
        <div style="width:40px;"></div>
      </div>
      <div class="menu-page-body" id="menu-page-body">
        <div style="display:flex;justify-content:center;padding:60px 0;">
          <div class="spinner" style="border-color:rgba(0,0,0,0.1);border-top-color:var(--primary);"></div>
        </div>
      </div>
    `;
    document.body.appendChild(screen);
    screen.querySelector('#menu-back-btn').addEventListener('click', () => screen.remove());

    const body = document.getElementById('menu-page-body');
    try {
      // Try article list first
      const listRes  = await API.getArticleList(menuId, 0);
      const articles = extractMenuItems(listRes);

      if (articles.length > 0) {
        body.innerHTML = '';
        articles.forEach(article => {
          const el = document.createElement('div');
          el.className = 'menu-article-item';
          const aTitle = escHtml(article.title || article.article_title || '');
          const aDesc  = stripHtml(article.description || article.excerpt || '');
          el.innerHTML = `
            <div class="menu-article-title">${aTitle}</div>
            ${aDesc ? `<div class="menu-article-desc">${escHtml(aDesc.substring(0, 120))}${aDesc.length > 120 ? '…' : ''}</div>` : ''}
          `;
          el.addEventListener('click', () => showArticleModal(article));
          body.appendChild(el);
        });
        return;
      }

      // Fall back to page detail
      const pageRes = await API.getMenuPageDetail(menuId);
      const data    = pageRes?.data?.detail || pageRes?.data || pageRes || {};
      const html    = data.description || data.content || data.body || '';
      const imgUrl  = data.image || data.img_name || '';
      body.innerHTML = `
        ${imgUrl ? `<img src="${escAttr(imgUrl)}" style="width:100%;max-height:240px;object-fit:cover;border-radius:var(--radius);margin-bottom:16px;" onerror="this.remove()">` : ''}
        ${html ? html : `<div style="text-align:center;color:var(--text-muted);padding:40px 0;">אין תוכן זמין</div>`}
      `;
    } catch {
      body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:60px 0;">שגיאה בטעינה</div>`;
    }
  }

  function showArticleModal(article) {
    const existing = document.getElementById('article-detail-modal');
    if (existing) existing.remove();

    const title   = article.title || article.article_title || '';
    const content = article.description || article.content || '';
    const imgUrl  = article.image || article.img_name || '';

    const modal = document.createElement('div');
    modal.id = 'article-detail-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;
      display:flex;align-items:flex-start;justify-content:center;
      overflow-y:auto;padding:20px;direction:rtl;
    `;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:700px;width:100%;margin:auto;overflow:hidden;box-shadow:var(--shadow-lg);">
        ${imgUrl ? `<img src="${escAttr(imgUrl)}" style="width:100%;max-height:220px;object-fit:cover;" onerror="this.remove()">` : ''}
        <div style="background:var(--primary);padding:18px 20px;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:17px;font-weight:700;color:#fff;">${escHtml(title)}</div>
          <button id="article-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;">✕</button>
        </div>
        <div style="padding:24px;font-size:15px;line-height:1.9;direction:rtl;text-align:right;">
          ${content || `<div style="color:var(--text-muted);">אין תוכן</div>`}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#article-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  async function showProfileModal() {
    const existing = document.getElementById('profile-detail-modal');
    if (existing) { existing.remove(); return; }

    const name      = await Store.getUserName();
    const phone     = await Store.get('user_phone', '');
    const phoneCode = await Store.get('user_phone_code', '972');
    const email     = await Store.get('user_email', '');
    const imgUrl    = await Store.get('profile_image_url', '') || await Store.get('profile_image', '');
    const gender    = await Store.get('user_gender', '');
    const initials  = (name || 'א').trim().substring(0, 1);

    let pendingImageDataUrl = null;
    let selectedGender      = gender;

    const modal = document.createElement('div');
    modal.id = 'profile-detail-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:3000;
      display:flex;align-items:center;justify-content:center;padding:20px;direction:rtl;
    `;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:20px;max-width:400px;width:100%;overflow:hidden;box-shadow:var(--shadow-lg);">
        <div style="background:linear-gradient(150deg,var(--primary),var(--primary-light));padding:32px 20px 24px;display:flex;flex-direction:column;align-items:center;gap:12px;">
          <div id="avatar-wrap" class="profile-avatar-wrap" title="לחץ לשינוי תמונה">
            <img id="profile-avatar-img"
              src="${escAttr(imgUrl)}"
              style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.4);${imgUrl ? '' : 'display:none;'}"
              onerror="this.style.display='none';document.getElementById('profile-avatar-init').style.display='flex';">
            <div id="profile-avatar-init"
              style="width:80px;height:80px;border-radius:50%;background:var(--accent);color:#fff;
                     display:${imgUrl ? 'none' : 'flex'};align-items:center;justify-content:center;
                     font-size:32px;font-weight:700;">${initials}</div>
            <div class="profile-avatar-camera">📷</div>
          </div>
          <input type="file" id="profile-img-input" accept="image/*" style="display:none;">
          <div style="font-size:20px;font-weight:700;color:#fff;">${escHtml(name || 'משתמש')}</div>
        </div>
        <div style="padding:24px;display:flex;flex-direction:column;gap:14px;">
          ${phone ? `
            <div class="profile-field-row">
              <span style="font-size:20px;">📱</span>
              <div>
                <div class="profile-field-label">טלפון</div>
                <div class="profile-field-value" style="direction:ltr;text-align:left;">+${escHtml(phoneCode)} ${escHtml(phone.replace(/^0/,'').substring(0,2))} ${escHtml(phone.replace(/^0/,'').substring(2))}</div>
              </div>
            </div>` : ''}
          ${email ? `
            <div class="profile-field-row">
              <span style="font-size:20px;">✉️</span>
              <div>
                <div class="profile-field-label">אימייל</div>
                <div class="profile-field-value">${escHtml(email)}</div>
              </div>
            </div>` : ''}
          <div class="profile-field-row" style="flex-direction:column;align-items:flex-start;gap:10px;">
            <div class="profile-field-label">מין</div>
            <div style="display:flex;gap:10px;width:100%;">
              <button class="gender-btn${gender === 'male'   ? ' active' : ''}" data-gender="male">זכר</button>
              <button class="gender-btn${gender === 'female' ? ' active' : ''}" data-gender="female">נקבה</button>
            </div>
          </div>
          <button id="profile-modal-save" class="btn btn-primary" style="margin-top:4px;">שמירה</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Photo picker
    modal.querySelector('#avatar-wrap').addEventListener('click', () =>
      modal.querySelector('#profile-img-input').click()
    );
    modal.querySelector('#profile-img-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        pendingImageDataUrl = ev.target.result;
        const img  = modal.querySelector('#profile-avatar-img');
        const init = modal.querySelector('#profile-avatar-init');
        img.src = pendingImageDataUrl;
        img.style.display = '';
        init.style.display = 'none';
      };
      reader.readAsDataURL(file);
    });

    // Gender toggle
    modal.querySelectorAll('.gender-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedGender = btn.dataset.gender;
        modal.querySelectorAll('.gender-btn').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    // Save
    modal.querySelector('#profile-modal-save').addEventListener('click', async () => {
      await Store.set('user_gender', selectedGender);
      if (pendingImageDataUrl) await Store.set('profile_image_url', pendingImageDataUrl);
      modal.remove();
    });

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  function stripHtml(html) {
    const t = document.createElement('div');
    t.innerHTML = html;
    return t.textContent || '';
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }

  boot();
})();
