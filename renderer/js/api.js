// REST API — all calls go via Electron main process (Node.js, no CORS)
const API = (() => {

  let _udidDevice = null;

  async function getUdidDevice() {
    if (_udidDevice) return _udidDevice;
    let id = await Store.get('udid_device');
    if (!id) {
      id = 'win-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      await Store.set('udid_device', id);
    }
    _udidDevice = id;
    return id;
  }

  async function post(action, extra = {}) {
    const token      = await Store.getToken() || '';
    const uid        = await Store.getUserId() || '';
    const udidDevice = await getUdidDevice();
    const result     = await window.diukAPI.post(action, extra, token, uid, udidDevice);
    if (!result.ok) throw new Error(result.error);
    // Session expired — clear stored credentials and force re-login
    if (result.data && (result.data.status === 3 || result.data.status === '3')) {
      await Store.clearUser();
      location.reload();
    }
    return result.data;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const sendOtp  = (phone, code)  => post('OtpSend', { phone_number: phone, phone_code: code });
  const login    = (phone, code)  => post('Login',   { phone_number: phone, phone_code: code });
  const guestLogin = ()           => post('GetGuestLogin');
  const checkPhone = (phone, code)=> post('CheckUserPhoneNumberExists', { phone_number: phone, phone_code: code });

  // ── Content ───────────────────────────────────────────────────────────────
  const getDailyMessages        = ()         => post('GetDailyMessage1',               { output_type: '3', allow_position_pagination: '0' });
  const getDailyMessageComments = (id, page) => post('GetDailyMessageComment',         { daily_msg_id: String(id), page_no: String(page || 1) });
  const addDailyMessageComment  = (id, text, shareInChat, sendToAdmin) => post('AddDailyMessageComment', {
    msg_id:                     String(id),
    description:                text,
    is_anonymous_comment:       '0',
    is_visible_whatsapp_screen: shareInChat ? '1' : '0',
    is_send_community_manager:  sendToAdmin ? '1' : '0',
    screen_name:                'daily_msg_comment',
  });
  const getKeyPhrases           = (offset = 0)  => post('GetQuoteList',               { offset: String(offset), limit: '25', device_type: 'a' });
  const getQuoteDetail          = (id)          => post('GetQuoteDetail',              { quote_id: String(id), device_type: 'a' });
  const getMessageDetail        = (msgId, msgType) => post('GetMessageDetail',         { msg_id: String(msgId), msg_type: String(msgType) });
  const getQuotes               = (offset = 0) => post('GetDailyMessageAllComment',     { offset: String(offset), limit: '10', device_type: 'a' });
  const getSurveyList           = (page = 1) => post('GetSurveyList',                  { page_no: String(page) });
  const getSubscriptionContent  = (page = 1) => post('GetSubscriptionContentInfoList', { page_no: String(page) });
  const addDailyMessageRating   = (msgId, userMsgId, rating) => post('AddDailyMessageRating', {
    daily_msg_id: String(msgId),
    user_msg_id:  String(userMsgId || ''),
    rating:       String(rating),
  });
  const getBadgeCount           = ()         => post('GetBadgeCount');
  const getBundleSubscription   = ()         => post('GetBundleSubscription');
  const getAllMenu               = ()         => post('GetAllMenu');
  const getMenuPageDetail       = (id)       => post('GetMenuPageDetail',              { menu_id: String(id) });
  const getArticleList          = (menuId, offset = 0) => post('GetArticleList',       { menu_id: String(menuId), offset: String(offset), limit: '10' });
  const markAllRead             = ()         => post('MarkAllAsRead');
  const deleteComment           = (id)       => post('DeleteDailyMessageComment', { comment_id: String(id) });

  return {
    sendOtp, login, guestLogin, checkPhone,
    getDailyMessages, getDailyMessageComments, addDailyMessageComment,
    getKeyPhrases, getQuoteDetail, getMessageDetail, getQuotes, getSurveyList, getSubscriptionContent,
    getBadgeCount, getBundleSubscription, getAllMenu, getMenuPageDetail, getArticleList, markAllRead,
    addDailyMessageRating, deleteComment,
  };
})();
