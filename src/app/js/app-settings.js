// 設定視窗：個人、AI 助手、雲端同步、語音、關於；版本更新
import { h, fill, $ } from './util.js';
import { modal, row, toast, confirmBox, promptBox } from './ui.js';
import { xk } from './platform.js';
import { store, S, refresh } from './state.js';
import { MODELS } from './core/agent.js';
import { encodePairing, decodePairing } from './core/sync.js';
import { voice } from './voice.js';
import { cloud } from './app.js';

const cleanErr = (e) => String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const TABS = [['me', '👤', '個人與外觀'], ['ai', '🤖', 'AI 助手'], ['sync', '☁️', '雲端同步'], ['voice', '🔊', '語音'], ['about', 'ℹ️', '關於與更新']];

export function openSettings(tab = 'me') {
  const body = h('div', { class: 'st-body' });
  let cur = tab;
  const nav = h('nav', { class: 'set-nav' });
  const show = (id) => {
    cur = id;
    fill(nav, ...TABS.map(([k, ic, t]) => h('button', { class: k === cur ? 'on' : '', id: `st-${k}`, onclick: () => show(k) }, ic, ' ', t)));
    ({ me: tabMe, ai: tabAI, sync: tabSync, voice: tabVoice, about: tabAbout })[id](body);
  };
  show(cur);
  return modal({ title: '設定', wide: true, cls: 'settings', body: h('div', { class: 'set' }, nav, body) });
}

const set = async (patch) => { S.settings = await xk.settings.set(patch); return S.settings; };

function tabMe(host) {
  const name = h('input', { type: 'text', id: 'stName', value: S.settings.me, onchange: async (e) => { await set({ me: e.target.value.trim() }); refresh(true); } });
  const theme = h('div', { class: 'seg' }, [['system', '跟隨系統'], ['light', '淺色'], ['dark', '深色']].map(([id, t]) => h('button', { class: S.settings.theme === id ? 'on' : '', onclick: async () => { await set({ theme: id }); applyTheme(); tabMe(host); } }, t)));
  const notify = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.settings.notify, onchange: (e) => set({ notify: e.target.checked }) }), '開啟時提醒逾期與快到期的項目');
  fill(host, row('您的名字', name, '用在「指派給我」和留言署名，篩選時寫 @me 就是這個名字'), h('div', { class: 'field' }, h('span', {}, '外觀'), theme), notify);
}

export function applyTheme() {
  const t = S.settings.theme;
  document.documentElement.dataset.theme = t === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
}

function tabAI(host) {
  const key = h('input', { type: 'password', id: 'stKey', placeholder: S.settings.ai.hasKey ? '已設定（要更換才需要輸入）' : 'sk-…', autocomplete: 'off' });
  const opts = [...MODELS];
  if (!opts.find((m) => m.id === S.settings.ai.model)) opts.push({ id: S.settings.ai.model, name: S.settings.ai.model });
  const model = h('select', { id: 'stModel', onchange: (e) => set({ ai: { model: e.target.value } }) }, opts.map((m) => h('option', { value: m.id, selected: m.id === S.settings.ai.model }, m.name)));
  const msg = h('div', { class: 'hint' });
  const save = h('button', { class: 'btn primary', id: 'stKeySave', onclick: async () => {
    const v = key.value.trim();
    if (v) { await set({ ai: { key: v } }); key.value = ''; key.placeholder = '已設定（要更換才需要輸入）'; }
    msg.textContent = '測試中…';
    const r = await xk.ai.test();
    if (r.ok) {
      msg.textContent = `✅ 金鑰可以使用（找到 ${r.models.length} 個模型）`;
      for (const id of r.models.filter((x) => /^gpt-[5-9]/.test(x) && !/(audio|tts|image|transcribe|realtime|search|embedding)/.test(x))) if (!opts.find((m) => m.id === id)) { model.append(h('option', { value: id }, id)); opts.push({ id }); }
    } else msg.textContent = `❌ ${r.error}`;
    refresh();
    if ($('#agent').classList.contains('open')) import('./agent-ui.js').then((a) => a.toggleAgent(true));
  } }, '儲存並測試');
  const clear = S.settings.ai.hasKey && h('button', { class: 'btn', onclick: async () => { await set({ ai: { key: '' } }); tabAI(host); toast('已刪除金鑰'); } }, '刪除金鑰');
  fill(host, 
    row('OpenAI 金鑰', key, xk.platform === 'desktop' ? '金鑰用系統的加密功能保存在這台電腦，不會上傳到雲端同步' : '金鑰只保存在這個裝置，不會上傳到雲端同步'),
    h('div', { class: 'row-gap' }, save, clear, h('button', { class: 'btn ghost', onclick: () => xk.openExternal('https://platform.openai.com/api-keys') }, '到 OpenAI 取得金鑰')),
    msg, row('模型', model, '一般工作用 Terra 就很夠了；按「儲存並測試」會加入您帳戶可用的其他模型'));
}

function tabSync(host) {
  const url = h('input', { type: 'url', id: 'stUrl', value: S.settings.sync.url, placeholder: 'https://script.google.com/macros/s/…/exec' });
  const token = h('input', { type: 'password', id: 'stToken', placeholder: S.settings.sync.hasToken ? '已設定（要更換才需要輸入）' : '同步金鑰', autocomplete: 'off' });
  const auto = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.settings.sync.auto, onchange: (e) => set({ sync: { auto: e.target.checked } }) }), '自動同步（開啟時、修改後、每分鐘）');
  const msg = h('div', { class: 'hint', id: 'stSyncMsg' }, syncText());
  const connect = async (u, t) => {
    msg.textContent = '連線中…';
    try {
      const patch = { url: u };
      if (t) patch.token = t;
      await set({ sync: patch });
      const r = await xk.sync.post({ action: 'ping' });
      if (!r.ok) throw new Error(r.error || '連線失敗');
      const n = await cloud.first(r.count);
      msg.textContent = `✅ 已連上雲端。上傳 ${n.sent} 筆、下載 ${n.applied} 筆`;
      tabSync(host);
    } catch (e) { msg.textContent = `❌ ${cleanErr(e)}`; }
  };
  fill(host, 
    h('p', { class: 'muted' }, '資料存在您自己的 Google 雲端硬碟，電腦和手機共用同一份。沒有設定也能單機使用。'),
    row('Apps Script 網址', url), row('同步金鑰', token), auto,
    h('div', { class: 'row-gap' },
      h('button', { class: 'btn primary', id: 'stConnect', onclick: () => connect(url.value.trim(), token.value.trim()) }, '連線並同步'),
      h('button', { class: 'btn', disabled: !S.settings.sync.hasToken, onclick: async () => { try { const r = await cloud.run(); toast(`同步完成：上傳 ${r.sent} 筆、下載 ${r.applied} 筆`); tabSync(host); } catch (e) { toast(`同步失敗：${cleanErr(e)}`, { type: 'error' }); } } }, '立即同步')),
    msg,
    h('section', { class: 'set-card' }, h('h4', {}, '📲 在其他裝置使用'), h('p', { class: 'muted' }, '在這裡複製設定碼，到另一台裝置按「貼上設定碼」就連上了。設定碼含同步金鑰，請不要公開。'),
      h('div', { class: 'row-gap' },
        h('button', { class: 'btn', disabled: !S.settings.sync.hasToken, onclick: async () => { const s = await xk.settings.secrets(); await navigator.clipboard.writeText(encodePairing(s.url, s.token)); toast('設定碼已複製'); } }, '📋 複製設定碼'),
        h('button', { class: 'btn', id: 'stPaste', onclick: async () => {
          const code = await promptBox('貼上設定碼', { placeholder: 'XKT1.…' });
          if (!code) return;
          const o = decodePairing(code);
          if (!o) { toast('設定碼不正確', { type: 'error' }); return; }
          await connect(o.url, o.token);
        } }, '📥 貼上設定碼'))));
}

function syncText() {
  const st = cloud.state();
  if (!S.settings.sync.hasToken) return '尚未設定雲端同步';
  if (st.status === 'error') return `❌ ${st.error}`;
  return st.at ? `✅ 上次同步 ${new Date(st.at).toLocaleTimeString('zh-TW')}` : '已設定，等待同步';
}

function tabVoice(host) {
  const v = S.settings.voice;
  const on = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: v.enabled, onchange: async (e) => { await set({ voice: { enabled: e.target.checked } }); voice.configure({ enabled: e.target.checked }); } }), '開啟使用說明時自動朗讀');
  const rate = h('input', { type: 'range', min: 0.6, max: 1.6, step: 0.1, value: v.rate, oninput: (e) => voice.configure({ rate: e.target.value }), onchange: (e) => set({ voice: { rate: Number(e.target.value) } }) });
  const list = voice.list();
  const sel = list.length > 0 && h('select', { onchange: async (e) => { voice.configure({ name: e.target.value }); await set({ voice: { name: e.target.value } }); } }, h('option', { value: '' }, '自動選擇'), list.map((x) => h('option', { value: x.name, selected: x.name === v.name }, x.name)));
  fill(host, on, row('語速', rate), sel && row('聲音', sel),
    h('div', { class: 'row-gap' }, h('button', { class: 'btn', onclick: () => voice.speak('您好，我是小柯機器人，很高興為您服務。', { force: true }) }, '🔊 試聽')),
    h('p', { class: 'hint' }, voice.available ? `目前語音：${voice.voiceName}` : '找不到中文語音，可在系統設定新增「中文（台灣）」語音'));
}

function tabAbout(host) {
  const info = S.sysInfo || {};
  fill(host, 
    h('div', { class: 'about' }, h('img', { src: 'img/logo64.png', alt: '', width: 64, height: 64 }), h('div', {}, h('h3', {}, '小柯機器人專案追蹤工具'), h('p', { class: 'muted' }, `版本 ${info.version || ''}`), h('p', {}, '系統開發：吳玉柱 先生 與 Claude AI Opus 5.5'))),
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.settings.autoUpdate, onchange: (e) => set({ autoUpdate: e.target.checked }) }), '開啟時自動檢查新版本'),
    h('div', { class: 'row-gap' }, h('button', { class: 'btn primary', onclick: () => openUpdate() }, '檢查更新')),
    info.userData && h('p', { class: 'hint' }, `資料位置：${info.userData}`),
    h('button', { class: 'link', onclick: async () => { if (await confirmBox('要重新建立一份示範專案嗎？現有資料不受影響。')) { const { seedDemo } = await import('./project-pages.js'); seedDemo(); refresh(true); toast('示範專案已建立'); } } }, '重新建立示範專案'));
}

// ---- 版本更新 ----
export async function checkUpdateQuiet() {
  try {
    const r = await xk.update.check();
    S.update = r;
    $('#btnUpdate')?.classList.toggle('dot', !!r.newer);
  } catch { /* 沒網路就算了，下次再查 */ }
}

export async function openUpdate() {
  const box = h('div', { class: 'upd' }, h('p', {}, '檢查中…'));
  const m = modal({ title: '版本更新', body: box });
  let r;
  try { r = await xk.update.check(); } catch (e) { fill(box, h('p', {}, `無法檢查更新：${cleanErr(e)}`)); return; }
  S.update = r;
  $('#btnUpdate')?.classList.toggle('dot', !!r.newer);
  if (!r.newer) { fill(box, h('p', {}, `✅ 目前已是最新版（${r.current}）`)); return; }
  const bar = h('span', { style: { width: '0%' } });
  const progress = h('div', { class: 'bar lg', style: { display: 'none' } }, bar);
  const msg = h('p', { class: 'hint' });
  const notes = r.notes && h('pre', { class: 'notes' }, r.notes);
  const go = h('button', { class: 'btn primary', id: 'updGo', onclick: async () => {
    go.disabled = true;
    if (window.xkNative && window.xkNative.mobile && xk.update.install && !r.canInstall) { xk.update.openPage(); return; }
    if (!r.canInstall) { xk.update.openPage(); go.disabled = false; return; }
    progress.style.display = '';
    const off = xk.update.onProgress(({ got, total }) => { if (total) bar.style.width = (got / total) * 100 + '%'; msg.textContent = total ? `下載中 ${Math.round((got / total) * 100)}%` : `下載中 ${(got / 1048576).toFixed(1)} MB`; });
    try {
      const file = await xk.update.download();
      off();
      msg.textContent = '安裝中，完成後會自動重新開啟…';
      await saveBeforeInstall();
      const out = await xk.update.install(file);
      if (out && out.manual) msg.textContent = `安裝檔已開啟：${out.path}`;
    } catch (e) { off(); go.disabled = false; msg.textContent = `更新失敗：${cleanErr(e)}`; }
  } }, r.canInstall ? '下載並安裝' : '前往下載頁');
  fill(box, h('p', {}, `有新版本 ${r.latest}（目前 ${r.current}）`), notes, progress, msg, h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: () => m.close() }, '稍後'), go));
}

async function saveBeforeInstall() { await xk.db.save(store.dump()); }
