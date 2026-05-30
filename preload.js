const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('diukStore', {
  get:    (key)        => ipcRenderer.invoke('store:get',    key),
  set:    (key, value) => ipcRenderer.invoke('store:set',    key, value),
  delete: (key)        => ipcRenderer.invoke('store:delete', key),
  clear:  ()           => ipcRenderer.invoke('store:clear'),
  has:    (key)        => ipcRenderer.invoke('store:has',    key),
});

// API proxy — calls go through Node (no CORS)
contextBridge.exposeInMainWorld('diukAPI', {
  post: (action, extra, token, uid, udidDevice) =>
    ipcRenderer.invoke('api:post', action, extra, token, uid, udidDevice),
});

// deep links (diuk://content?mid=..&dmsgid=..) delivered from the main process
contextBridge.exposeInMainWorld('diukDeepLink', {
  on: (callback) => ipcRenderer.on('deep-link', (_e, url) => callback(url)),
});
