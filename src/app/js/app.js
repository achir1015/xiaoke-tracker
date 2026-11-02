// 主程式：載入資料、畫面組裝、同步、快捷鍵
import { h, $, $$, debounce } from './util.js';
import { toast, modal, iconColorPicker, popover, closePopover } from './ui.js';
import { xk } from './platform.js';
import { store, S, hooks, me, project, view, refresh, openItem, openProject } from './state.js';
import { Sync } from './core/sync.js';
import * as M from './core/model.js';
import { compileFilter } from './core/query.js';
import { today } from './core/defs.js';
import { viewTabs, filterBar, slicePanel } from './toolbar.js';
import { renderTable, bulkBar } from './table.js';
import { renderBoard } from './board.js';
import { renderRoadmap } from './roadmap.js';
import { renderDetail } from './detail.js';
import { renderInsights } from './insights-ui.js';
import { renderUpdates, renderSettings, renderHome, newProjectDialog, seedDemo } from './project-pages.js';
import { toggleAgent } from './agent-ui.js';
import { openSettings, applyTheme, checkUpdateQuiet, openUpdate } from './app-settings.js';
import { openGuide } from './guide.js';
import { voice } from './voice.js';

// ---- 雲端同步 ----
let sync = null;
const syncDebounced = debounce(() => { if (canSync()) sync.run().catch(() => {}); }, 4000);
const canSync = () => S.settings.sync.hasToken && S.settings.sync.url && S.settings.sync.auto;

export const cloud = {
  state: () => (sync ? sync.state : { status: 'off' }),
  run: () => sync.run(),
  // 第一次連上：雲端已經有資料時，本機沒動過的示範專案不要傳上去
  first: async (remoteCount) => {
    if (remoteCount > 0 && !S.settings.sync.cursor) {
      for (const p of store.projects().filter((x) => x.demo && !x.touched)) {
        for (const it of store.items(p.id, { archived: 'all' })) { delete store.db.items[it.id]; delete store.dirty['item:' + it.id]; }
        delete store.db.projects[p.id];
        delete store.dirty['project:' + p.id];
      }
      if (S.pid && !store.project(S.pid)) { S.pid = null; S.page = 'home'; }
    }
    const r = await sync.run();
    refresh(true);
    return r;
  },
};

function paintSync() {
  const el = $('#syncState');
  if (!el) return;
  const st = sync ? sync.state : { status: 'off' };
  const pending = Object.keys(store.dirty).length;
  let icon = '💾', text = '單機模式';
  if (S.settings.sync.hasToken) {
    if (st.status === 'syncing') { icon = '🔄'; text = '同步中…'; } else if (st.status === 'error') { icon = '⚠️'; text = '同步失敗'; } else if (pending) { icon = '☁️'; text = `待同步 ${pending} 筆`; } else if (st.at) { icon = '✅'; text = '已同步'; } else { icon = '☁️'; text = '已設定同步'; }
  }
  el.replaceChildren(h('span', {}, icon), h('span', {}, text));
  el.title = st.status === 'error' ? st.error : '';
}

// ---- 側邊欄 ----
function renderSide() {
  const all = store.projects();
  const open = all.filter((p) => !p.closed), closed = all.filter((p) => p.closed);
  const item = (p) => {
    const s = M.summary(store, p);
    return h('button', { class: `side-item ${S.page === 'project' && S.pid === p.id ? 'on' : ''}`, style: { '--c': p.color }, onclick: () => openProject(p.id) },
      h('span', { class: 'proj-icon small', style: { '--c': p.color } }, p.icon), h('span', { class: 'tt' }, p.name),
      s.overdue.length > 0 ? h('span', { class: 'badge late', title: `逾期 ${s.overdue.length}` }, s.overdue.length) : h('span', { class: 'count' }, s.open));
  };
  $('#sideProjects').replaceChildren(...open.map(item), ...(closed.length ? [h('details', { class: 'closed-list' }, h('summary', {}, `已關閉（${closed.length}）`), closed.map(item))] : []));
  $('#navHome').classList.toggle('on', S.page === 'home');
  const cur = project();
  $('#topTitle').textContent = S.page === 'project' && cur ? `${cur.icon} ${cur.name}` : '小柯專案追蹤';
  document.body.classList.toggle('side-hidden', !S.settings.sidebar);
}

// ---- 主畫面 ----
function renderBody() {
  const p = project(), v = view();
  const host = $('#viewBody');
  if (!p || !v || !host) return;
  if (v.layout === 'board') renderBoard(p, v, host);
  else if (v.layout === 'roadmap') renderRoadmap(p, v, host);
  else renderTable(p, v, host);
  const c = $('.count-all');
  if (c) c.textContent = `${$$('.row, .card, .rm-row[data-id]', host).length} 項`;
}

function renderMain() {
  const main = $('#main');
  if (S.page === 'home' || !project()) { S.page = 'home'; document.documentElement.style.removeProperty('--accent'); renderHome(main); return; }
  const p = project();
  if (S.tab === 'view' && !p.views.find((x) => x.id === S.vid)) S.vid = p.views[0].id;
  const v = view();
  document.documentElement.style.setProperty('--accent', p.color);
  const head = h('header', { class: 'p-head' },
    h('button', { class: 'proj-icon', id: 'projLook', title: '更換小圖案與顏色', 'aria-label': '更換小圖案與顏色', style: { '--c': p.color }, onclick: (e) => iconColorPicker(e.currentTarget, { icon: p.icon, color: p.color, onChange: (x) => M.updateProject(store, p, x, '修改專案外觀') }) }, p.icon),
    h('div', { class: 'p-title' }, h('h2', {}, p.name, p.closed && h('small', { class: 'muted' }, '（已關閉）')), p.desc && h('small', { class: 'muted' }, p.desc)),
    h('span', { class: 'sp' }));
  const wrap = [head, viewTabs(p)];
  if (S.tab === 'view') {
    const slice = slicePanel(p, v);
    wrap.push(filterBar(p, v, renderBody));
    const bulk = bulkBar(p);
    if (bulk) wrap.push(bulk);
    wrap.push(h('div', { class: 'view-area' }, slice, h('div', { id: 'viewBody', class: `view-${v.layout}` })));
    main.replaceChildren(...wrap);
    renderBody();
  } else {
    const host = h('div', { class: 'tab-body' });
    wrap.push(host);
    main.replaceChildren(...wrap);
    ({ insights: renderInsights, updates: renderUpdates, settings: renderSettings })[S.tab](p, host);
  }
}

// 打字時不重畫（同步進來的資料等離開輸入框再更新），捲動位置要保留
let pending = false, scheduled = false, wantFull = false;
const SCROLLERS = ['.tbl-wrap', '.board', '.lanes', '.page', '.tab-body', '.d-scroll', '#main'];
function render() {
  scheduled = false;
  const a = document.activeElement;
  const typing = a && a.matches('input:not([type=checkbox]):not(.quick-add),textarea') && a.closest('#main,#detail');
  if (typing && !wantFull) { pending = true; return; }
  wantFull = false; pending = false;
  const keep = SCROLLERS.map((s) => { const el = $(s); return el ? [s, el.scrollTop, el.scrollLeft] : null; }).filter(Boolean);
  const cols = $$('.col-body').map((c) => c.scrollTop);
  renderSide();
  renderMain();
  renderDetail($('#detail'));
  paintSync();
  for (const [s, t, l] of keep) { const el = $(s); if (el) { el.scrollTop = t; el.scrollLeft = l; } }
  $$('.col-body').forEach((c, i) => { if (cols[i]) c.scrollTop = cols[i]; });
  if (S.refocus) {
    const el = $(`[data-key="${CSS.escape(S.refocus)}"]`);
    S.refocus = null;
    if (el) { el.focus(); const col = el.previousElementSibling; if (col && col.classList.contains('col-body')) col.scrollTop = col.scrollHeight; }
  }
}
hooks.refresh = (full) => {
  if (full) wantFull = true;
  if (scheduled) return;
  scheduled = true;
  setTimeout(render, 0);
};
hooks.open = (pid) => {
  S.page = 'project'; S.pid = pid; S.tab = 'view'; S.vid = null; S.liveFilter = null; S.itemId = null; S.selected.clear();
  const p = store.project(pid);
  if (p) { const n = M.sweep(store, p, me()); if (n) toast(`已自動封存 ${n} 個項目`); }
  refresh(true);
};
hooks.openItem = (id) => { S.itemId = id; refresh(); };

// ---- 搜尋 ----
function openSearch() {
  const input = h('input', { type: 'text', id: 'searchInput', placeholder: '搜尋所有專案的項目，也可以用篩選語法', 'aria-label': '搜尋' });
  const list = h('div', { class: 'search-list' });
  const go = (p, it) => { m.close(); if (S.pid !== p.id || S.page !== 'project') openProject(p.id); if (it) openItem(it.id); };
  const paint = () => {
    const q = input.value.trim();
    const rows = [];
    for (const p of store.projects()) {
      if (q && p.name.toLowerCase().includes(q.toLowerCase())) rows.push(h('button', { class: 'home-row', onclick: () => go(p) }, h('span', {}, p.icon), h('b', { class: 'tt' }, p.name), h('small', { class: 'muted' }, '專案')));
      if (q) for (const it of store.items(p.id, { archived: 'all' }).filter(compileFilter(store, p, q, { me: me() })).slice(0, 30)) rows.push(h('button', { class: 'home-row', onclick: () => go(p, it) }, h('span', {}, p.icon), h('span', { class: 'no' }, `#${it.no}`), h('span', { class: `tt ${it.closed ? 'done' : ''}` }, it.title), h('small', { class: 'muted' }, p.name)));
    }
    list.replaceChildren(...(rows.length ? rows.slice(0, 50) : [h('p', { class: 'muted pad' }, q ? '找不到符合的項目' : '輸入關鍵字開始搜尋')]));
  };
  input.addEventListener('input', paint);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) list.querySelector('button')?.click(); });
  const m = modal({ title: '搜尋', body: h('div', {}, input, list) });
  paint();
}

// 說明要示範某種版面時，先切到有那種版面的專案
async function guideNav(lesson) {
  let p = project() || store.projects()[0];
  if (!p) return;
  if (S.pid !== p.id || S.page !== 'project') openProject(p.id);
  S.tab = 'view';
  if (lesson.layout) { const v = p.views.find((x) => x.layout === lesson.layout); if (v) S.vid = v.id; }
  refresh(true);
  await new Promise((r) => setTimeout(r, 60));
}

function shortcuts(e) {
  const mod = e.ctrlKey || e.metaKey;
  const inField = e.target.matches('input,textarea,select');
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
  if (mod && e.key.toLowerCase() === 'z' && !inField) { e.preventDefault(); const l = e.shiftKey ? store.redo() : store.undo(); if (l) toast(`${e.shiftKey ? '重做' : '復原'}：${l}`); return; }
  if (mod && e.key.toLowerCase() === 'y' && !inField) { e.preventDefault(); const l = store.redo(); if (l) toast(`重做：${l}`); return; }
  if (e.key === 'Escape' && !$('.modal-back') && !inField && S.itemId) { S.itemId = null; refresh(); }
}

function notifyDue() {
  if (!S.settings.notify) return;
  const key = 'xk-tracker-notified';
  const t = today();
  let last = '';
  try { last = localStorage.getItem(key) || ''; } catch {}
  if (last === t) return;
  let late = 0, soon = 0;
  for (const p of store.projects()) { if (p.closed) continue; const s = M.summary(store, p, t); late += s.overdue.length; soon += s.soon.length; }
  if (late || soon) xk.notify('小柯機器人專案追蹤工具', [late && `${late} 個項目已逾期`, soon && `${soon} 個項目七天內到期`].filter(Boolean).join('，'));
  try { localStorage.setItem(key, t); } catch {}
}

// 手機的返回鍵：一層一層關，都關完才讓 App 處理（回傳 true 表示已經處理）
window.__xkBack = () => {
  if ($('.spot')) { $('.spot').click(); return true; }
  if ($('.pop')) { closePopover(); return true; }
  const m = $$('.modal-back').at(-1);
  if (m) { (m.querySelector('.modal-head .icon-btn') || m.querySelector('.modal-foot .btn'))?.click(); return true; }
  if (document.body.classList.contains('side-open')) { document.body.classList.remove('side-open'); return true; }
  if ($('#agent').classList.contains('open')) { toggleAgent(false); return true; }
  if (S.itemId) { S.itemId = null; refresh(); return true; }
  if (S.page === 'project') { S.page = 'home'; S.pid = null; refresh(true); return true; }
  return false;
};

function buildShell() {
  $('#topbar').replaceChildren(
    h('button', { class: 'icon-btn', id: 'btnMenu', 'aria-label': '選單', onclick: () => document.body.classList.toggle('side-open') }, '☰'),
    h('b', { id: 'topTitle' }, '小柯專案追蹤'),
    h('span', { class: 'sp' }),
    h('button', { class: 'icon-btn', id: 'btnUndo', title: '復原', 'aria-label': '復原', onclick: () => { const l = store.undo(); toast(l ? `復原：${l}` : '沒有可以復原的動作'); } }, '↩'),
    h('button', { class: 'icon-btn', id: 'btnTopAgent', 'aria-label': '小柯助手', onclick: () => toggleAgent() }, h('img', { src: 'img/robot96.png', alt: '', width: 24, height: 24 })));
  $('#sideBack').addEventListener('click', () => document.body.classList.remove('side-open'));
  $('#side').addEventListener('click', (e) => { if (e.target.closest('button')) document.body.classList.remove('side-open'); });
  $('#side').replaceChildren(
    h('div', { class: 'brand' }, h('img', { src: 'img/logo64.png', alt: '', width: 36, height: 36 }), h('div', {}, h('b', {}, '小柯專案追蹤'))),
    h('button', { class: 'side-nav', id: 'navHome', onclick: () => { S.page = 'home'; S.pid = null; S.itemId = null; refresh(true); } }, h('span', {}, '🏠'), '首頁'),
    h('button', { class: 'side-nav', id: 'navSearch', onclick: openSearch }, h('span', {}, '🔍'), '搜尋', h('kbd', {}, 'Ctrl K')),
    h('div', { class: 'side-title' }, h('span', {}, '專案'), h('button', { class: 'icon-btn small', id: 'btnSideNew', title: '新增專案', 'aria-label': '新增專案', onclick: newProjectDialog }, '＋')),
    h('div', { id: 'sideProjects' }),
    h('div', { class: 'side-foot' },
      h('button', { class: 'side-nav', id: 'btnAgent', onclick: () => toggleAgent() }, h('img', { src: 'img/robot96.png', alt: '', width: 20, height: 20 }), '小柯助手'),
      h('button', { class: 'side-nav', id: 'btnGuide', onclick: () => openGuide(undefined, guideNav) }, h('span', {}, '🎓'), '使用說明'),
      h('button', { class: 'side-nav', id: 'btnUpdate', onclick: () => openUpdate() }, h('span', {}, '⬆️'), '檢查更新'),
      h('button', { class: 'side-nav', id: 'btnSettings', onclick: () => openSettings() }, h('span', {}, '⚙️'), '設定'),
      h('button', { class: 'sync-state', id: 'syncState', onclick: () => openSettings('sync') })));
}

function welcome() {
  const m = modal({
    title: '歡迎使用小柯機器人專案追蹤工具', cls: 'welcome',
    body: h('div', { class: 'wel' }, h('img', { src: 'img/robot96.png', alt: '', width: 96, height: 96 }), h('p', {}, '您好，我是小柯！我幫您準備了一個示範專案，您可以直接點點看。'), h('p', { class: 'muted' }, '想聽我介紹的話，按下面的「聽小柯介紹」。')),
    buttons: [{ label: '先自己看看', value: false }, { label: '🔊 聽小柯介紹', primary: true, value: true }],
  });
  m.done.then((go) => { xk.settings.set({ welcomed: true }).then((s) => { S.settings = s; }); if (go) openGuide(0, guideNav); });
}

async function boot() {
  S.settings = await xk.settings.get();
  S.sysInfo = await xk.sys.info();
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  voice.configure({ enabled: S.settings.voice.enabled, rate: S.settings.voice.rate, name: S.settings.voice.name });

  const saved = await xk.db.load();
  if (saved) store.load(saved);
  for (const it of Object.values(store.db.items)) if (it.u > store.lastU) store.lastU = it.u;

  const save = debounce(() => { xk.db.save(store.dump()); }, 300);
  store.onPersist = save;
  store.on((info) => {
    const cur = project();
    if (info.label && cur && cur.demo) cur.touched = true;
    refresh(!info.remote); // 自己改的立刻顯示；同步進來的等離開輸入框再畫
    paintSync();
    if (!info.remote) { syncDebounced(); }
  });

  sync = new Sync(store, (body) => xk.sync.post(body), {
    getCursor: () => S.settings.sync.cursor,
    setCursor: (x) => { S.settings.sync.cursor = x; xk.settings.set({ sync: { cursor: x } }); },
  });
  sync.onState = paintSync;

  buildShell();
  if (!saved) {
    const p = seedDemo();
    store.db.projects[p.id].demo = true;
    S.page = 'project'; S.pid = p.id;
  } else if (store.projects().length === 1) { S.page = 'project'; S.pid = store.projects()[0].id; }

  document.documentElement.dataset.platform = xk.platform;
  document.documentElement.dataset.ready = '1';
  render();
  addEventListener('focusout', () => setTimeout(() => { if (pending) refresh(); }, 0));
  addEventListener('keydown', shortcuts);
  // 手機切到背景時不一定會關閉 App：先存檔、同步；回來時再同步一次
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { save.cancel(); xk.db.save(store.dump()); }
    if (canSync()) sync.run().catch(() => {});
  });
  if (!S.settings.welcomed) welcome();

  // 開啟時自動做好：同步、提醒、檢查更新
  if (canSync()) sync.run().catch(() => {});
  setInterval(() => { if (canSync() && !document.hidden) sync.run().catch(() => {}); }, 60000);
  setTimeout(notifyDue, 1500);
  if (S.settings.autoUpdate) setTimeout(checkUpdateQuiet, 4000);

  // 關閉視窗前存檔並同步一次，然後把語音、請求都停掉
  xk.onBeforeQuit(async () => {
    voice.stop();
    save.cancel();
    try {
      await xk.db.save(store.dump());
      if (canSync() && Object.keys(store.dirty).length) { await Promise.race([sync.run().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]); await xk.db.save(store.dump()); }
    } finally { xk.quitReady(); }
  });
}

boot().catch((e) => { document.body.append(h('pre', { class: 'fatal' }, `啟動失敗：${e.stack || e}`)); });

export { popover, closePopover };
