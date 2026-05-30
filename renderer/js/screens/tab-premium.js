// Tab 5 — מנויים (GetBundleSubscription)
const TabPremium = (() => {

  const CARD_IMAGES = [
    'images/ic_tab_5_card1.png',
    'images/ic_tab_5_card2.png',
    'images/ic_tab_5_card3.png',
    'images/ic_tab_5_card4.png',
  ];

  // WooCommerce product URLs per subscription category ID
  // Key = category id from GetSubscriptionCategory, value = { monthly, yearly }
  const REGISTER_URLS = {
    '18': { // פרשת השבוע — monthly WC #10035, yearly WC #10043
      monthly: 'https://hacara.org.il/product/%d7%9e%d7%a0%d7%95%d7%99-%d7%97%d7%95%d7%93%d7%a9%d7%99-%d7%9c%d7%a4%d7%a8%d7%a9%d7%aa-%d7%94%d7%a9%d7%91%d7%95%d7%a2-%d7%91%d7%90%d7%a4%d7%9c%d7%99%d7%a7%d7%a6%d7%99%d7%99%d7%aa-%d7%93%d7%99%d7%95/',
      yearly:  'https://hacara.org.il/product/diuk-parashat-yearly/',
    },
    '19': { // שיעור בשניים — WC #10045 / #10047
      monthly: 'https://hacara.org.il/product/diuk-shiur-bishnaim-monthly/',
      yearly:  'https://hacara.org.il/product/diuk-shiur-bishnaim-yearly/',
    },
    '20': { // עידית שלו - שיעורים — WC #10049 / #10051
      monthly: 'https://hacara.org.il/product/diuk-idit-shelo-monthly/',
      yearly:  'https://hacara.org.il/product/diuk-idit-shelo-yearly/',
    },
    '21': { // שער הזמנים — WC #10053 / #10055
      monthly: 'https://hacara.org.il/product/diuk-shaar-hazmanim-monthly/',
      yearly:  'https://hacara.org.il/product/diuk-shaar-hazmanim-yearly/',
    },
    '22': { // אילן הרן - שיעורים — WC #10057 / #10059
      monthly: 'https://hacara.org.il/product/diuk-ilan-haran-monthly/',
      yearly:  'https://hacara.org.il/product/diuk-ilan-haran-yearly/',
    },
    '23': { // חשיבה הכרתית — WC #10061 / #10063
      monthly: 'https://hacara.org.il/product/diuk-hashiva-hakaratit-monthly/',
      yearly:  'https://hacara.org.il/product/diuk-hashiva-hakaratit-yearly/',
    },
  };

  // Price overrides for the מנויים cards — used when the actual WooCommerce charge differs
  // from the diuk backend's android_product_id_*_price (which the Android app also reads).
  // Keyed by category id; keeps the backend/Android display untouched.
  const PRICE_OVERRIDE = {
    '23': { monthly: '40', yearly: '400' }, // חשיבה הכרתית — WC charges ₪40 / ₪400
  };

  async function render(container) {
    container.innerHTML = `
      <div id="premium-scroll" style="height:100%;overflow-y:auto;">
        <div class="list-header">מנויים</div>
        <div id="premium-items-section" class="content-list">
          ${Array(4).fill('<div class="skeleton skeleton-card" style="height:140px;"></div>').join('')}
        </div>
        <div class="list-header" style="margin-top:8px;">חבילות</div>
        <div id="premium-bundles-section" class="content-list"></div>
      </div>
    `;
    await load(container);
  }

  async function load(container) {
    try {
      const [catRes, bundleRes, statusRes] = await Promise.all([
        API.getSubscriptionCategory(),
        API.getBundleSubscription(),
        API.getMySubscriptionsStatus(),
      ]);

      const categories = (catRes?.data?.list || []).filter(s => s.category_status === '1' || s.category_status === 1);
      const bundles    = bundleRes?.data?.list || (Array.isArray(bundleRes?.data) ? bundleRes.data : []);
      const catBaseUrl = (catRes?.base_url || '') + (catRes?.image_url || '');

      // map subscription_cat_id -> remaining_days (for expiry reminders)
      const remainingByCat = {};
      (statusRes?.data?.list || []).forEach(s => {
        remainingByCat[String(s.subscription_cat_id)] = Number(s.remaining_days);
      });

      renderIndividualItems(container, categories, catBaseUrl, remainingByCat);
      renderBundles(container, bundles, categories);

    } catch (err) {
      console.error('loadPremium:', err);
      const sec = container.querySelector('#premium-items-section');
      if (sec) sec.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">שגיאה בטעינה</div></div>`;
    }
  }

  function extractUniqueItems(bundles) {
    const seen  = new Set();
    const items = [];
    bundles.forEach(bundle => {
      let bi = bundle.items;
      try { if (typeof bi === 'string') bi = JSON.parse(bi); } catch {}
      if (!Array.isArray(bi)) return;
      bi.forEach(item => {
        const key = (item.title || '').trim();
        if (key && !seen.has(key)) { seen.add(key); items.push(item); }
      });
    });
    return items;
  }

  function renderIndividualItems(container, categories, baseUrl, remainingByCat) {
    remainingByCat = remainingByCat || {};
    const sec = container.querySelector('#premium-items-section');
    if (!sec) return;
    sec.innerHTML = '';

    if (categories.length === 0) {
      sec.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⭐</div><div class="empty-state-title">אין מנויים זמינים</div></div>`;
      return;
    }

    categories.forEach((cat, idx) => {
      const card       = document.createElement('div');
      card.className   = 'premium-single-card';
      const title      = decodeUnicode(cat.title || '');
      const ov         = PRICE_OVERRIDE[String(cat.id)] || {};
      const priceMonth = ov.monthly || cat.android_product_id_monthly_price || '';
      const priceYear  = ov.yearly  || cat.android_product_id_yearly_price  || '';
      const imgSrc     = cat.image_url
        ? (cat.image_url.startsWith('http') ? cat.image_url : baseUrl + cat.image_url)
        : CARD_IMAGES[idx % 4];
      const isSubscribed = cat.active_subscription === '1' || cat.active_subscription === 1;
      const remaining    = remainingByCat[String(cat.id)];
      const expiringSoon = isSubscribed && remaining != null && remaining <= 7;

      let statusLine;
      if (isSubscribed && expiringSoon) {
        const daysTxt = remaining <= 1 ? 'מחר' : `בעוד ${remaining} ימים`;
        statusLine = `<div style="font-size:14px;font-weight:700;color:var(--danger);margin-top:6px;">⏰ המנוי יפוג ${escHtml(daysTxt)}</div>`;
      } else if (isSubscribed) {
        statusLine = `<div style="font-size:14px;font-weight:700;color:var(--success);margin-top:6px;">✓ מנוי פעיל</div>`;
      } else {
        statusLine = `<div style="font-size:14px;font-weight:700;color:#000;margin-top:6px;">לפתיחת המנוי יש להירשם</div>`;
      }

      const actionsHtml = isSubscribed
        ? `<button class="premium-video-btn">▶ סרטון דוגמא</button>
           <button class="premium-enter-btn">כניסה</button>
           ${expiringSoon ? `<button class="premium-renew-btn">חידוש המנוי</button>` : ''}`
        : `<button class="premium-video-btn">▶ סרטון דוגמא</button>
           <button class="premium-register-btn premium-register-month">הרשמה לחודש</button>
           <button class="premium-register-btn premium-register-year">הרשמה לשנה</button>`;

      card.innerHTML = `
        <img class="premium-single-img" src="${escAttr(imgSrc)}" alt="" onerror="this.src='${CARD_IMAGES[idx % 4]}'">
        <div class="premium-single-body">
          <div class="premium-single-title">${escHtml(title)}</div>
          <div class="premium-single-prices">
            ${priceMonth ? `<span class="premium-single-price">₪${escHtml(String(priceMonth))} / חודש</span>` : ''}
            ${priceYear  ? `<span class="premium-single-price-year">₪${escHtml(String(priceYear))} / שנה</span>` : ''}
          </div>
          ${statusLine}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
          ${actionsHtml}
        </div>
      `;

      card.querySelector('.premium-video-btn').addEventListener('click', e => {
        e.stopPropagation();
        openFreeVideo(cat.id || '', title, container);
      });

      async function openRegisterUrl(url) {
        const uid = await Store.getUserId();
        const sep = url.includes('?') ? '&' : '?';
        window.open(`${url}${sep}diuk_uid=${encodeURIComponent(uid || '')}`);
      }

      if (isSubscribed) {
        card.querySelector('.premium-enter-btn').addEventListener('click', e => {
          e.stopPropagation();
          openSubscriptionContent(cat.id || '', title);
        });
        const renewBtn = card.querySelector('.premium-renew-btn');
        if (renewBtn) {
          const renewUrl = (REGISTER_URLS[String(cat.id)] || {}).monthly;
          if (renewUrl) {
            renewBtn.addEventListener('click', e => { e.stopPropagation(); openRegisterUrl(renewUrl); });
          } else {
            renewBtn.disabled = true; renewBtn.style.opacity = '0.4';
          }
        }
      } else {
        const urls = REGISTER_URLS[String(cat.id)] || {};
        const monthBtn = card.querySelector('.premium-register-month');
        const yearBtn  = card.querySelector('.premium-register-year');

        if (urls.monthly) {
          monthBtn.addEventListener('click', e => { e.stopPropagation(); openRegisterUrl(urls.monthly); });
        } else {
          monthBtn.disabled = true; monthBtn.style.opacity = '0.4';
        }
        if (urls.yearly) {
          yearBtn.addEventListener('click', e => { e.stopPropagation(); openRegisterUrl(urls.yearly); });
        } else {
          yearBtn.disabled = true; yearBtn.style.opacity = '0.4';
        }
      }

      sec.appendChild(card);
    });
  }

  function renderBundles(container, bundles, categories) {
    const sec = container.querySelector('#premium-bundles-section');
    if (!sec) return;
    sec.innerHTML = '';

    bundles.forEach(bundle => {
      const title      = decodeUnicode(bundle.title || '');
      const desc       = decodeUnicode(bundle.description || '');
      const priceMonth = bundle.android_product_id_monthly_price || '';
      const priceYear  = bundle.android_product_id_yearly_price  || '';
      const isSubbed   = bundle.is_subscribed === '1' || bundle.is_subscribed === 1;

      let items = bundle.items;
      try { if (typeof items === 'string') items = JSON.parse(items); } catch {}
      if (!Array.isArray(items)) items = [];

      const card = document.createElement('div');
      card.className = 'premium-bundle-card';

      const itemsRow = items.map((it, itIdx) => {
        const itTitle = decodeUnicode(it.title || '');
        const catMatch = categories.find(c => decodeUnicode(c.title || '').trim() === itTitle.trim());
        const imgSrc   = (catMatch?.image_url && catMatch.image_url.startsWith('http'))
          ? catMatch.image_url
          : CARD_IMAGES[itIdx % 4];
        return `<div class="premium-item-card">
          <img src="${escAttr(imgSrc)}" class="premium-item-img" alt="" onerror="this.src='${CARD_IMAGES[itIdx % 4]}'">
          <div class="premium-item-title">${escHtml(itTitle)}</div>
        </div>`;
      }).join('');

      card.innerHTML = `
        <div class="premium-bundle-header">
          <div class="premium-bundle-title">${escHtml(title)}</div>
          ${isSubbed ? `<span class="premium-badge-active">פעיל</span>` : ''}
        </div>
        ${desc ? `<div class="premium-bundle-desc">${escHtml(desc)}</div>` : ''}
        ${itemsRow ? `<div class="premium-items-row">${itemsRow}</div>` : ''}
        <div class="premium-bundle-prices">
          ${priceMonth ? `<div class="premium-price-box"><div class="premium-price-label">חודשי</div><div class="premium-price-value">₪${escHtml(priceMonth)}</div></div>` : ''}
          ${priceYear  ? `<div class="premium-price-box"><div class="premium-price-label">שנתי</div><div class="premium-price-value">₪${escHtml(priceYear)}</div></div>`  : ''}
        </div>
      `;
      sec.appendChild(card);
    });
  }

  async function openFreeVideo(catId, title, container) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:680px;width:100%;overflow:hidden;box-shadow:var(--shadow-lg);">
        <div style="background:var(--primary);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:16px;font-weight:700;color:#fff;">${escHtml(title)}</div>
          <button id="vid-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;">✕</button>
        </div>
        <div id="vid-body" style="padding:24px;min-height:120px;display:flex;align-items:center;justify-content:center;">
          <div class="spinner" style="border-color:rgba(0,0,0,0.1);border-top-color:var(--primary);"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#vid-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const body = overlay.querySelector('#vid-body');
    try {
      const res      = await API.getSubscriptionFreeContent(catId);
      const freeMsg  = res?.data?.free_msg || {};
      const videoUrl = freeMsg.video_url || freeMsg.daily_msg_video_url || '';

      if (videoUrl) {
        const safeUrl = (() => { try { return encodeURI(decodeURI(videoUrl)); } catch { return videoUrl; } })();
        body.innerHTML = `<video controls autoplay style="display:block;width:100%;max-height:70vh;object-fit:contain;background:#000;border-radius:8px;" src="${escAttr(safeUrl)}"></video>`;
      } else if (freeMsg.description) {
        const srcDoc = `<!DOCTYPE html><html><head><base href="https://app.diuk.co.il/app/"><meta charset="utf-8"></head><body style="direction:rtl;padding:16px;">${freeMsg.description}</body></html>`;
        body.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;min-height:300px;border:none;';
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
        body.appendChild(iframe);
        iframe.srcdoc = srcDoc;
      } else {
        body.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:20px;">אין תוכן זמין עבור מנוי זה</div>`;
      }
    } catch(e) {
      console.error('[Premium] openFreeVideo error:', e);
      body.innerHTML = `<div style="color:var(--text-muted);text-align:center;">שגיאה בטעינת הסרטון</div>`;
    }
  }

  // Full content viewer for a subscribed category (כניסה).
  // Uses GetSubscriptionContent1 -> data.list (full items, chronological; last = current week).
  async function openSubscriptionContent(catId, title) {
    const screen = document.createElement('div');
    screen.className = 'menu-page-screen';
    screen.innerHTML = `
      <div class="menu-page-header">
        <button class="btn-icon" id="subc-back">✕</button>
        <div class="menu-page-title">${escHtml(title)}</div>
        <div style="width:40px;"></div>
      </div>
      <div class="menu-page-body" id="subc-body">
        <div style="display:flex;justify-content:center;padding:60px 0;">
          <div class="spinner" style="border-color:rgba(0,0,0,0.1);border-top-color:var(--primary);"></div>
        </div>
      </div>
    `;
    document.body.appendChild(screen);
    screen.querySelector('#subc-back').addEventListener('click', () => screen.remove());

    const body = screen.querySelector('#subc-body');
    try {
      const res   = await API.getSubscriptionFreeContent(catId); // = GetSubscriptionContent1
      let items   = res?.data?.list || [];
      // fall back to the single free_msg if list is empty
      if (items.length === 0 && res?.data?.free_msg) items = [res.data.free_msg];

      if (items.length === 0) {
        body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:48px;">אין תוכן זמין</div>`;
        return;
      }

      // current week = last item in chronological list
      let currentIdx = items.length - 1;

      function renderItem(idx) {
        const item = items[idx];
        const itemTitle = decodeUnicode(item.title || '');
        const videoUrl  = item.video_url || '';
        const audioUrl  = item.audio_url || '';

        let media = '';
        if (videoUrl) {
          const safe = (() => { try { return encodeURI(decodeURI(videoUrl)); } catch { return videoUrl; } })();
          media += `<video controls style="display:block;width:100%;max-height:60vh;object-fit:contain;background:#000;border-radius:8px;margin:0 auto 14px;" src="${escAttr(safe)}"></video>`;
        }
        if (audioUrl) {
          const safe = (() => { try { return encodeURI(decodeURI(audioUrl)); } catch { return audioUrl; } })();
          media += `<audio controls style="width:100%;margin-bottom:14px;" src="${escAttr(safe)}"></audio>`;
        }

        // archive switcher (other items), newest first
        let archive = '';
        if (items.length > 1) {
          const others = items.map((it, i) => ({ it, i })).reverse();
          archive = `<div class="subc-archive">
            <div class="subc-archive-label">פרקים נוספים</div>
            ${others.map(({ it, i }) => `<button class="subc-archive-item${i === idx ? ' active' : ''}" data-idx="${i}">${escHtml(decodeUnicode(it.title || ''))}</button>`).join('')}
          </div>`;
        }

        body.innerHTML = `
          <div style="font-size:20px;font-weight:700;color:var(--primary);padding:6px 4px 14px;text-align:center;">${escHtml(itemTitle)}</div>
          ${media}
          <div id="subc-desc"></div>
          ${archive}
        `;

        // render HTML description in an iframe (like articles)
        if (item.description) {
          const srcDoc = `<!DOCTYPE html><html><head><base href="https://app.diuk.co.il/app/"><meta charset="utf-8"><style>body{font-size:16px;line-height:1.7;direction:rtl;padding:4px;}h1{font-size:24px}h2{font-size:21px}h3{font-size:18px}</style></head><body>${item.description}</body></html>`;
          const iframe = document.createElement('iframe');
          iframe.style.cssText = 'width:100%;min-height:300px;border:none;';
          iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups');
          body.querySelector('#subc-desc').appendChild(iframe);
          iframe.srcdoc = srcDoc;
          iframe.addEventListener('load', () => {
            try {
              const doc = iframe.contentDocument;
              doc.querySelectorAll('a[href]').forEach(a => { a.target = '_blank'; });
              const h = doc.documentElement.scrollHeight;
              if (h && h > 100) iframe.style.height = h + 'px';
            } catch {}
          });
        }

        body.querySelectorAll('.subc-archive-item').forEach(b => {
          b.addEventListener('click', () => renderItem(Number(b.dataset.idx)));
        });
      }

      renderItem(currentIdx);

    } catch (e) {
      console.error('[Premium] openSubscriptionContent:', e);
      body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:48px;">שגיאה בטעינה</div>`;
    }
  }

  function decodeUnicode(str) {
    if (!str) return '';
    return String(str).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }

  return { render };
})();
