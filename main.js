const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const Store = require('electron-store');

const store = new Store({ name: 'diuk-data' });
let mainWindow;
let pendingDeepLink = null; // a diuk:// url received before the renderer is ready
let localServer;
let serverPort;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

function startLocalServer() {
  return new Promise((resolve) => {
    localServer = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

      const filePath = path.join(__dirname, 'renderer', urlPath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found: ' + urlPath);
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    });

    localServer.listen(0, '127.0.0.1', () => {
      serverPort = localServer.address().port;
      resolve(serverPort);
    });
  });
}

// ── API proxy (runs in Node — no CORS) ───────────────────────────────────────
const BASE_URL    = 'https://app.diuk.co.il/app/';
const APP_TOKEN   = '62ccf7f36d11ae59d2ccc048d6c56bf30d62b136088212b9b7a24b60325c72552153';
const APP_VERSION = '37.0';

function apiPost(params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const url  = new URL(BASE_URL);

    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':    'application/x-www-form-urlencoded',
        'Content-Length':  Buffer.byteLength(body),
        // Browser-like UA: the diuk server's openresty WAF returns 415 to non-browser
        // User-Agents (the old 'DiukApp/...' was blocked). Keep this looking like a browser.
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept':          '*/*',
        'Accept-Encoding': 'gzip, deflate',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);

        function parseJSON(buf) {
          const str = buf.toString('utf8');
          try { return resolve(JSON.parse(str)); }
          catch { reject(new Error('Invalid JSON: ' + str.substring(0, 200))); }
        }

        const encoding = (res.headers['content-encoding'] || '').toLowerCase();
        // gzip magic: 1f 8b
        const isGzip    = encoding.includes('gzip')    || (raw[0] === 0x1f && raw[1] === 0x8b);
        // zlib magic: 78 01 / 78 9c / 78 da
        const isZlib    = encoding.includes('deflate') || raw[0] === 0x78;

        if (isGzip) {
          zlib.gunzip(raw, (err, buf) => err ? reject(err) : parseJSON(buf));
        } else if (isZlib) {
          zlib.inflate(raw, (err, buf) => err ? zlib.inflateRaw(raw, (e2, b2) => e2 ? parseJSON(raw) : parseJSON(b2)) : parseJSON(buf));
        } else {
          parseJSON(raw);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// multipart/form-data POST — used for uploads (e.g. UpdateProfile with a
// profile_image file part). Same browser UA + gzip handling as apiPost.
function apiUpload({ params, fileField, fileName, fileBuffer, fileType }) {
  return new Promise((resolve, reject) => {
    const boundary = '----DiukBoundary' + Date.now().toString(16) + Math.random().toString(16).slice(2);
    const url = new URL(BASE_URL);
    const parts = [];
    Object.keys(params).forEach(k => {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${params[k]}\r\n`, 'utf8'));
    });
    if (fileBuffer && fileField) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${fileType || 'application/octet-stream'}\r\n\r\n`, 'utf8'));
      parts.push(fileBuffer);
      parts.push(Buffer.from('\r\n', 'utf8'));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
    const body = Buffer.concat(parts);

    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':    `multipart/form-data; boundary=${boundary}`,
        'Content-Length':  body.length,
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept':          '*/*',
        'Accept-Encoding': 'gzip, deflate',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        function parseJSON(buf) {
          const str = buf.toString('utf8');
          try { return resolve(JSON.parse(str)); }
          catch { reject(new Error('Invalid JSON: ' + str.substring(0, 200))); }
        }
        const encoding = (res.headers['content-encoding'] || '').toLowerCase();
        const isGzip    = encoding.includes('gzip')    || (raw[0] === 0x1f && raw[1] === 0x8b);
        const isZlib    = encoding.includes('deflate') || raw[0] === 0x78;
        if (isGzip)      zlib.gunzip(raw,  (err, buf) => err ? reject(err) : parseJSON(buf));
        else if (isZlib) zlib.inflate(raw, (err, buf) => err ? zlib.inflateRaw(raw, (e2, b2) => e2 ? parseJSON(raw) : parseJSON(b2)) : parseJSON(buf));
        else             parseJSON(raw);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

ipcMain.handle('api:upload', async (_e, action, extra, fileField, fileName, fileBase64, token, uid, udidDevice) => {
  try {
    const params = {
      action,
      app_token:   APP_TOKEN,
      app_version: APP_VERSION,
      device_type: 'a',
      udid_device: udidDevice || '',
      udid:        '',
      token:       token || '',
      uid:         uid || '',
      ...extra,
    };
    const fileBuffer = fileBase64 ? Buffer.from(fileBase64, 'base64') : null;
    const result = await apiUpload({ params, fileField, fileName, fileBuffer, fileType: 'image/jpeg' });
    console.log(`[API] ${action} (upload):`, JSON.stringify(result).substring(0, 300));
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('api:post', async (_e, action, extra, token, uid, udidDevice) => {
  try {
    const params = {
      action,
      app_token:   APP_TOKEN,
      app_version: APP_VERSION,
      device_type: 'a',
      udid_device: udidDevice || '',
      udid:        '',
      token:       token || '',
      uid:         uid || '',
      ...extra,
    };
    const result = await apiPost(params);
    if (action === 'GetDailyMessage1') {
      const list = result.data && result.data.list;
      console.log(`[API] GetDailyMessage1: ${list ? list.length : 0} messages`);
      if (list && list[0]) console.log(`[API] first item img_name=${list[0].img_name} background_image=${list[0].background_image} audio_url=${list[0].audio_url}`);
      // log top-level response keys and URL fields
      const topKeys = result.data ? Object.keys(result.data).filter(k => k !== 'list') : [];
      topKeys.forEach(k => console.log(`[API] response.data.${k} =`, result.data[k]));
    }
    else if (action === 'GetQuoteList') {
      const list = result.data && (Array.isArray(result.data.list) ? result.data.list : (typeof result.data.list === 'string' ? (() => { try { return JSON.parse(result.data.list); } catch { return null; } })() : null));
      console.log(`[API] GetQuoteList: ${list ? list.length : 'unknown'} items, raw data keys:`, result.data ? Object.keys(result.data) : 'none');
      if (list) list.forEach((item, i) => console.log(`  [${i}] id=${item.id} title=${item.title}`));
      else console.log('[API] GetQuoteList raw data:', JSON.stringify(result.data).substring(0, 500));
    }
    else if (action === 'GetAllMessagesList1') {
      const list = result.data && result.data.list;
      console.log(`[API] GetAllMessagesList1: ${list ? list.length : 0} items`);
      if (list) {
        const cats = {};
        list.forEach(item => { cats[item.subs_cat_id] = item.subs_cat_title; });
        console.log('[API] categories found:', JSON.stringify(cats));
        list.forEach((item, i) => console.log(`  [${i}] id=${item.id} type=${item.msg_type} cat=${item.subs_cat_id}/"${item.subs_cat_title}" title=${item.title}`));
      }
    }
    else if (action === 'GetAllMenu') {
      const items = Array.isArray(result.data) ? result.data : [];
      console.log(`[API] GetAllMenu: ${items.length} items`);
      items.forEach((m, i) => console.log(`  [${i}] id=${m.id} title=${m.title} menu_type=${m.menu_type}`));
    }
    else if (action === 'GetArticleList') {
      const list = result.data && result.data.list;
      console.log(`[API] GetArticleList: ${list ? list.length : 0} items, base_url="${result.base_url}" image_url="${result.image_url}"`);
      if (list && list[0]) console.log(`[API] first article keys:`, Object.keys(list[0]).join(', '));
      if (list && list[0]) console.log(`[API] first article img_name="${list[0].img_name}" image="${list[0].image}"`);
    }
    else if (action === 'GetDailyMessageAllComment') {
      const list = result.data && (Array.isArray(result.data.list) ? result.data.list : (typeof result.data.list === 'string' ? (() => { try { return JSON.parse(result.data.list); } catch { return []; } })() : []));
      const sentOffset = extra.offset || '0';
      console.log(`[API] GetDailyMessageAllComment offset=${sentOffset}: ${list ? list.length : '?'} items, data keys:`, result.data ? Object.keys(result.data) : 'none');
      if (list && list[0]) console.log(`  first item:`, JSON.stringify(list[0]).substring(0, 200));
    }
    else console.log(`[API] ${action}:`, JSON.stringify(result).substring(0, 300));
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── IPC: persistent key-value store ──────────────────────────────────────────
ipcMain.handle('store:get',    (_e, key)        => store.get(key));
ipcMain.handle('store:set',    (_e, key, value) => { store.set(key, value); return true; });
ipcMain.handle('store:delete', (_e, key)        => { store.delete(key); });
ipcMain.handle('store:clear',  ()               => { store.clear(); });
ipcMain.handle('store:has',    (_e, key)        => store.has(key));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'דיוק',
    backgroundColor: '#f8f5f0',
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/index.html`);

  // once the renderer is loaded, deliver any deep link that arrived earlier
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingDeepLink) {
      mainWindow.webContents.send('deep-link', pendingDeepLink);
      pendingDeepLink = null;
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ── Deep linking (diuk:// custom protocol) ───────────────────────────────────
function extractDeepLink(argv) {
  return (argv || []).find(a => typeof a === 'string' && a.startsWith('diuk://')) || null;
}
function dispatchDeepLink(url) {
  if (!url) return;
  if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('deep-link', url);
  } else {
    pendingDeepLink = url; // flushed on did-finish-load
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

// register this app as the handler for diuk:// links
if (process.defaultApp) {
  // dev: `electron .` needs the script path passed so Windows can relaunch us
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('diuk', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('diuk');
}

// single instance: a second click should focus the running window with the new link
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => dispatchDeepLink(extractDeepLink(argv)));
  app.on('open-url', (e, url) => { e.preventDefault(); dispatchDeepLink(url); }); // macOS

  app.whenReady().then(async () => {
    await startLocalServer();
    pendingDeepLink = extractDeepLink(process.argv) || pendingDeepLink; // cold-start link
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (localServer) localServer.close();
  if (process.platform !== 'darwin') app.quit();
});
