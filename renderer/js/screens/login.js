// Login screen — backend OTP (no Firebase reCAPTCHA needed in Electron)
const LoginScreen = (() => {
  let _onSuccess = null;
  let _phoneNumber = '';
  let _phoneCode = '972';

  function render(container, onSuccess) {
    _onSuccess = onSuccess;
    container.innerHTML = `
      <div class="login-screen">
        <div class="login-box">
          <div class="login-logo">
            <div class="login-logo-title">דיוק</div>
            <div class="login-logo-sub">חשיבה קוגניטיבית</div>
          </div>

          <!-- Step 1: Phone -->
          <div id="login-step-phone">
            <div class="login-title">כניסה למערכת</div>
            <div class="login-sub">הכנס מספר טלפון לקבלת קוד אימות</div>
            <div class="login-form">
              <div class="input-group">
                <label class="input-label">מספר טלפון</label>
                <div class="input-row">
                  <div class="input-prefix">+972</div>
                  <input id="phone-input" class="input-field" type="tel"
                    placeholder="05X-XXXXXXX" maxlength="10"
                    style="direction:ltr; text-align:left;">
                </div>
              </div>
              <div id="phone-error" class="error-msg" style="display:none"></div>
              <button id="send-otp-btn" class="btn btn-primary btn-full">
                שלח קוד אימות
              </button>
              <div class="login-divider">או</div>
              <button id="guest-btn" class="login-guest-btn">המשך כאורח</button>
            </div>
          </div>

          <!-- Step 2: OTP -->
          <div id="login-step-otp" style="display:none">
            <div class="login-title">הכנס קוד אימות</div>
            <div class="login-sub" id="otp-sub-text">קוד נשלח למספר שהוזן</div>
            <div class="login-form">
              <div class="input-group">
                <label class="input-label">קוד אימות (6 ספרות)</label>
                <input id="otp-input" class="input-field" type="text"
                  placeholder="• • • • • •" maxlength="6" inputmode="numeric"
                  style="letter-spacing:8px; font-size:24px; text-align:center;">
              </div>
              <div id="otp-error" class="error-msg" style="display:none"></div>
              <button id="verify-otp-btn" class="btn btn-primary btn-full">אמת קוד</button>
              <button id="back-to-phone-btn" class="btn btn-outline btn-full">
                חזור לשינוי מספר
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    bindEvents(container);
  }

  function bindEvents(container) {
    container.querySelector('#send-otp-btn').addEventListener('click', handleSendOtp);
    container.querySelector('#verify-otp-btn').addEventListener('click', handleVerifyOtp);
    container.querySelector('#back-to-phone-btn').addEventListener('click', showPhoneStep);
    container.querySelector('#guest-btn').addEventListener('click', handleGuestLogin);

    container.querySelector('#phone-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') handleSendOtp();
    });
    container.querySelector('#otp-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') handleVerifyOtp();
    });
  }

  async function handleSendOtp() {
    const phoneRaw = document.getElementById('phone-input').value.replace(/[-\s]/g, '');
    if (!phoneRaw || phoneRaw.length < 9) {
      showError('phone-error', 'הכנס מספר טלפון תקין');
      return;
    }

    _phoneCode = '972';
    _phoneNumber = phoneRaw.startsWith('0') ? phoneRaw.substring(1) : phoneRaw;

    const btn = document.getElementById('send-otp-btn');
    setLoading(btn, true, 'שולח קוד...');
    hideError('phone-error');

    try {
      const res = await API.sendOtp(_phoneNumber, _phoneCode);
      // Backend returns status 1 on success (or may return various codes)
      // Either way, show OTP step — SMS was sent
      const subText = document.getElementById('otp-sub-text');
      if (subText) subText.textContent = `קוד נשלח ל +${_phoneCode}${_phoneNumber}`;
      showOtpStep();
    } catch (err) {
      console.error('sendOtp error:', err);
      showError('phone-error', 'שגיאה בשליחת קוד. בדוק חיבור לאינטרנט ונסה שוב.');
    } finally {
      setLoading(btn, false, 'שלח קוד אימות');
    }
  }

  async function handleVerifyOtp() {
    const code = document.getElementById('otp-input').value.trim();
    if (!code || code.length < 6) {
      showError('otp-error', 'הכנס קוד בן 6 ספרות');
      return;
    }

    const btn = document.getElementById('verify-otp-btn');
    setLoading(btn, true, 'מאמת...');
    hideError('otp-error');

    try {
      const res = await API.login(_phoneNumber, _phoneCode);
      await handleLoginResponse(res);
    } catch (err) {
      console.error('verifyOtp error:', err);
      showError('otp-error', 'שגיאה בהתחברות. נסה שוב.');
    } finally {
      setLoading(btn, false, 'אמת קוד');
    }
  }

  async function handleGuestLogin() {
    const btn = document.getElementById('guest-btn');
    btn.disabled = true;
    btn.textContent = 'מתחבר...';
    try {
      const res = await API.guestLogin();
      await handleLoginResponse(res);
    } catch (err) {
      console.error('guestLogin error:', err);
      showError('phone-error', 'שגיאה בהתחברות. בדוק חיבור לאינטרנט.');
      btn.disabled = false;
      btn.textContent = 'המשך כאורח';
    }
  }

  async function handleLoginResponse(res) {
    if (res && (res.status === '1' || res.status === 1) && res.data && res.data.profile) {
      const profile = res.data.profile;
      // The login response carries base_url + profile_image_url (a DIRECTORY,
      // e.g. "assets/images/profile/") at the TOP LEVEL of res — NOT under
      // res.data — and profile.profile_image is the filename. Build the full
      // avatar URL only when this user actually has an image on file.
      const imgFile = profile.profile_image || '';
      if (imgFile) {
        profile.profile_image_url = imgFile.startsWith('http')
          ? imgFile
          : (res.base_url || '') + (res.profile_image_url || '') + imgFile;
      }
      await Store.saveUser(profile);
      // preserve onboarding-relevant fields from the backend so an existing
      // (already-registered) user isn't sent through onboarding again
      const sexMap = { M: 'male', F: 'female' };
      const sx = profile.sex || profile.gender;
      if (sx) await Store.set('user_gender', sexMap[sx] || sx);
      if (profile.community_manager_id)     await Store.set('settings_community_manager_id', String(profile.community_manager_id));
      if (profile.daily_msg_assign_time_id) await Store.set('settings_daily_time_id', String(profile.daily_msg_assign_time_id));
      _onSuccess && _onSuccess(profile);
    } else {
      const msg = (res && res.msg) ? res.msg : 'שגיאה בהתחברות';
      showError('otp-error', msg);
      showError('phone-error', msg);
    }
  }

  function showOtpStep() {
    document.getElementById('login-step-phone').style.display = 'none';
    document.getElementById('login-step-otp').style.display = 'block';
    setTimeout(() => document.getElementById('otp-input').focus(), 100);
  }

  function showPhoneStep() {
    document.getElementById('login-step-otp').style.display = 'none';
    document.getElementById('login-step-phone').style.display = 'block';
  }

  function showError(id, msg) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function hideError(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function setLoading(btn, loading, label) {
    btn.disabled = loading;
    btn.innerHTML = loading ? `<span class="spinner-sm"></span> ${label}` : label;
  }

  return { render };
})();
