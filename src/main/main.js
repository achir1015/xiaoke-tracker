'use strict';
const { app, BrowserWindow, ipcMain, protocol, dialog, shell, session, safeStorage, Notification, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Updater } = require('./updater');

const APP_TITLE = '小柯機器人專案追蹤工具';
const APP_ROOT = path.join(__dirname, '..', '..');
const argv = process.argv.slice(1);
const argVal = (name) => { const a = argv.find((s) => s.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : null; };
const PROFILE = argVal('profile');

app.setName(APP_TITLE);
if (process.platform === 'win32') app.setAppUserModelId('com.achir.xiaoketracker'); // Windows 通知要有這個才會顯示
app.setPath('userData', path.join(app.getPath('appData'), 'xiaoke-tracker' + (PROFILE ? '-' + PROFILE.replace(/[^\w-]/g, '') : '')));
if (!PROFILE && !app.requestSingleInstanceLock()) app.quit();

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// ---------------- 設定 ----------------
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
function defaults() {
  return {
    me: os.userInfo().username || '我',
    theme: 'system',
    autoUpdate: true,
    notify: true,
    welcomed: false,
    sidebar: true,
    voice: { enabled: true, rate: 1, name: '' },
    ai: { keyEnc: '', model: 'gpt-6.1-terra' },
    sync: { url: '', tokenEnc: '', cursor: 0, auto: true },
  };
}
let settings = defaults();
function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8'));
    const d = defaults();
    settings = { ...d, ...raw, voice: { ...d.voice, ...(raw.voice || {}) }, ai: { ...d.ai, ...(raw.ai || {}) }, sync: { ...d.sync, ...(raw.sync || {}) } };
  } catch { settings = defaults(); saveSettings(); }
}
function saveSettings() {
  fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
  writeAtomic(SETTINGS_FILE(), JSON.stringify(settings, null, 2));
}
function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

// 金鑰用作業系統的加密功能保存，不會明文存檔
function encrypt(s) {
  s = String(s || '').trim();
  if (!s) return '';
  return safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s).toString('base64') : 'plain:' + Buffer.from(s, 'utf8').toString('base64');
}
function decrypt(enc) {
  if (!enc) return '';
  try {
    if (enc.startsWith('plain:')) return Buffer.from(enc.slice(6), 'base64').toString('utf8');
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch { return ''; }
}
const getAiKey = () => decrypt(settings.ai.keyEnc) || process.env.OPENAI_API_KEY || '';

// 給畫面用的設定（不含金鑰本身）
function publicSettings() {
  const s = JSON.parse(JSON.stringify(settings));
  s.ai = { model: settings.ai.model, hasKey: !!getAiKey() };
  s.sync = { url: settings.sync.url, cursor: settings.sync.cursor, auto: settings.sync.auto, hasToken: !!decrypt(settings.sync.tokenEnc) };
  return s;
}

// ---------------- 視窗 ----------------
let win = null;
let allowQuit = false;
function iconPath() {
  const p = path.join(APP_ROOT, 'build', 'icon.png');
  return fs.existsSync(p) ? p : undefined;
}
// 視窗大小不能超過螢幕可用範圍（螢幕縮放 150%～250% 時可用範圍很小）
function fitWindow() {
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1480, wa.width), height = Math.min(940, wa.height);
  return { width, height, minWidth: Math.min(860, width), minHeight: Math.min(520, height) };
}
function createWindow() {
  win = new BrowserWindow({
    ...fitWindow(),
    title: APP_TITLE + (PROFILE ? ` [${PROFILE}]` : ''),
    icon: iconPath(),
    backgroundColor: '#0f172a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.loadURL('app://local/src/app/index.html');
  win.once('ready-to-show', () => {
    if (argv.includes('--hidden')) return;
    if (!PROFILE) win.maximize();
    win.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });
  // 關閉前讓畫面把資料存好、同步一次；最多等 4 秒
  win.on('close', (e) => {
    if (allowQuit) return;
    e.preventDefault();
    win.webContents.send('app:beforeQuit');
    setTimeout(() => { allowQuit = true; if (win) win.destroy(); }, 4000);
  });
  win.on('closed', () => { win = null; });
  // 視窗太小（螢幕縮放 150%～250%）時整體縮小內容，避免按鈕擠在一起
  const fitZoom = () => {
    if (!win || win.isDestroyed()) return;
    const [w, h] = win.getContentSize();
    const z = Math.max(0.65, Math.min(1, w / 1240, h / 700));
    if (Math.abs(win.webContents.getZoomFactor() - z) > 0.01) win.webContents.setZoomFactor(z);
  };
  win.on('resize', fitZoom);
  win.webContents.on('did-finish-load', fitZoom);
  win.once('ready-to-show', () => setTimeout(fitZoom, 50));
}
ipcMain.on('app:quitReady', () => { allowQuit = true; if (win) win.destroy(); });

// ---------------- app:// 協定 ----------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function registerProtocol() {
  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const abs = path.normalize(path.join(APP_ROOT, rel));
    // 只允許程式自己的檔案
    if (url.host !== 'local' || !/^(src|build)[\\/]/.test(path.relative(APP_ROOT, abs))) return new Response('forbidden', { status: 403 });
    let st;
    try { st = fs.statSync(abs); } catch { return new Response('not found', { status: 404 }); }
    if (!st.isFile()) return new Response('not found', { status: 404 });
    return new Response(fs.readFileSync(abs), { status: 200, headers: { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' } });
  });
}

// ---------------- IPC ----------------
function handle(ch, fn) { ipcMain.handle(ch, (e, ...a) => fn(...a)); }

handle('settings:get', () => publicSettings());
handle('settings:set', (patch) => {
  patch = patch || {};
  for (const k of ['me', 'theme', 'autoUpdate', 'notify', 'welcomed', 'sidebar']) if (k in patch) settings[k] = patch[k];
  if (patch.voice) settings.voice = { ...settings.voice, ...patch.voice };
  if (patch.ai) {
    if ('key' in patch.ai) settings.ai.keyEnc = encrypt(patch.ai.key);
    if (patch.ai.model) settings.ai.model = String(patch.ai.model);
  }
  if (patch.sync) {
    if ('token' in patch.sync) settings.sync.tokenEnc = encrypt(patch.sync.token);
    if ('url' in patch.sync) settings.sync.url = String(patch.sync.url).trim();
    if ('cursor' in patch.sync) settings.sync.cursor = Number(patch.sync.cursor) || 0;
    if ('auto' in patch.sync) settings.sync.auto = !!patch.sync.auto;
  }
  saveSettings();
  return publicSettings();
});
// 只有「複製設定碼」要用到同步金鑰本身
handle('settings:secrets', () => ({ url: settings.sync.url, token: decrypt(settings.sync.tokenEnc) }));

handle('sys:info', () => ({ platform: process.platform, arch: process.arch, version: app.getVersion(), packaged: app.isPackaged, profile: PROFILE || '', userData: app.getPath('userData'), electron: process.versions.electron }));
handle('app:openExternal', (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
handle('app:notify', (title, body) => {
  try { if (Notification.isSupported()) new Notification({ title: title || APP_TITLE, body: body || '', icon: iconPath() }).show(); } catch {}
});

// ---------------- 資料檔：每天留一份備份，最多 14 份 ----------------
const DATA_FILE = () => path.join(app.getPath('userData'), 'data.json');
const BACKUP_DIR = () => path.join(app.getPath('userData'), 'backups');
function backupOnce() {
  try {
    if (!fs.existsSync(DATA_FILE())) return;
    const d = new Date();
    const name = `data-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    fs.mkdirSync(BACKUP_DIR(), { recursive: true });
    const target = path.join(BACKUP_DIR(), name);
    if (fs.existsSync(target)) return;
    fs.copyFileSync(DATA_FILE(), target);
    const list = fs.readdirSync(BACKUP_DIR()).filter((f) => /^data-\d{8}\.json$/.test(f)).sort();
    while (list.length > 14) fs.unlinkSync(path.join(BACKUP_DIR(), list.shift()));
  } catch {}
}
handle('db:load', () => {
  try { return JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return null;
    // 資料檔壞了：留下壞檔，改讀最近的備份，不要當成空資料覆蓋
    try {
      fs.copyFileSync(DATA_FILE(), DATA_FILE() + '.broken');
      const list = fs.readdirSync(BACKUP_DIR()).filter((f) => /^data-\d{8}\.json$/.test(f)).sort();
      if (list.length) return JSON.parse(fs.readFileSync(path.join(BACKUP_DIR(), list.at(-1)), 'utf8'));
    } catch {}
    return null;
  }
});
handle('db:save', (data) => {
  backupOnce();
  writeAtomic(DATA_FILE(), JSON.stringify(data));
  return true;
});

handle('file:saveText', async (name, text) => {
  const ext = path.extname(name).slice(1) || 'txt';
  const r = await dialog.showSaveDialog(win, { title: '匯出', defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (r.canceled || !r.filePath) return '';
  fs.writeFileSync(r.filePath, text, 'utf8');
  return r.filePath;
});
handle('file:openText', async (exts) => {
  const r = await dialog.showOpenDialog(win, { title: '選擇檔案', properties: ['openFile'], filters: [{ name: '資料檔', extensions: exts || ['csv', 'json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const buf = fs.readFileSync(r.filePaths[0]);
  if (buf.length > 30 * 1024 * 1024) throw new Error('檔案太大');
  return { name: path.basename(r.filePaths[0]), text: buf.toString('utf8') };
});

// ---------------- OpenAI：金鑰留在主程序，畫面拿不到 ----------------
const OPENAI_BASE = () => (process.env.XIAOKE_OPENAI_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
function aiErrorText(status, data) {
  const msg = (data && data.error && data.error.message) || '';
  if (status === 401) return '金鑰不正確，請到設定檢查 OpenAI 金鑰';
  if (status === 429) return '額度用完或請求太頻繁，請到 OpenAI 帳戶確認';
  if (status === 404) return `找不到這個模型：${msg}`;
  return msg || `OpenAI 回應錯誤（${status}）`;
}
handle('ai:post', async (body) => {
  const key = getAiKey();
  if (!key) throw new Error('還沒有設定 OpenAI 金鑰');
  const res = await fetch(`${OPENAI_BASE()}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(aiErrorText(res.status, data));
  return data;
});
handle('ai:test', async () => {
  const key = getAiKey();
  if (!key) return { ok: false, error: '還沒有設定 OpenAI 金鑰' };
  try {
    const res = await fetch(`${OPENAI_BASE()}/models`, { headers: { Authorization: `Bearer ${key}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: aiErrorText(res.status, data) };
    return { ok: true, models: (data.data || []).map((m) => m.id).filter((id) => /^(gpt|o\d)/.test(id)).sort().reverse() };
  } catch (e) { return { ok: false, error: `連不上 OpenAI：${e.message}` }; }
});

// ---------------- 雲端同步：Apps Script 回應會轉址，fetch 預設會跟著走 ----------------
handle('sync:post', async (body) => {
  const token = decrypt(settings.sync.tokenEnc);
  const { url } = settings.sync;
  if (!url || !token) throw new Error('還沒有設定雲端同步');
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}app=tracker`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token, ...body }), redirect: 'follow' });
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    if (/forbidden/.test(text)) throw new Error('雲端程式還沒更新，請先完成 Apps Script 設定');
    throw new Error(`雲端回應不正確（${res.status}）`);
  }
});

// ---------------- 版本更新 ----------------
const updater = new Updater();
handle('update:check', () => updater.check());
ipcMain.handle('update:download', async (e) => updater.download((got, total) => { if (!e.sender.isDestroyed()) e.sender.send('update:progress', { got, total }); }));
handle('update:install', (file) => { allowQuit = true; return updater.install(file); });
handle('update:openPage', () => shell.openExternal((updater.info && updater.info.page) || 'https://github.com/achir1015/xiaoke-tracker/releases/latest'));

// ---------------- 啟動 ----------------
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.whenReady().then(() => {
  loadSettings();
  registerProtocol();
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['notifications', 'fullscreen', 'clipboard-sanitized-write'].includes(perm)));
  createWindow();
});
