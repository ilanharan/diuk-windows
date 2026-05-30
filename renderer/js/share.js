// Global share — tracks the currently displayed content and offers a share window.
// Screens call AppShare.setCurrent({type, id, title, desc}) when they show content;
// the header share button shares whatever is current (daily message, subscription
// content, quote, …). Channels: WhatsApp, Telegram, Email, Facebook, Copy link.

const AppShare = (() => {
  let _current = null;
  return {
    setCurrent(item) { _current = item || null; },
    clear()          { _current = null; },
    getCurrent()     { return _current; },
  };
})();

const ShareUI = (() => {

  // content-type -> deepLinkType (mid), matching the mobile app's deep-link parser:
  // 1 = daily message, 2 = quote (משפטי מפתח), 3 = subscription content
  const TYPE_TO_MID = { daily_msg: 1, quote: 2, content_msg: 3, survey: 3 };

  function deepLink(item) {
    const mid = TYPE_TO_MID[item.type] || 1;
    const id  = item.id != null ? item.id : '0';
    // Landing page (diuk-open) detects the platform: mobile → Firebase dynamic link
    // (opens the mobile app), desktop → diuk:// (opens the Windows app on this content).
    return `https://hacara.org.il/diuk-open/?mid=${mid}&dmsgid=${encodeURIComponent(id)}`;
  }

  function buildText(item, link) {
    const title = stripHtml(item.title || 'דיוק');
    return `${title}\n\nלצפייה בתוכן באפליקציית דיוק:\n${link}`;
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `
      position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.85);color:#fff;padding:12px 22px;border-radius:24px;
      font-size:14px;z-index:4000;box-shadow:0 4px 20px rgba(0,0,0,0.3);`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  async function copyLink(link) {
    try {
      await navigator.clipboard.writeText(link);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = link; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      ta.remove();
    }
    toast('הקישור הועתק ✓');
  }

  function channels(item, link, text) {
    const enc  = encodeURIComponent;
    const subj = stripHtml(item.title || 'דיוק');
    return [
      { label: 'וואטסאפ', icon: '🟢', go: () => window.open(`https://wa.me/?text=${enc(text)}`) },
      { label: 'טלגרם',   icon: '✈️', go: () => window.open(`https://t.me/share/url?url=${enc(link)}&text=${enc(subj)}`) },
      { label: 'Gmail',   icon: '📧', go: () => window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${enc(subj)}&body=${enc(text)}`) },
      { label: 'העתק קישור', icon: '🔗', go: () => copyLink(link) },
    ];
  }

  function open(item) {
    item = item || AppShare.getCurrent() || { type: 'app', id: '0', title: 'דיוק — חשיבה הכרתית' };
    const link = deepLink(item);
    const text = buildText(item, link);

    const existing = document.getElementById('share-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'share-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:3500;
      display:flex;align-items:center;justify-content:center;padding:20px;`;

    const opts = channels(item, link, text);
    const optsHtml = opts.map((c, i) => `
      <button class="share-opt" data-i="${i}">
        <span class="share-opt-icon">${c.icon}</span>
        <span class="share-opt-label">${escHtml(c.label)}</span>
      </button>`).join('');

    modal.innerHTML = `
      <div style="background:#fff;border-radius:18px;max-width:440px;width:100%;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.25);">
        <div style="background:var(--primary);padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:17px;font-weight:700;color:#fff;">שיתוף</div>
          <button id="share-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;">✕</button>
        </div>
        <div style="padding:18px 20px;direction:rtl;text-align:right;">
          <div style="font-size:14px;color:var(--text-muted);margin-bottom:14px;">${escHtml(stripHtml(item.title || 'דיוק'))}</div>
          <div class="share-grid">${optsHtml}</div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelector('#share-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelectorAll('.share-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = opts[parseInt(btn.dataset.i, 10)];
        c.go();
        if (c.label !== 'העתק קישור') modal.remove();
      });
    });
  }

  function stripHtml(html) {
    if (!html) return '';
    const t = document.createElement('div'); t.innerHTML = html;
    return (t.textContent || '').trim();
  }
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { open };
})();

// expose as window globals (top-level const is not attached to window)
window.AppShare = AppShare;
window.ShareUI  = ShareUI;
