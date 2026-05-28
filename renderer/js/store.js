// Persistent storage (wraps Electron's electron-store via preload IPC)
const Store = {
  async get(key, defaultVal = null) {
    const v = await window.diukStore.get(key);
    return v !== undefined && v !== null ? v : defaultVal;
  },
  async set(key, value) {
    return window.diukStore.set(key, value);
  },
  async delete(key) {
    return window.diukStore.delete(key);
  },
  async clear() {
    return window.diukStore.clear();
  },
  async has(key) {
    return window.diukStore.has(key);
  },

  // User session helpers
  async saveUser(profile) {
    await this.set('login_token',        profile.login_token);
    await this.set('user_id',            profile.id);
    await this.set('user_name',          profile.name || '');
    await this.set('user_phone',         profile.phone_number || '');
    await this.set('user_phone_code',    profile.phone_code || '972');
    await this.set('user_email',         profile.email || '');
    await this.set('user_is_guest',      profile.is_guest || '0');
    await this.set('user_lang',          profile.lang || 'iw');
    await this.set('profile_image_url',  profile.profile_image_url || '');
    await this.set('profile_image',      profile.profile_image || '');
  },
  async clearUser() {
    const keys = ['login_token','user_id','user_name','user_phone','user_email',
                  'user_is_guest','user_lang','profile_image_url','profile_image','user_phone_code'];
    for (const k of keys) await this.delete(k);
  },
  async getToken()   { return this.get('login_token'); },
  async getUserId()  { return this.get('user_id'); },
  async getUserName(){ return this.get('user_name', ''); },
  async isGuest()    { return (await this.get('user_is_guest', '0')) === '1'; },
  async isLoggedIn() { return !!(await this.get('login_token')); },
};
