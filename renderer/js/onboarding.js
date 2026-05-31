// Mandatory onboarding for new users — must complete the profile (name, email,
// gender), pick a community manager and a daily-message time before entering the app.
// Photo is optional. Returns a Promise that resolves once everything is saved.
const Onboarding = (() => {

  function run() {
    return new Promise((resolve) => { build(resolve); });
  }

  async function build(resolve) {
    const old = document.getElementById('onboarding-screen');
    if (old) old.remove();

    const screen = document.createElement('div');
    screen.id = 'onboarding-screen';
    screen.className = 'onboarding-screen';
    screen.innerHTML = `
      <div class="onboarding-card">
        <img class="onboarding-logo" src="images/logo-diuk.png" alt="דיוק">
        <div class="onboarding-title">השלמת הרשמה</div>
        <div class="onboarding-sub">כדי להתחיל, יש למלא את הפרטים</div>

        <div class="onboarding-avatar-wrap" id="ob-avatar-wrap" title="הוסף תמונה (לא חובה)">
          <img id="ob-avatar-img" alt="">
          <div id="ob-avatar-init">📷</div>
        </div>
        <input type="file" id="ob-img-input" accept="image/*" style="display:none;">

        <div class="ob-field">
          <label class="input-label">שם מלא *</label>
          <input id="ob-name" class="input-field" type="text" placeholder="השם שלך" maxlength="60">
        </div>
        <div class="ob-field">
          <label class="input-label">אימייל *</label>
          <input id="ob-email" class="input-field" type="email" placeholder="name@example.com" style="direction:ltr;text-align:left;">
        </div>
        <div class="ob-field">
          <label class="input-label">מין *</label>
          <div style="display:flex;gap:10px;">
            <button type="button" class="gender-btn" data-gender="male">זכר</button>
            <button type="button" class="gender-btn" data-gender="female">נקבה</button>
          </div>
        </div>
        <div class="ob-field">
          <label class="input-label">מנהל קהילה *</label>
          <select id="ob-manager" class="input-field"><option value="">בחר/י...</option></select>
        </div>
        <div class="ob-field">
          <label class="input-label">שעה לקבלת מסר יומי *</label>
          <select id="ob-time" class="input-field"><option value="">בחר/י...</option></select>
        </div>

        <div id="ob-error" class="error-msg" style="display:none"></div>
        <button id="ob-submit" class="btn btn-primary btn-full">סיום וכניסה</button>
      </div>`;
    document.body.appendChild(screen);

    const sel = (s) => screen.querySelector(s);
    let pendingImage = null;
    let selectedGender = await Store.get('user_gender', '');

    // ── populate manager + time pickers ──
    try {
      const res  = await API.getCommunityManagers();
      const data = (res && res.data) || res || {};
      const managers = data.community_managers || [];
      const times    = data.daily_msg_assign_time_list || [];
      const mSel = sel('#ob-manager'), tSel = sel('#ob-time');
      managers.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = decodeUnicode(m.name || ''); mSel.appendChild(o); });
      times.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.label || ''; tSel.appendChild(o); });
    } catch (e) { console.error('onboarding managers:', e); }

    // ── prefill from store (existing-but-fresh user) ──
    const name  = await Store.getUserName();        if (name)  sel('#ob-name').value  = name;
    const email = await Store.get('user_email', ''); if (email) sel('#ob-email').value = email;

    screen.querySelectorAll('.gender-btn').forEach(b => {
      if (b.dataset.gender === selectedGender) b.classList.add('active');
      b.addEventListener('click', () => {
        selectedGender = b.dataset.gender;
        screen.querySelectorAll('.gender-btn').forEach(x => x.classList.toggle('active', x === b));
      });
    });

    // ── optional photo ──
    sel('#ob-avatar-wrap').addEventListener('click', () => sel('#ob-img-input').click());
    sel('#ob-img-input').addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const tmp = new Image();
        tmp.onload = () => {
          const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S;
          const ctx = c.getContext('2d'); const mn = Math.min(tmp.width, tmp.height);
          ctx.drawImage(tmp, (tmp.width - mn) / 2, (tmp.height - mn) / 2, mn, mn, 0, 0, S, S);
          pendingImage = c.toDataURL('image/jpeg', 0.85);
          const im = sel('#ob-avatar-img'), ini = sel('#ob-avatar-init');
          im.src = pendingImage; im.style.display = 'block'; ini.style.display = 'none';
        };
        tmp.onerror = () => { pendingImage = ev.target.result; };
        tmp.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    // ── submit ──
    sel('#ob-submit').addEventListener('click', async () => {
      const nm  = sel('#ob-name').value.trim();
      const em  = sel('#ob-email').value.trim();
      const mgr = sel('#ob-manager').value;
      const tm  = sel('#ob-time').value;
      const err = sel('#ob-error');
      const fail = (m) => { err.textContent = m; err.style.display = 'block'; };

      if (!nm) return fail('נא למלא שם מלא');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return fail('נא למלא כתובת אימייל תקינה');
      if (!selectedGender) return fail('נא לבחור מין');
      if (!mgr) return fail('נא לבחור מנהל קהילה');
      if (!tm)  return fail('נא לבחור שעה לקבלת מסר יומי');
      err.style.display = 'none';

      const btn = sel('#ob-submit'); btn.disabled = true; btn.textContent = 'שומר...';
      try {
        const fields = {
          name: nm, email: em,
          sex: selectedGender === 'female' ? 'F' : 'M',
          community_manager_id:    String(mgr),
          daily_msg_assign_time_id: String(tm),
        };
        // upload the photo (multipart) so it persists server-side, like the profile screen
        const res = pendingImage
          ? await API.updateProfileWithImage(fields, (pendingImage.split(',')[1] || ''), 'profile.jpg')
          : await API.updateProfile(fields);
        await Store.set('user_name', nm);
        await Store.set('user_email', em);
        await Store.set('user_gender', selectedGender);
        await Store.set('settings_community_manager_id', String(mgr));
        await Store.set('settings_daily_time_id', String(tm));
        const profile = res && res.data && res.data.profile;
        const imgFile = profile && profile.profile_image;
        if (imgFile) {
          const full = imgFile.startsWith('http') ? imgFile : (res.base_url || '') + (res.profile_image_url || '') + imgFile;
          await Store.set('profile_image_url', full);
          await Store.set('profile_image', imgFile);
        } else if (pendingImage) {
          await Store.set('profile_image_url', pendingImage); // fallback to local preview
        }
        screen.remove();
        resolve();
      } catch (e) {
        console.error('onboarding save:', e);
        btn.disabled = false; btn.textContent = 'סיום וכניסה';
        fail('שגיאה בשמירה. בדוק חיבור לאינטרנט ונסה שוב.');
      }
    });
  }

  function decodeUnicode(str) {
    if (!str) return '';
    return String(str).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }

  return { run };
})();

window.Onboarding = Onboarding;
