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

    header.querySelector('#refresh-btn').addEventListener('click', () => {
      renderedTabs.delete(currentTab);
      const pane = document.getElementById(`tab-${currentTab}`);
      if (pane) pane.innerHTML = '';
      showTab(currentTab);
    });

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
        ${phone ? `<div class="profile-phone">+972${phone}</div>` : ''}
        <div class="profile-actions">
          <button class="profile-action-btn danger" id="logout-btn">יציאה</button>
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
        const count = res.data.badge_count || res.data.count || 0;
        const quotesBtn = document.querySelector('.tab-btn[data-tab="quotes"]');
        if (!quotesBtn) return;
        let badge = quotesBtn.querySelector('.tab-badge');
        if (count > 0) {
          if (!badge) {
            badge = document.createElement('div');
            badge.className = 'tab-badge';
            quotesBtn.style.position = 'relative';
            quotesBtn.appendChild(badge);
          }
          badge.textContent = count > 99 ? '99+' : count;
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
    showTab('daily');
    setTimeout(pollBadges, 2000);
    setInterval(pollBadges, 5 * 60 * 1000);
  }

  boot();
})();
