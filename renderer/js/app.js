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
  async function refreshHeaderAvatar() {
    const avatarBtn = document.getElementById('avatar-btn');
    if (!avatarBtn) return;
    const name     = await Store.getUserName();
    const initials = (name || 'א').trim().substring(0, 1);
    const imgUrl   = await Store.get('profile_image_url', '') || await Store.get('profile_image', '');
    avatarBtn.innerHTML = imgUrl
      ? `<img src="${escAttr(imgUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.remove();">`
      : initials;
  }

  async function buildHeader() {
    const name     = await Store.getUserName();
    const initials = (name || 'א').trim().substring(0, 1);
    const imgUrl   = await Store.get('profile_image_url', '') || await Store.get('profile_image', '');

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
        <div class="header-avatar" id="avatar-btn">${imgUrl ? `<img src="${escAttr(imgUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.remove();">` : initials}</div>
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
      items
        .filter(item => !['7', '8'].includes(String(item.menu_type || '')))
        .forEach(item => {
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

    if (String(item.menu_type || '') === '11') {
      openGuideBookingScreen(title);
      return;
    }
    if (String(item.menu_type || '') === '2') {
      openShopScreen(title);
      return;
    }
    if (String(item.menu_type || '') === '5') {
      openHtmlPageScreen(title, menuId);
      return;
    }
    if (String(item.menu_type || '') === '10') {
      openSettingsScreen(title);
      return;
    }
    if (String(item.menu_type || '') === '3') {
      openContactScreen(title);
      return;
    }

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
      const baseUrl  = listRes?.base_url || 'https://app.diuk.co.il/app/';
      const imageUrl = listRes?.image_url || 'assets/images/';
      const articles = extractMenuItems(listRes);

      if (articles.length > 0) {
        body.innerHTML = '';
        articles.forEach(article => {
          const el = document.createElement('div');
          el.className = 'menu-article-item';
          const aTitle  = decodeUnicode(article.title || article.article_title || '');
          const aDesc   = decodeUnicode(stripHtmlAndStyle(article.description || article.excerpt || ''));
          const imgFull = article.img_name ? baseUrl + imageUrl + article.img_name : '';
          el.innerHTML = `
            ${imgFull ? `<img src="${escAttr(imgFull)}" style="width:100%;max-height:180px;object-fit:cover;border-radius:var(--radius) var(--radius) 0 0;" onerror="this.remove()">` : ''}
            <div style="padding:14px 16px 10px;">
              <div class="menu-article-title">${escHtml(aTitle)}</div>
              ${aDesc ? `<div class="menu-article-desc">${escHtml(aDesc.substring(0, 120))}${aDesc.length > 120 ? '…' : ''}</div>` : ''}
              <button class="menu-article-more-btn">המשך</button>
            </div>
          `;
          el.querySelector('.menu-article-more-btn').addEventListener('click', () => showArticleModal(article, baseUrl));
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

  function showArticleModal(article, baseUrl) {
    const existing = document.getElementById('article-detail-modal');
    if (existing) existing.remove();

    const title   = decodeUnicode(article.title || article.article_title || '');
    const content = article.description || article.content || '';
    const base    = baseUrl || 'https://app.diuk.co.il/app/';

    // Wrap content as a full HTML doc with base URL so relative images/fonts resolve
    const srcDoc = content.trimStart().toLowerCase().startsWith('<!doctype') || content.trimStart().toLowerCase().startsWith('<html')
      ? content
      : `<!DOCTYPE html><html><head><base href="${base}"><meta charset="utf-8"></head><body>${content}</body></html>`;

    const modal = document.createElement('div');
    modal.id = 'article-detail-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;
      display:flex;align-items:flex-start;justify-content:center;
      overflow-y:auto;padding:20px;direction:rtl;
    `;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:700px;width:100%;margin:auto;overflow:hidden;box-shadow:var(--shadow-lg);">
        <div style="background:var(--primary);padding:18px 20px;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:17px;font-weight:700;color:#fff;">${escHtml(title)}</div>
          <button id="article-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;">✕</button>
        </div>
        <iframe id="article-iframe" style="width:100%;min-height:500px;border:none;display:block;"
          sandbox="allow-same-origin allow-scripts allow-popups"></iframe>
      </div>
    `;
    document.body.appendChild(modal);

    const iframe = modal.querySelector('#article-iframe');
    iframe.srcdoc = srcDoc;
    iframe.addEventListener('load', () => {
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          const style = doc.createElement('style');
          style.textContent = `
            body, p, div, span, li, td { font-size: 16px !important; line-height: 1.7 !important; }
            h1 { font-size: 24px !important; }
            h2 { font-size: 21px !important; }
            h3 { font-size: 18px !important; }
            h4, h5, h6 { font-size: 17px !important; }
          `;
          doc.head.appendChild(style);
          doc.querySelectorAll('a[href]').forEach(a => { a.target = '_blank'; });
          const h = doc.documentElement.scrollHeight;
          if (h && h > 100) iframe.style.height = h + 'px';
        }
      } catch {}
    });

    modal.querySelector('#article-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  // ── Contact Us (menu_type 3) ──────────────────────────────────────────────
  async function openContactScreen(title) {
    const screen = document.createElement('div');
    screen.className = 'menu-page-screen';
    screen.innerHTML = `
      <div class="menu-page-header">
        <button class="btn-icon" id="contact-back-btn">✕</button>
        <div class="menu-page-title">${escHtml(title || 'צור קשר')}</div>
        <div style="width:40px;"></div>
      </div>
      <div class="menu-page-body" id="contact-body">
        <div style="display:flex;justify-content:center;padding:60px 0;">
          <div class="spinner" style="border-color:rgba(0,0,0,0.1);border-top-color:var(--primary);"></div>
        </div>
      </div>
    `;
    document.body.appendChild(screen);
    screen.querySelector('#contact-back-btn').addEventListener('click', () => screen.remove());

    try {
      const res      = await API.getContactUsList();
      const baseUrl  = (res?.base_url || '') + (res?.contact_us_image_url || '');
      const contacts = res?.data?.list || [];
      const body     = screen.querySelector('#contact-body');

      if (contacts.length === 0) {
        body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:48px;">אין אנשי קשר</div>`;
        return;
      }

      body.innerHTML = '';
      contacts.forEach(contact => {
        const phone  = String(contact.phone_number || contact.phone_no || '').replace(/\D/g, '');
        const imgUrl = contact.image ? baseUrl + contact.image : '';
        const el     = document.createElement('div');
        el.className = 'contact-item';
        el.innerHTML = `
          ${imgUrl ? `<img class="contact-avatar" src="${escAttr(imgUrl)}" onerror="this.style.display='none';">` :
            `<div class="contact-avatar contact-avatar-initials">${escHtml((contact.title || '?').trim()[0])}</div>`}
          <div class="contact-info">
            <div class="contact-name">${escHtml(contact.title || '')}</div>
            <div class="contact-phone" style="direction:ltr;">${escHtml('+' + phone)}</div>
          </div>
          ${phone ? `<button class="contact-wa-btn" data-phone="${escAttr(phone)}">
            <span style="font-size:20px;">💬</span> WhatsApp
          </button>` : ''}
        `;
        if (phone) {
          el.querySelector('.contact-wa-btn').addEventListener('click', () => {
            window.open(`https://wa.me/${phone}`);
          });
        }
        body.appendChild(el);
      });
    } catch {
      screen.querySelector('#contact-body').innerHTML =
        `<div style="text-align:center;color:var(--text-muted);padding:48px;">שגיאה בטעינה</div>`;
    }
  }

  // ── Settings (menu_type 10) ───────────────────────────────────────────────
  async function openSettingsScreen(title) {
    const screen = document.createElement('div');
    screen.className = 'menu-page-screen';
    screen.innerHTML = `
      <div class="menu-page-header">
        <button class="btn-icon" id="settings-back-btn">✕</button>
        <div class="menu-page-title">${escHtml(title || 'הגדרות')}</div>
        <div style="width:40px;"></div>
      </div>
      <div class="menu-page-body" id="settings-body">
        <div style="display:flex;justify-content:center;padding:60px 0;">
          <div class="spinner" style="border-color:rgba(0,0,0,0.1);border-top-color:var(--primary);"></div>
        </div>
      </div>
    `;
    document.body.appendChild(screen);
    screen.querySelector('#settings-back-btn').addEventListener('click', () => screen.remove());

    try {
      const res       = await API.getCommunityManagers();
      const managers  = res?.data?.community_managers || res?.community_managers || [];
      const timeSlots = res?.data?.daily_msg_assign_time_list || res?.daily_msg_assign_time_list || [];
      const profile   = res?.data?.profile || res?.profile || {};

      // Read saved selections: prefer server profile, fall back to local Store
      const currentManagerId = String(profile.community_manager_id || await Store.get('settings_community_manager_id', '') || '');
      const currentTimeId    = String(profile.daily_msg_assign_time_id || await Store.get('settings_daily_time_id', '') || '');

      const currentManager = managers.find(m => String(m.id) === currentManagerId);
      const currentTime    = timeSlots.find(t => String(t.id) === currentTimeId);

      const body = screen.querySelector('#settings-body');
      body.innerHTML = '';

      // ── Community Manager ──
      const managerRow = document.createElement('div');
      managerRow.className = 'settings-row';
      managerRow.innerHTML = `
        <div class="settings-row-label">מנהל קהילה</div>
        <div class="settings-row-value">${escHtml(currentManager?.name || 'לא נבחר')}</div>
        <div class="settings-row-arrow">‹</div>
      `;
      managerRow.addEventListener('click', () =>
        openSettingsPicker(screen, 'בחירת מנהל קהילה', managers, currentManagerId,
          async (id) => {
            await Store.set('settings_community_manager_id', String(id));
            const r = await API.updateProfile({ community_manager_id: String(id) });
            managerRow.querySelector('.settings-row-value').textContent =
              managers.find(m => String(m.id) === String(id))?.name || '';
            return r;
          }
        )
      );
      body.appendChild(managerRow);

      // ── Daily Message Time ──
      const timeRow = document.createElement('div');
      timeRow.className = 'settings-row';
      timeRow.innerHTML = `
        <div class="settings-row-label">שעה למסר יומי</div>
        <div class="settings-row-value">${escHtml(currentTime?.label || 'לא נבחר')}</div>
        <div class="settings-row-arrow">‹</div>
      `;
      timeRow.addEventListener('click', () =>
        openSettingsPicker(screen, 'בחירת שעה למסר יומי', timeSlots, currentTimeId,
          async (id) => {
            await Store.set('settings_daily_time_id', String(id));
            await API.updateProfile({ daily_msg_assign_time_id: String(id) });
            timeRow.querySelector('.settings-row-value').textContent =
              timeSlots.find(t => String(t.id) === String(id))?.label || '';
          }
        )
      );
      body.appendChild(timeRow);

      // ── Subscription Management (placeholder) ──
      const subsRow = document.createElement('div');
      subsRow.className = 'settings-row settings-row-disabled';
      subsRow.innerHTML = `
        <div class="settings-row-label">ניהול מנויים</div>
        <div class="settings-row-value" style="color:var(--text-muted);font-size:13px;">יטופל בהמשך</div>
        <div class="settings-row-arrow">‹</div>
      `;
      body.appendChild(subsRow);

    } catch {
      screen.querySelector('#settings-body').innerHTML =
        `<div style="text-align:center;color:var(--text-muted);padding:48px;">שגיאה בטעינה</div>`;
    }
  }

  function openSettingsPicker(screen, title, items, currentId, onSave) {
    let selectedId = String(currentId);

    const overlay = document.createElement('div');
    overlay.className = 'guide-confirm-overlay';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:18px;max-width:360px;width:100%;max-height:70vh;
                  display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--shadow-lg);">
        <div style="background:var(--primary);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:16px;font-weight:700;color:#fff;">${escHtml(title)}</div>
          <button id="picker-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">✕</button>
        </div>
        <div id="picker-list" style="overflow-y:auto;flex:1;"></div>
        <div style="padding:14px 16px;border-top:1px solid var(--border);">
          <button id="picker-save" class="btn btn-primary btn-full">שמירה</button>
        </div>
      </div>
    `;
    screen.appendChild(overlay);
    overlay.querySelector('#picker-close').addEventListener('click', () => overlay.remove());

    const list = overlay.querySelector('#picker-list');
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'settings-picker-item' + (String(item.id) === selectedId ? ' selected' : '');
      el.dataset.id = String(item.id);
      el.innerHTML = `
        <span>${escHtml(item.label || item.name || '')}</span>
        <span class="picker-check" style="color:var(--primary);font-size:18px;">${String(item.id) === selectedId ? '✓' : ''}</span>
      `;
      el.addEventListener('click', () => {
        selectedId = String(item.id);
        list.querySelectorAll('.settings-picker-item').forEach(r => {
          const active = r.dataset.id === selectedId;
          r.classList.toggle('selected', active);
          r.querySelector('.picker-check').textContent = active ? '✓' : '';
        });
      });
      list.appendChild(el);
    });

    overlay.querySelector('#picker-save').addEventListener('click', async () => {
      overlay.remove();
      try { await onSave(selectedId); } catch {}
    });
  }

  // ── HTML page (menu_type 5) ───────────────────────────────────────────────
  async function openHtmlPageScreen(title, menuId) {
    const screen = document.createElement('div');
    screen.className = 'menu-page-screen';
    screen.innerHTML = `
      <div class="menu-page-header">
        <button class="btn-icon" id="html-back-btn">✕</button>
        <div class="menu-page-title">${escHtml(title)}</div>
        <div style="width:40px;"></div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;" id="html-page-body">
        <div style="display:flex;justify-content:center;padding:60px 0;">
          <div class="spinner" style="border-color:rgba(0,0,0,0.1);border-top-color:var(--primary);"></div>
        </div>
      </div>
    `;
    document.body.appendChild(screen);
    screen.querySelector('#html-back-btn').addEventListener('click', () => screen.remove());

    try {
      const res     = await API.getMenuPageDetail(menuId);
      const data    = res?.data?.detail || res?.data || res || {};
      const html    = data.page_html || data.description || data.content || data.body || '';
      const bgcolor = data.bgcolor || '#ffffff';
      const body    = screen.querySelector('#html-page-body');

      if (!html) {
        body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:48px;">אין תוכן זמין</div>`;
        return;
      }

      const srcDoc = html.trimStart().toLowerCase().startsWith('<!doctype') || html.trimStart().toLowerCase().startsWith('<html')
        ? html
        : `<!DOCTYPE html><html><head><base href="https://app.diuk.co.il/app/"><meta charset="utf-8">
           <style>body{background:${bgcolor};margin:0;padding:16px;direction:rtl;}</style>
           </head><body>${html}</body></html>`;

      body.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'flex:1;width:100%;border:none;display:block;min-height:400px;';
      iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups');
      body.appendChild(iframe);
      iframe.srcdoc = srcDoc;
      iframe.addEventListener('load', () => {
        try {
          const doc = iframe.contentDocument;
          if (doc) {
            const style = doc.createElement('style');
            style.textContent = `
              body, p, div, span, li, td { font-size: 16px !important; line-height: 1.7 !important; }
              h1 { font-size: 24px !important; }
              h2 { font-size: 21px !important; }
              h3 { font-size: 18px !important; }
              h4, h5, h6 { font-size: 17px !important; }
            `;
            doc.head.appendChild(style);
            doc.querySelectorAll('a[href]').forEach(a => { a.target = '_blank'; });
            const h = doc.documentElement.scrollHeight;
            if (h && h > 100) iframe.style.height = h + 'px';
          }
        } catch {}
      });
    } catch {
      screen.querySelector('#html-page-body').innerHTML =
        `<div style="text-align:center;color:var(--text-muted);padding:48px;">שגיאה בטעינה</div>`;
    }
  }

  // ── Shop (menu_type 2) ────────────────────────────────────────────────────
  function openShopScreen(title) {
    const screen = document.createElement('div');
    screen.className = 'menu-page-screen';
    screen.innerHTML = `
      <div class="menu-page-header">
        <button class="btn-icon" id="shop-back-btn">✕</button>
        <div class="menu-page-title">${escHtml(title || 'חנות')}</div>
        <div style="width:40px;"></div>
      </div>
      <div class="menu-page-body" id="shop-page-body"></div>
    `;
    document.body.appendChild(screen);
    screen.querySelector('#shop-back-btn').addEventListener('click', () => screen.remove());
    loadShopProducts(screen, 0);
  }

  async function loadShopProducts(screen, offset) {
    const body = screen.querySelector('#shop-page-body');
    if (offset === 0) {
      body.innerHTML = `<div style="display:flex;justify-content:center;padding:60px 0;"><div class="spinner" style="border-color:rgba(0,0,0,0.1);border-top-color:var(--primary);"></div></div>`;
    }
    try {
      const res      = await API.getProductList(offset);
      const products = res?.data?.list || [];
      const baseUrl  = (res?.base_url || '') + (res?.image_url || '');
      if (offset === 0) body.innerHTML = '';
      if (products.length === 0 && offset === 0) {
        body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:48px;">אין מוצרים זמינים</div>`;
        return;
      }
      products.forEach(product => {
        const imgUrl = product.img_name ? baseUrl + product.img_name : '';
        const el = document.createElement('div');
        el.className = 'shop-product-item';
        el.innerHTML = `
          ${imgUrl ? `<img class="shop-product-img" src="${escAttr(imgUrl)}" onerror="this.style.display='none';">` : ''}
          <div class="shop-product-body">
            <div class="shop-product-title">${escHtml(product.title || '')}</div>
            ${product.description ? `<div class="shop-product-desc">${escHtml(product.description)}</div>` : ''}
            ${product.amount ? `<div class="shop-product-price">₪${escHtml(product.amount)}</div>` : ''}
            ${product.url ? `<a class="shop-product-btn" href="${escAttr(product.url)}" target="_blank">לרכישה</a>` : ''}
          </div>
        `;
        body.appendChild(el);
      });
      body.querySelector('.shop-load-more')?.remove();
      if (products.length >= 10) {
        const moreBtn = document.createElement('button');
        moreBtn.className = 'btn btn-outline shop-load-more';
        moreBtn.style.cssText = 'width:calc(100% - 32px);margin:16px;display:block;';
        moreBtn.textContent = 'טען עוד';
        moreBtn.addEventListener('click', () => { moreBtn.remove(); loadShopProducts(screen, offset + 10); });
        body.appendChild(moreBtn);
      }
    } catch {
      if (offset === 0) body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:48px;">שגיאה בטעינה</div>`;
    }
  }

  // ── Guide Booking (menu_type 11) ──────────────────────────────────────────
  function openGuideBookingScreen(title) {
    const screen = document.createElement('div');
    screen.className = 'menu-page-screen';
    screen.innerHTML = `
      <div class="menu-page-header">
        <button class="btn-icon" id="guide-back-btn">✕</button>
        <div class="menu-page-title">${escHtml(title || 'שיחה אישית')}</div>
        <div style="width:40px;"></div>
      </div>
      <div class="menu-page-body" id="guide-page-body"></div>
    `;
    document.body.appendChild(screen);
    screen.querySelector('#guide-back-btn').addEventListener('click', () => screen.remove());
    loadGuideList(screen);
  }

  async function loadGuideList(screen) {
    const body = screen.querySelector('#guide-page-body');
    body.innerHTML = `<div style="display:flex;justify-content:center;padding:60px 0;"><div class="spinner" style="border-color:rgba(0,0,0,0.1);border-top-color:var(--primary);"></div></div>`;
    try {
      const res    = await API.getGuideList(0);
      const guides = res?.data?.list || res?.list || [];
      if (guides.length === 0) {
        body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:48px;">אין מדריכים זמינים</div>`;
        return;
      }
      body.innerHTML = `<div style="padding:12px 16px 8px;color:var(--text-muted);font-size:14px;">בחר/י מדריך/ה לקביעת שיחה אישית</div>`;
      guides.forEach(guide => {
        const hasBooking = guide.active_booking === '1' || guide.active_booking === 1;
        const el = document.createElement('div');
        el.className = 'guide-item' + (hasBooking ? ' has-booking' : '');
        el.innerHTML = `
          <div class="guide-item-name">${escHtml(guide.name || '')}</div>
          ${hasBooking ? `
            <div class="guide-item-booking">שיחה קיימת: ${escHtml(guide.active_booking_date || '')} ${escHtml(guide.active_times || '')}</div>
            <button class="guide-cancel-btn" data-booking-id="${escAttr(guide.active_booking_id || '')}">ביטול שיחה</button>
          ` : ''}
        `;
        if (!hasBooking) {
          el.addEventListener('click', () => loadGuideDates(screen, guide));
        } else {
          el.querySelector('.guide-cancel-btn').addEventListener('click', e => {
            e.stopPropagation();
            confirmCancelGuideBook(screen, guide, e.currentTarget.dataset.bookingId);
          });
        }
        body.appendChild(el);
      });
    } catch {
      body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:48px;">שגיאה בטעינה</div>`;
    }
  }

  async function loadGuideDates(screen, guide) {
    const body = screen.querySelector('#guide-page-body');
    body.innerHTML = `<div style="display:flex;justify-content:center;padding:60px 0;"><div class="spinner" style="border-color:rgba(0,0,0,0.1);border-top-color:var(--primary);"></div></div>`;
    try {
      const res   = await API.getGuideDetail(guide.id);
      const dates = res?.data?.booking_days || res?.booking_days || [];
      body.innerHTML = `
        <div class="guide-dates-header">
          <button class="btn-icon guide-dates-back" style="color:var(--text);font-size:20px;">←</button>
          <div style="font-weight:700;font-size:16px;">${escHtml(guide.name || '')}</div>
        </div>
        <div style="padding:10px 16px 6px;color:var(--text-muted);font-size:13px;">בחר/י תאריך לשיחה</div>
        <div id="guide-dates-list"></div>
      `;
      body.querySelector('.guide-dates-back').addEventListener('click', () => loadGuideList(screen));
      const list = body.querySelector('#guide-dates-list');
      if (dates.length === 0) {
        list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px;">אין תאריכים זמינים</div>`;
        return;
      }
      dates.forEach(slot => {
        const available = (slot.status === '1' || slot.status === 1) &&
                          Number(slot.booked_count || 0) < Number(slot.maximum_booking || 99);
        const el = document.createElement('div');
        el.className = 'guide-date-item' + (available ? '' : ' disabled');
        el.innerHTML = `
          <div class="guide-date-day">${escHtml(slot.label || '')}</div>
          <div class="guide-date-info">
            <div class="guide-date-date">${escHtml(slot.date || '')}</div>
            <div class="guide-date-time">${escHtml(slot.open_time || '')} – ${escHtml(slot.close_time || '')}</div>
          </div>
          ${!available ? '<div class="guide-date-full">מלא</div>' : ''}
        `;
        if (available) el.addEventListener('click', () => confirmGuideBook(screen, guide, slot));
        list.appendChild(el);
      });
    } catch {
      body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:48px;">שגיאה בטעינה</div>`;
    }
  }

  function confirmGuideBook(screen, guide, slot) {
    const overlay = document.createElement('div');
    overlay.className = 'guide-confirm-overlay';
    overlay.innerHTML = `
      <div class="guide-confirm-card">
        <div style="font-size:36px;margin-bottom:10px;">📅</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:6px;">אישור קביעת שיחה</div>
        <div style="font-size:14px;color:var(--text-muted);margin-bottom:4px;">${escHtml(guide.name || '')}</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:2px;">${escHtml(slot.label || '')} ${escHtml(slot.date || '')}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">${escHtml(slot.open_time || '')} – ${escHtml(slot.close_time || '')}</div>
        <div id="guide-confirm-err" style="color:#e53e3e;font-size:13px;margin-bottom:8px;min-height:18px;"></div>
        <div style="display:flex;gap:10px;">
          <button id="guide-confirm-yes" class="btn btn-primary" style="flex:1;">אישור</button>
          <button id="guide-confirm-no"  class="btn" style="flex:1;background:var(--surface);">ביטול</button>
        </div>
      </div>
    `;
    screen.appendChild(overlay);
    overlay.querySelector('#guide-confirm-no').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#guide-confirm-yes').addEventListener('click', async () => {
      const btn = overlay.querySelector('#guide-confirm-yes');
      btn.disabled = true; btn.textContent = '...';
      try {
        const res = await API.addGuideBook(guide.id, slot.date, slot.booking_date_id);
        if (res && (res.status === '1' || res.status === 1)) {
          overlay.remove();
          showGuideBookSuccess(screen, guide, slot, res);
        } else {
          btn.disabled = false; btn.textContent = 'אישור';
          overlay.querySelector('#guide-confirm-err').textContent = res?.msg || 'שגיאה בקביעת השיחה, נסה/י שוב';
        }
      } catch (e) {
        btn.disabled = false; btn.textContent = 'אישור';
        overlay.querySelector('#guide-confirm-err').textContent = 'שגיאה בקביעת השיחה, נסה/י שוב';
        console.error('AddGuideBook error:', e);
      }
    });
  }

  function formatBookingDate(dateStr) {
    if (!dateStr) return '';
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return dateStr;
    return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
  }

  function showGuideBookSuccess(screen, guide, slot, res) {
    const body      = screen.querySelector('#guide-page-body');
    const config    = res?.data?.config || {};
    const emailOk = (config.guide_email_status?.status === '1' || config.guide_email_status?.status === 1) &&
                     (config.user_email_status?.status  === '1' || config.user_email_status?.status  === 1);
    if (!emailOk) console.warn('[AddGuideBook] email send failed:', config);
    const phone     = res?.data?.user_phone_code && res?.data?.user_phone_number
      ? `+${res.data.user_phone_code} ${res.data.user_phone_number}` : '';
    const bookingId = res?.data?.booking_id;
    const fmtDate   = formatBookingDate(slot.date || '');

    body.innerHTML = `
      <div style="padding:28px 24px;direction:rtl;text-align:right;line-height:1.9;">
        <div style="font-size:18px;font-weight:700;color:var(--primary);margin-bottom:20px;text-align:center;">
          תיאום שיחה עם ${escHtml(guide.name || '')}
        </div>
        <div style="font-size:15px;margin-bottom:16px;">
          השיחה עם <strong>${escHtml(guide.name || '')}</strong> נקבעה לתאריך
          <strong>${escHtml(fmtDate)}</strong> בין השעות
          <strong>${escHtml(slot.open_time || '')} - ${escHtml(slot.close_time || '')}</strong>
        </div>
        <div style="font-size:14px;color:var(--text-muted);margin-bottom:16px;">
          עליך להיות זמין/ה לקבלת שיחה טלפונית מהמדריך/ה בשעה היעודה, אם לא ניתן יהיה ליצור איתך קשר, השיחה המתוכננת לא תתקיים.
        </div>
        ${phone ? `<div style="font-size:15px;margin-bottom:16px;">
          מספר הטלפון אליו תתבצע השיחה:<br>
          <strong style="direction:ltr;display:inline-block;font-size:16px;">${escHtml(phone)}</strong>
        </div>` : ''}
        <div style="display:flex;gap:12px;margin-top:24px;">
          ${bookingId ? `<button id="booking-cancel-btn" class="btn" style="flex:1;background:none;border:1.5px solid var(--danger);color:var(--danger);font-weight:600;border-radius:var(--radius);">ביטול</button>` : ''}
          <button id="guide-done-btn" class="btn btn-primary" style="flex:1;">סגור</button>
        </div>
      </div>
    `;

    body.querySelector('#guide-done-btn').addEventListener('click', () => screen.remove());

    if (bookingId) {
      body.querySelector('#booking-cancel-btn').addEventListener('click', () => {
        const overlay = document.createElement('div');
        overlay.className = 'guide-confirm-overlay';
        overlay.innerHTML = `
          <div class="guide-confirm-card">
            <div style="font-size:16px;font-weight:700;margin-bottom:10px;">ביטול שיחה</div>
            <div style="font-size:14px;color:var(--text-muted);margin-bottom:20px;">האם אתה בטוח שברצונך לבטל את השיחה?</div>
            <div id="cancel-err" style="color:#e53e3e;font-size:13px;margin-bottom:8px;min-height:18px;"></div>
            <div style="display:flex;gap:10px;">
              <button id="cancel-yes" class="btn" style="flex:1;background:var(--danger);color:#fff;">כן</button>
              <button id="cancel-no"  class="btn" style="flex:1;background:var(--surface);">לא</button>
            </div>
          </div>
        `;
        screen.appendChild(overlay);
        overlay.querySelector('#cancel-no').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#cancel-yes').addEventListener('click', async () => {
          const btn = overlay.querySelector('#cancel-yes');
          btn.disabled = true; btn.textContent = '...';
          try {
            await API.cancelGuideBook(bookingId);
            screen.remove();
          } catch {
            btn.disabled = false; btn.textContent = 'כן';
            overlay.querySelector('#cancel-err').textContent = 'שגיאה בביטול, נסה/י שוב';
          }
        });
      });
    }
  }

  function confirmCancelGuideBook(screen, guide, bookingId) {
    const overlay = document.createElement('div');
    overlay.className = 'guide-confirm-overlay';
    overlay.innerHTML = `
      <div class="guide-confirm-card">
        <div style="font-size:36px;margin-bottom:10px;">🗓️</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:8px;">ביטול שיחה</div>
        <div style="font-size:14px;color:var(--text-muted);margin-bottom:6px;">${escHtml(guide.name || '')}</div>
        <div style="font-size:14px;color:var(--text-muted);margin-bottom:20px;">${escHtml(guide.active_booking_date || '')} ${escHtml(guide.active_times || '')}</div>
        <div id="cancel-confirm-err" style="color:#e53e3e;font-size:13px;margin-bottom:8px;min-height:18px;"></div>
        <div style="display:flex;gap:10px;">
          <button id="cancel-confirm-yes" class="btn" style="flex:1;background:var(--danger);color:#fff;">ביטול שיחה</button>
          <button id="cancel-confirm-no"  class="btn" style="flex:1;background:var(--surface);">חזרה</button>
        </div>
      </div>
    `;
    screen.appendChild(overlay);
    overlay.querySelector('#cancel-confirm-no').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#cancel-confirm-yes').addEventListener('click', async () => {
      const btn = overlay.querySelector('#cancel-confirm-yes');
      btn.disabled = true; btn.textContent = '...';
      try {
        const res = await API.cancelGuideBook(bookingId);
        overlay.remove();
        if (res && (res.status === '1' || res.status === 1)) {
          loadGuideList(screen);
        } else {
          loadGuideList(screen);
        }
      } catch (e) {
        btn.disabled = false; btn.textContent = 'ביטול שיחה';
        overlay.querySelector('#cancel-confirm-err').textContent = 'שגיאה בביטול, נסה/י שוב';
        console.error('CancelGuideBooking error:', e);
      }
    });
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
      await refreshHeaderAvatar();
    });

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  function stripHtml(html) {
    const t = document.createElement('div');
    t.innerHTML = html;
    return t.textContent || '';
  }

  function stripHtmlAndStyle(html) {
    const t = document.createElement('div');
    t.innerHTML = html;
    t.querySelectorAll('style, script, head').forEach(el => el.remove());
    return (t.textContent || '').trim();
  }

  function decodeUnicode(str) {
    if (!str) return '';
    return String(str).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }

  boot();
})();
