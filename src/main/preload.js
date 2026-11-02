'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('xk', {
  platform: 'desktop',
  settings: { get: inv('settings:get'), set: inv('settings:set'), secrets: inv('settings:secrets') },
  db: { load: inv('db:load'), save: inv('db:save') },
  sys: { info: inv('sys:info') },
  openExternal: inv('app:openExternal'),
  notify: inv('app:notify'),
  file: { saveText: inv('file:saveText'), openText: inv('file:openText') },
  ai: { post: inv('ai:post'), test: inv('ai:test') },
  sync: { post: inv('sync:post') },
  update: {
    check: inv('update:check'), download: inv('update:download'), install: inv('update:install'), openPage: inv('update:openPage'),
    onProgress: (fn) => { const h = (e, d) => fn(d); ipcRenderer.on('update:progress', h); return () => ipcRenderer.off('update:progress', h); },
  },
  onBeforeQuit: (fn) => ipcRenderer.on('app:beforeQuit', () => fn()),
  quitReady: () => ipcRenderer.send('app:quitReady'),
});
