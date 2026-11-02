// 平台介面：桌面版由 preload 提供 window.xk；手機與線上版沒有的部分用這裡的網頁實作補上
const LS = 'xiaoke-tracker:';
const lsGet = (k, d) => { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch {} };

// 資料放 IndexedDB（localStorage 容量太小）
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('xiaoke-tracker', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result ?? null); q.onerror = () => rej(q.error); });
}
async function idbSet(key, val) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(val, key); t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
}

function webSettings() {
  const defaults = { me: '我', theme: 'system', autoUpdate: true, notify: false, welcomed: false, sidebar: true, voice: { enabled: true, rate: 1, name: '' }, ai: { model: 'gpt-6.1-terra' }, sync: { url: '', cursor: 0, auto: true } };
  const read = () => { const s = lsGet('settings', {}); return { ...defaults, ...s, voice: { ...defaults.voice, ...(s.voice || {}) }, ai: { ...defaults.ai, ...(s.ai || {}) }, sync: { ...defaults.sync, ...(s.sync || {}) } }; };
  const pub = () => { const s = read(); return { ...s, ai: { model: s.ai.model, hasKey: !!s.ai.key }, sync: { url: s.sync.url, cursor: s.sync.cursor, auto: s.sync.auto, hasToken: !!s.sync.token } }; };
  return {
    read,
    get: async () => pub(),
    set: async (patch) => {
      const s = read();
      for (const k of Object.keys(patch)) s[k] = patch[k] && typeof patch[k] === 'object' ? { ...s[k], ...patch[k] } : patch[k];
      lsSet('settings', s);
      return pub();
    },
    secrets: async () => { const s = read(); return { url: s.sync.url, token: s.sync.token || '' }; },
  };
}

function webPlatform() {
  const settings = webSettings();
  const base = 'https://api.openai.com/v1';
  return {
    platform: 'web',
    settings,
    db: { load: () => idbGet('data'), save: (d) => idbSet('data', d) },
    sys: { info: async () => ({ platform: 'web', version: (window.XK_VERSION || ''), packaged: true }) },
    openExternal: async (url) => { window.open(url, '_blank', 'noopener'); },
    notify: async (title, body) => { try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); } catch {} },
    file: {
      saveText: async (name, text) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        return name;
      },
      openText: (exts) => new Promise((res) => {
        const i = document.createElement('input');
        i.type = 'file';
        i.accept = (exts || ['csv', 'json']).map((x) => '.' + x).join(',');
        i.onchange = async () => { const f = i.files[0]; res(f ? { name: f.name, text: await f.text() } : null); };
        i.click();
      }),
    },
    ai: {
      post: async (body) => {
        const key = settings.read().ai.key;
        if (!key) throw new Error('還沒有設定 OpenAI 金鑰');
        const res = await fetch(`${base}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 401 ? '金鑰不正確，請到設定檢查 OpenAI 金鑰' : data.error?.message || `OpenAI 回應錯誤（${res.status}）`);
        return data;
      },
      test: async () => {
        const key = settings.read().ai.key;
        if (!key) return { ok: false, error: '還沒有設定 OpenAI 金鑰' };
        try {
          const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return { ok: false, error: res.status === 401 ? '金鑰不正確' : data.error?.message || `錯誤 ${res.status}` };
          return { ok: true, models: (data.data || []).map((m) => m.id).filter((id) => /^(gpt|o\d)/.test(id)).sort().reverse() };
        } catch (e) { return { ok: false, error: e.message }; }
      },
    },
    sync: {
      post: async (body) => {
        const { url, token } = settings.read().sync;
        if (!url || !token) throw new Error('還沒有設定雲端同步');
        const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}app=tracker`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token, ...body }) });
        return res.json();
      },
    },
    update: {
      check: async () => ({ current: window.XK_VERSION || '', latest: window.XK_VERSION || '', newer: false, notes: '', canInstall: false }),
      download: async () => '', install: async () => ({}), openPage: async () => {}, onProgress: () => () => {},
    },
    onBeforeQuit: (fn) => addEventListener('pagehide', fn),
    quitReady: () => {},
  };
}

// ---- 手機 App：Android 由 WebView 注入 window.XiaokeAndroid，iOS 走 messageHandlers.xkr ----
const REPO = 'achir1015/xiaoke-tracker';
const INSTALL_PAGE = 'https://achir1015.github.io/xiaoke-tracker/ios/';
const A = window.XiaokeAndroid;
const isIOS = !!(window.XiaokeIOS && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.xkr);
const ios = (cmd, ...args) => window.webkit.messageHandlers.xkr.postMessage({ cmd, args });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };
function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0; }
  return false;
}
// 分段寫檔：Android 存到「下載/小柯專案追蹤」，iOS 結束時開分享選單
async function saveChunks(begin, write, end, name, text) {
  const bytes = new TextEncoder().encode(text);
  const r = await begin(name);
  if (r.status !== 'ok') throw new Error(r.message || '無法建立檔案');
  for (let i = 0; i < bytes.length; i += 262144) {
    const w = await write(r.token, b64(bytes.subarray(i, i + 262144)));
    if (w.status !== 'ok') throw new Error(w.message || '寫入失敗');
  }
  const e = await end(r.token);
  return e.status === 'ok' ? e.path : '';
}

function androidLayer(web) {
  const J = (s) => JSON.parse(s);
  let info = null;
  let ttsSeq = 0;
  const waiting = new Map();
  window.__xkTtsDone = (id) => { const f = waiting.get(id); if (f) { waiting.delete(id); f(); } };
  window.xkNative = {
    mobile: true,
    tts: {
      available: () => A.ttsAvailable(), voiceName: () => A.ttsVoice(), stop: () => A.ttsStop(),
      speak: (text, rate) => new Promise((res) => { const id = 't' + ++ttsSeq; waiting.set(id, res); A.ttsSpeak(text, rate || 1, id); }),
    },
  };
  return {
    ...web,
    platform: 'android',
    sys: { info: async () => { const r = J(A.appInfo()); return { platform: 'android', version: r.version, packaged: true }; } },
    openExternal: async (url) => { A.openUrl(url); },
    file: { ...web.file, saveText: (name, text) => saveChunks(async (n) => J(A.beginSave(n)), async (t, d) => J(A.writeChunk(t, d)), async (t) => J(A.endSave(t)), name, text) },
    update: {
      check: async () => {
        const r = J(A.checkUpdate());
        if (r.status !== 'ok') throw new Error(r.message || '查詢失敗');
        info = r;
        return { current: r.current, latest: r.latest, newer: newer(r.latest, r.current), notes: r.notes, page: r.page, canInstall: !!r.url };
      },
      download: async () => {
        const r = J(A.installUpdate(info.url, info.latest));
        if (r.status !== 'ok') throw new Error(r.message || '下載失敗');
        for (;;) {
          const st = J(A.updateStatus());
          if (st.state === 'permission') throw new Error('請在剛打開的設定畫面允許「安裝不明應用程式」，回來後再按一次');
          if (st.state === 'error') throw new Error('下載失敗，請再試一次');
          if (st.state === 'launching') return '';
          if (update.progress) update.progress({ got: st.pct, total: 100 });
          await sleep(400);
        }
      },
      install: async () => ({ manual: true, path: '請在系統畫面按「更新」' }),
      openPage: async () => { A.openUrl(info ? info.page : `https://github.com/${REPO}/releases/latest`); },
      onProgress: (fn) => { update.progress = fn; return () => { update.progress = null; }; },
    },
  };
}
const update = { progress: null };

function iosLayer(web) {
  window.xkNative = { mobile: true };
  const version = async () => (await ios('app_info')).version;
  return {
    ...web,
    platform: 'ios',
    sys: { info: async () => ({ platform: 'ios', version: await version(), packaged: true }) },
    openExternal: async (url) => { ios('open_url', url); },
    file: { ...web.file, saveText: (name, text) => saveChunks((n) => ios('begin_save', n), (t, d) => ios('write_chunk', t, d), (t) => ios('end_save', t), name, text) },
    update: {
      // GitHub API 被限流時改讀安裝頁的 manifest.plist，裡面有 iOS 版的版本號
      check: async () => {
        const current = await version();
        let latest = '', notes = '';
        try {
          const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
          if (r.ok) { const o = await r.json(); latest = String(o.tag_name).replace(/^v/, ''); notes = o.body || ''; }
        } catch {}
        if (!latest) {
          const t = await (await fetch(INSTALL_PAGE + 'manifest.plist', { cache: 'no-store' })).text();
          latest = (/<key>bundle-version<\/key>\s*<string>([^<]+)</.exec(t) || [])[1] || current;
        }
        return { current, latest, newer: newer(latest, current), notes, page: INSTALL_PAGE, canInstall: false };
      },
      download: async () => '', install: async () => ({}), openPage: async () => { ios('open_url', INSTALL_PAGE); }, onProgress: () => () => {},
    },
  };
}

// 線上版：網站上的 version.json 就是最新版，重新載入就更新了
function onlineLayer(web) {
  return {
    ...web,
    update: {
      check: async () => {
        const current = window.XK_VERSION || '';
        const r = await fetch('version.json', { cache: 'no-store' });
        if (!r.ok) return { current, latest: current, newer: false, notes: '', canInstall: false };
        const { version } = await r.json();
        return { current, latest: version, newer: newer(version, current), notes: '', canInstall: true, page: location.href };
      },
      download: async () => '', install: async () => { location.reload(); return {}; }, openPage: async () => {}, onProgress: () => () => {},
    },
  };
}

export const xk = window.xk ? window.xk : A ? androidLayer(webPlatform()) : isIOS ? iosLayer(webPlatform()) : onlineLayer(webPlatform());
