// 小柯機器人專案追蹤工具：雲端儲存（加在「小柯上傳」Apps Script 專案的新檔案）
// 資料存在雲端硬碟「小柯專案追蹤」資料夾的 tracker-data.json；機器人上傳照片的功能完全不受影響
//
// 要配合 doPost 第一行加上：
//   if (e && e.parameter && e.parameter.app === 'tracker') return trackerPost_(e);
//
// 通訊方式：POST ?app=tracker，內容是 JSON（text/plain）
//   { token, action: 'ping' }                      → { ok, seq, count }
//   { token, action: 'sync', since, changes: [] }  → { ok, seq, changes }
// changes 的每一筆：{ k: 'project'|'item', id, u, r }；u 是修改時間，新的贏

const TRACKER_FOLDER = '小柯專案追蹤';
const TRACKER_FILE = 'tracker-data.json';
const TRACKER_BACKUPS = 14; // 每天留一份備份，最多幾份
const TRACKER_EXEC_URL = ''; // 部署後的 …/exec 網址；空白時用 getUrl()，但專案有多個部署時可能拿到只有本人能用的 /dev

// 同步金鑰不寫在程式碼裡：由 setupTracker 產生，存在指令碼屬性
function trackerToken_() {
  return PropertiesService.getScriptProperties().getProperty('TRACKER_TOKEN') || '';
}

function trackerJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 網址列打開時只回狀態，不回資料
function doGet() {
  return trackerJson_({ ok: true, app: '小柯專案追蹤', msg: '服務正常' });
}

function trackerPost_(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return trackerJson_({ ok: false, error: '資料格式錯誤' }); }
  const token = trackerToken_();
  if (!req || !token || req.token !== token) return trackerJson_({ ok: false, error: '同步金鑰不正確' });
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return trackerJson_({ ok: false, error: '伺服器忙碌，請稍後再試' });
  }
  try {
    const file = trackerFile_();
    const store = trackerRead_(file);
    if (req.action === 'ping') return trackerJson_({ ok: true, seq: store.seq, count: Object.keys(store.recs).length });
    if (req.action === 'sync') {
      const before = store.seq;
      const out = trackerMerge_(store, req.changes || [], Number(req.since) || 0);
      if (store.seq !== before) {
        trackerBackup_(file);
        file.setContent(JSON.stringify(store));
      }
      return trackerJson_({ ok: true, seq: store.seq, changes: out });
    }
    return trackerJson_({ ok: false, error: '不認得的動作' });
  } catch (err) {
    return trackerJson_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// 合併：比伺服器新的才收下；回傳對方還沒看過的紀錄，以及被駁回（伺服器比較新）的紀錄
function trackerMerge_(store, changes, since) {
  const rejected = {};
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    if (!c || !c.id || !c.r || (c.k !== 'project' && c.k !== 'item')) continue;
    const key = c.k + ':' + c.id;
    const cur = store.recs[key];
    if (cur && cur.u > c.u) { rejected[key] = true; continue; }
    if (cur && cur.u === c.u) continue;
    store.seq++;
    store.recs[key] = { k: c.k, id: c.id, u: c.u, s: store.seq, r: c.r };
  }
  const out = [];
  for (const key in store.recs) {
    const x = store.recs[key];
    if (x.s > since || rejected[key]) out.push({ k: x.k, id: x.id, u: x.u, r: x.r });
  }
  return out;
}

function trackerFile_() {
  const it = DriveApp.getFoldersByName(TRACKER_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(TRACKER_FOLDER);
  const files = folder.getFilesByName(TRACKER_FILE);
  return files.hasNext() ? files.next() : folder.createFile(TRACKER_FILE, JSON.stringify({ seq: 0, recs: {} }), MimeType.PLAIN_TEXT);
}

function trackerRead_(file) {
  const store = JSON.parse(file.getBlob().getDataAsString('UTF-8') || '{}');
  return { seq: store.seq || 0, recs: store.recs || {} };
}

// 每天第一次寫入前複製一份，寫壞時可以從雲端硬碟救回
function trackerBackup_(file) {
  const day = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd');
  const folder = file.getParents().next();
  const name = 'backup-' + day + '.json';
  if (folder.getFilesByName(name).hasNext()) return;
  file.makeCopy(name, folder);
  const list = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (/^backup-\d{8}\.json$/.test(f.getName())) list.push(f);
  }
  list.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
  while (list.length > TRACKER_BACKUPS) list.shift().setTrashed(true);
}

// 在編輯器按「執行」這個函式一次：完成授權、建立資料夾、產生同步金鑰
// 執行記錄會印出「設定碼」，貼到 App 的 設定 → 雲端同步 → 貼上設定碼 就連上了
// 金鑰已經存在時不會換掉，重新執行只是再印一次
function setupTracker() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('TRACKER_TOKEN');
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('TRACKER_TOKEN', token);
  }
  const file = trackerFile_();
  const url = TRACKER_EXEC_URL || ScriptApp.getService().getUrl();
  if (/\/dev$/.test(url)) Logger.log('注意：這是 /dev 測試網址，App 連不上。請把 TRACKER_EXEC_URL 填成 /exec 網址再執行一次');
  const code = 'XKT1.' + Utilities.base64Encode(JSON.stringify({ url: url, token: token }), Utilities.Charset.UTF_8);
  Logger.log('資料檔：' + file.getName() + '，目前 ' + Object.keys(trackerRead_(file).recs).length + ' 筆');
  Logger.log('網址：' + url);
  Logger.log('設定碼：' + code);
  return code;
}
