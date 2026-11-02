// 專案更新、專案設定（一般、欄位、工作流程、封存、匯出匯入）、新增專案、首頁
import { h, fill, md, timeAgo, shortDate } from './util.js';
import { modal, row, menu, confirmBox, toast, promptBox, iconColorPicker } from './ui.js';
import { chip, avatar, memberList } from './cells.js';
import { store, S, me, refresh, openProject, openItem } from './state.js';
import { xk } from './platform.js';
import * as M from './core/model.js';
import { compileFilter } from './core/query.js';
import { TEMPLATES, WORKFLOWS, STATUS_HEALTH, FIELD_TYPES, today, addDays, COLORS } from './core/defs.js';
import { newFieldDialog } from './toolbar.js';

const health = (id) => STATUS_HEALTH.find((x) => x.id === id) || STATUS_HEALTH[0];

// ---- 專案更新 ----
export function renderUpdates(p, host) {
  const list = p.updates || [];
  fill(host, h('div', { class: 'page narrow' },
    h('div', { class: 'page-head' }, h('h3', {}, '📣 專案更新'), h('span', { class: 'sp' }), h('button', { class: 'btn primary', id: 'btnNewUpdate', onclick: () => updateDialog(p) }, '＋ 發布更新')),
    h('div', { class: 'status-card', style: { '--c': health(p.health).color } },
      h('span', { class: 'big' }, health(p.health).icon), h('div', {}, h('b', {}, health(p.health).name), h('small', { class: 'muted' }, [p.startDate && `開始 ${shortDate(p.startDate)}`, p.targetDate && `目標 ${shortDate(p.targetDate)}`].filter(Boolean).join('　') || '還沒有設定時程'))),
    list.length ? list.map((u) => h('article', { class: 'update', style: { '--c': health(u.health).color } },
      h('div', { class: 'cmt-head' }, chip(health(u.health).name, health(u.health).color, health(u.health).icon), h('b', {}, u.by || ''), h('small', { class: 'muted' }, timeAgo(u.at)), h('span', { class: 'sp' }),
        h('button', { class: 'icon-btn small', title: '刪除', 'aria-label': '刪除更新', onclick: async () => { if (await confirmBox('要刪除這則更新嗎？', { ok: '刪除', danger: true })) store.tx('刪除更新', () => { store.touch('project', p); p.updates = p.updates.filter((x) => x.id !== u.id); }); } }, '✕')),
      h('div', { class: 'md', html: md(u.text) }))) : h('p', { class: 'empty' }, '還沒有更新。定期寫幾句話，讓大家知道專案現在的狀況。')));
}

function updateDialog(p) {
  let cur = p.health === 'none' ? 'ontrack' : p.health;
  const seg = h('div', { class: 'health-pick' }, STATUS_HEALTH.filter((x) => x.id !== 'none').map((x) => h('button', { class: `hp ${x.id === cur ? 'on' : ''}`, style: { '--c': x.color }, onclick: (e) => { cur = x.id; [...seg.children].forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); } }, x.icon, ' ', x.name)));
  const start = h('input', { type: 'date', value: p.startDate || '' });
  const target = h('input', { type: 'date', value: p.targetDate || '' });
  const text = h('textarea', { rows: 6, placeholder: '這段時間完成了什麼？遇到什麼問題？接下來要做什麼？' });
  const aiBtn = S.settings.ai.hasKey && h('button', { class: 'btn small', onclick: () => { m.close(); import('./agent-ui.js').then((a) => a.askAgent(`幫我根據「${p.name}」目前的進度寫一則專案更新並發布`)); } }, '🤖 請小柯代寫');
  const m = modal({
    title: '發布專案更新', body: h('div', {}, h('div', { class: 'field' }, h('span', {}, '目前狀態'), seg), h('div', { class: 'form-grid' }, row('開始日', start), row('目標日', target)), row('內容', text), aiBtn),
    buttons: [{ label: '取消' }, { label: '發布', primary: true, onClick: (close) => { M.addUpdate(store, p, { health: cur, start: start.value, target: target.value, text: text.value.trim(), by: me() }); close(); } }],
  });
}

// ---- 專案設定 ----
const SET_TABS = [['general', '🏠', '一般'], ['fields', '🧱', '欄位'], ['flows', '⚡', '工作流程'], ['archive', '📦', '封存區'], ['data', '💾', '匯出匯入'], ['danger', '⚠️', '管理']];

export function renderSettings(p, host) {
  const body = h('div', { class: 'set-body' });
  fill(host, h('div', { class: 'page set' },
    h('nav', { class: 'set-nav' }, SET_TABS.map(([id, ic, t]) => h('button', { class: S.setTab === id ? 'on' : '', id: `set-${id}`, onclick: () => { S.setTab = id; refresh(true); } }, ic, ' ', t))),
    body));
  ({ general, fields, flows, archive, data, danger }[S.setTab] || general)(p, body);
}

const card = (title, ...kids) => h('section', { class: 'set-card' }, title && h('h4', {}, title), kids);
const savedText = (el, p, key, label) => { el.addEventListener('change', () => { if (el.value !== (p[key] || '')) M.updateProject(store, p, { [key]: el.value }, label); }); return el; };

function general(p, host) {
  const icon = h('button', { class: 'proj-icon big', id: 'projIcon', title: '更換小圖案與顏色', style: { '--c': p.color }, onclick: (e) => iconColorPicker(e.currentTarget, { icon: p.icon, color: p.color, onChange: (x) => M.updateProject(store, p, x, '修改專案外觀') }) }, p.icon);
  const name = savedText(h('input', { type: 'text', value: p.name }), p, 'name', '修改專案名稱');
  const desc = savedText(h('input', { type: 'text', value: p.desc || '' }), p, 'desc', '修改專案說明');
  const readme = savedText(h('textarea', { rows: 7, value: p.readme || '', placeholder: '這個專案的目標、規則、連結……（可用 Markdown）' }), p, 'readme', '修改專案說明文件');
  const add = h('input', { type: 'text', placeholder: '輸入名字按 Enter', onkeydown: (e) => { if (e.key === 'Enter' && !e.isComposing && e.target.value.trim()) { const n = e.target.value.trim(); if (!p.members.includes(n)) M.updateProject(store, p, { members: [...p.members, n] }, '新增成員'); } } });
  fill(host, 
    card('基本資料', h('div', { class: 'row-gap' }, icon, h('div', { class: 'grow' }, row('專案名稱', name), row('簡短說明', desc)))),
    card('說明文件', readme),
    card('專案成員', h('div', { class: 'members' }, memberList(p).map((n) => h('span', { class: 'member' }, avatar(n), n, p.members.includes(n) && h('button', { class: 'icon-btn small', title: '移除', 'aria-label': `移除 ${n}`, onclick: () => M.updateProject(store, p, { members: p.members.filter((x) => x !== n) }, '移除成員') }, '✕')))), add));
}

function fields(p, host) {
  fill(host, 
    h('div', { class: 'page-head' }, h('h4', {}, `共 ${p.fields.length} 個欄位`), h('span', { class: 'sp' }), h('button', { class: 'btn primary', id: 'btnNewField', onclick: () => newFieldDialog(p) }, '＋ 新增欄位')),
    p.fields.map((f) => fieldCard(p, f)));
}

function fieldCard(p, f) {
  const t = FIELD_TYPES[f.type];
  const rename = h('input', { type: 'text', value: f.name, 'aria-label': '欄位名稱', onchange: (e) => { const n = e.target.value.trim(); if (n) store.tx('重新命名欄位', () => { store.touch('project', p); f.name = n; }); } });
  const del = !f.sys && h('button', { class: 'btn small danger', onclick: async () => { if (await confirmBox(`要刪除欄位「${f.name}」嗎？所有項目上的這個欄位值都會清除。`, { ok: '刪除', danger: true })) M.deleteField(store, p, f.id); } }, '刪除');
  return h('section', { class: 'set-card fcard', dataset: { fid: f.id } },
    h('div', { class: 'row-gap' }, h('span', { class: 'ty' }, t ? t.icon : '🔒'), rename, h('small', { class: 'muted' }, t ? t.name : '內建'), h('span', { class: 'sp' }), del),
    (f.type === 'select' || f.type === 'multi') && optionEditor(p, f),
    f.type === 'iteration' && iterEditor(p, f));
}

function optionEditor(p, f) {
  const edit = (fn, label = '修改選項') => store.tx(label, () => { store.touch('project', p); fn(); });
  return h('div', { class: 'opts' }, f.options.map((o, i) => h('div', { class: 'opt-row' },
    h('button', { class: 'opt-look', title: '顏色與小圖案', 'aria-label': `${o.name} 顏色與小圖案`, style: { '--c': o.color }, onclick: (e) => iconColorPicker(e.currentTarget, { icon: o.icon, color: o.color, onChange: (x) => edit(() => Object.assign(o, x)) }) }, o.icon || '●'),
    h('input', { type: 'text', value: o.name, 'aria-label': '選項名稱', onchange: (e) => edit(() => { o.name = e.target.value.trim() || o.name; }) }),
    h('input', { type: 'text', class: 'grow', value: o.desc || '', placeholder: '說明（可不填）', 'aria-label': '選項說明', onchange: (e) => edit(() => { o.desc = e.target.value; }) }),
    f.id === 'status' && h('label', { class: 'chk', title: '這個狀態代表工作完成' }, h('input', { type: 'checkbox', checked: !!o.done, onchange: (e) => edit(() => { o.done = e.target.checked; }) }), '完成'),
    h('button', { class: 'icon-btn small', disabled: i === 0, title: '往上', 'aria-label': '往上', onclick: () => edit(() => { [f.options[i - 1], f.options[i]] = [f.options[i], f.options[i - 1]]; }) }, '↑'),
    h('button', { class: 'icon-btn small', disabled: i === f.options.length - 1, title: '往下', 'aria-label': '往下', onclick: () => edit(() => { [f.options[i + 1], f.options[i]] = [f.options[i], f.options[i + 1]]; }) }, '↓'),
    h('button', { class: 'icon-btn small', title: '刪除選項', 'aria-label': `刪除 ${o.name}`, onclick: async () => {
      if (f.id === 'status' && f.options.length <= 1) { toast('至少要留一個狀態', { type: 'warn' }); return; }
      if (await confirmBox(`要刪除選項「${o.name}」嗎？`, { ok: '刪除', danger: true })) M.deleteOption(store, p, f.id, o.id);
    } }, '✕'))),
  h('button', { class: 'btn small', onclick: async () => {
    const name = await promptBox('新增選項', { placeholder: '選項名稱' });
    if (name) edit(() => f.options.push({ id: M.uid('o_'), name, color: COLORS[(f.options.length + 2) % COLORS.length].c, icon: '' }), '新增選項');
  } }, '＋ 新增選項'));
}

function iterEditor(p, f) {
  const edit = (fn) => store.tx('修改迭代', () => { store.touch('project', p); fn(); });
  const list = M.iterationList(f);
  const t = today();
  return h('div', { class: 'opts' },
    h('label', { class: 'field inline' }, h('span', {}, '預設週期'), h('input', { type: 'number', min: 1, value: f.iter.days, onchange: (e) => edit(() => { f.iter.days = Math.max(1, Number(e.target.value) || 14); }) }), h('span', {}, '天')),
    list.map((x) => h('div', { class: 'opt-row' },
      h('input', { type: 'text', value: x.name, 'aria-label': '迭代名稱', onchange: (e) => edit(() => { x.name = e.target.value.trim() || x.name; }) }),
      h('input', { type: 'date', value: x.start, 'aria-label': '開始日', onchange: (e) => edit(() => { if (e.target.value) x.start = e.target.value; }) }),
      h('input', { type: 'number', min: 1, value: x.days, 'aria-label': '天數', onchange: (e) => edit(() => { x.days = Math.max(1, Number(e.target.value) || 1); }) }),
      h('small', { class: 'muted' }, `到 ${shortDate(M.iterEnd(x))}${x.start <= t && t <= M.iterEnd(x) ? '　目前' : ''}`), h('span', { class: 'sp' }),
      h('button', { class: 'icon-btn small', title: '刪除', 'aria-label': `刪除 ${x.name}`, onclick: () => edit(() => { f.iter.list = list.filter((y) => y.id !== x.id); }) }, '✕'))),
    h('button', { class: 'btn small', onclick: () => edit(() => list.push(M.nextIteration(f))) }, '＋ 新增迭代'));
}

function flows(p, host) {
  const st = M.statusField(p).options;
  const edit = (fn) => store.tx('修改工作流程', () => { store.touch('project', p); fn(); });
  fill(host, 
    h('p', { class: 'muted' }, '設定好之後，這些動作會自動完成，不用手動一項一項改。'),
    WORKFLOWS.map((w) => {
      const cfg = p.workflows[w.id] || (p.workflows[w.id] = { ...w.def });
      return h('section', { class: `set-card flow ${cfg.on ? 'on' : ''}` },
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: cfg.on, 'aria-label': w.name, onchange: (e) => edit(() => { cfg.on = e.target.checked; }) }), h('span', {})),
        h('div', { class: 'grow' }, h('b', {}, '⚡ ', w.name), h('small', { class: 'muted' }, w.desc),
          w.arg === 'status' && h('select', { 'aria-label': '狀態', onchange: (e) => edit(() => { cfg.status = e.target.value; }) }, st.map((o) => h('option', { value: o.id, selected: cfg.status === o.id }, `${o.icon || ''} ${o.name}`))),
          w.arg === 'filter' && h('div', {}, h('input', { type: 'text', value: cfg.filter || '', 'aria-label': '條件', onchange: (e) => edit(() => { cfg.filter = e.target.value; }) }), h('small', { class: 'muted' }, `目前有 ${store.items(p.id).filter(compileFilter(store, p, cfg.filter || '', { me: me() })).length} 項符合。自動封存每次開啟專案時檢查。`))));
    }));
}

function archive(p, host) {
  const list = store.items(p.id, { archived: true });
  fill(host, 
    h('p', { class: 'muted' }, `已封存 ${list.length} 個項目。封存的項目不會出現在檢視裡，可以隨時還原。`),
    list.map((it) => h('div', { class: 'arch' }, h('button', { class: 'link', onclick: () => openItem(it.id) }, `#${it.no} ${it.title}`), h('span', { class: 'sp' }),
      h('button', { class: 'btn small', onclick: () => M.archive(store, [it], false) }, '還原'),
      h('button', { class: 'btn small danger', onclick: async () => { if (await confirmBox(`要刪除「${it.title}」嗎？`, { ok: '刪除', danger: true })) M.deleteItems(store, [it]); } }, '刪除'))));
}

function data(p, host) {
  const stamp = today().replace(/-/g, '');
  const save = async (name, text) => { const r = await xk.file.saveText(name, text); if (r) toast('已匯出'); };
  const safe = p.name.replace(/[\\/:*?"<>|]/g, '_');
  fill(host, 
    card('匯出', h('p', { class: 'muted' }, 'CSV 可以用 Excel 開啟；JSON 是完整備份，可以再匯入。'),
      h('div', { class: 'row-gap' },
        h('button', { class: 'btn', onclick: () => save(`${safe}-${stamp}.csv`, M.toCSV(store, p, store.items(p.id))) }, '📄 匯出 CSV'),
        h('button', { class: 'btn', onclick: () => save(`${safe}-${stamp}.json`, JSON.stringify({ project: p, items: store.items(p.id, { archived: 'all' }) }, null, 1)) }, '📦 匯出 JSON'))),
    card('匯入', h('p', { class: 'muted' }, 'CSV 第一列是欄位名稱，至少要有「標題」，項目會加到這個專案；JSON 備份會還原成一個新專案。'),
      h('div', { class: 'row-gap' },
        h('button', { class: 'btn', onclick: async () => {
          try {
            const f = await xk.file.openText(['csv']);
            if (!f) return;
            const n = M.importCSV(store, p, f.text, me());
            toast(n ? `已匯入 ${n} 個項目` : '檔案裡沒有可以匯入的項目', { type: n ? 'info' : 'warn' });
          } catch (e) { toast(`匯入失敗：${e.message}`, { type: 'error' }); }
        } }, '📥 匯入 CSV'),
        h('button', { class: 'btn', onclick: async () => {
          try {
            const f = await xk.file.openText(['json']);
            if (!f) return;
            openProject(M.importJSON(store, f.text).id);
            toast('已還原成新專案');
          } catch (e) { toast(`匯入失敗：${e.message}`, { type: 'error' }); }
        } }, '📥 匯入 JSON 備份'))));
}

function danger(p, host) {
  fill(host, 
    card('複製專案', h('p', { class: 'muted' }, '當成範本重複使用：欄位、檢視、工作流程都會帶過去。'), h('div', { class: 'row-gap' },
      h('button', { class: 'btn', onclick: () => { const c = M.copyProject(store, p); openProject(c.id); } }, '📑 只複製設定'),
      h('button', { class: 'btn', onclick: () => { const c = M.copyProject(store, p, { withItems: true }); openProject(c.id); } }, '📑 連項目一起複製'))),
    card(p.closed ? '重新開啟專案' : '關閉專案', h('p', { class: 'muted' }, '關閉的專案會收到側邊欄最下面，資料都還在。'),
      h('button', { class: 'btn', id: 'btnCloseProject', onclick: () => M.updateProject(store, p, { closed: !p.closed }, p.closed ? '重新開啟專案' : '關閉專案') }, p.closed ? '↩ 重新開啟' : '🔒 關閉專案')),
    card('刪除專案', h('p', { class: 'muted' }, '專案和裡面所有項目都會刪除。'),
      h('button', { class: 'btn danger', onclick: async () => {
        if (await confirmBox(`確定要刪除專案「${p.name}」和裡面 ${store.items(p.id, { archived: 'all' }).length} 個項目嗎？`, { ok: '刪除', danger: true })) { M.deleteProject(store, p); S.pid = null; S.page = 'home'; refresh(true); toast('專案已刪除', { action: { label: '復原', onClick: () => store.undo() } }); }
      } }, '🗑️ 刪除專案')));
}

// ---- 新增專案 ----
export function newProjectDialog() {
  let tpl = 'kanban', icon = '', color = '';
  const name = h('input', { type: 'text', placeholder: '例如：小柯官網改版' });
  const grid = h('div', { class: 'tpl-grid' }, TEMPLATES.map((t) => h('button', { class: `tpl ${t.id === tpl ? 'on' : ''}`, style: { '--c': t.color }, dataset: { tpl: t.id }, onclick: (e) => { tpl = t.id; icon = ''; color = ''; [...grid.children].forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); paintLook(); } }, h('span', { class: 'big' }, t.icon), h('b', {}, t.name), h('small', {}, t.desc))));
  const look = h('button', { class: 'proj-icon big', title: '更換小圖案與顏色', 'aria-label': '更換小圖案與顏色', onclick: (e) => { const t = TEMPLATES.find((x) => x.id === tpl); iconColorPicker(e.currentTarget, { icon: icon || t.icon, color: color || t.color, onChange: (x) => { icon = x.icon; color = x.color; paintLook(); } }); } });
  const paintLook = () => { const t = TEMPLATES.find((x) => x.id === tpl); look.textContent = icon || t.icon; look.style.setProperty('--c', color || t.color); };
  paintLook();
  const create = (close) => {
    const n = name.value.trim();
    if (!n) { name.focus(); return; }
    const p = M.createProject(store, { name: n, template: tpl, icon: icon || undefined, color: color || undefined });
    if (me()) M.updateProject(store, p, { members: [me()] }, '');
    close();
    openProject(p.id);
  };
  const m = modal({
    title: '新增專案', wide: true,
    body: h('div', {}, h('div', { class: 'row-gap' }, look, h('div', { class: 'grow' }, row('專案名稱', name))), h('div', { class: 'field' }, h('span', {}, '從範本開始'), grid)),
    buttons: [{ label: '取消' }, { label: '建立專案', primary: true, onClick: create }],
  });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) create(m.close); });
}

// ---- 首頁 ----
export function renderHome(host) {
  const all = store.projects().filter((p) => !p.closed);
  const t = today();
  const stats = all.map((p) => ({ p, s: M.summary(store, p, t) }));
  const sum = (fn) => stats.reduce((a, x) => a + fn(x.s), 0);
  const stat = (label, n, icon, c) => h('div', { class: 'stat', style: { '--c': c } }, h('span', { class: 'big' }, icon), h('div', {}, h('b', {}, n), h('small', {}, label)));
  const line = (p, it) => {
    const st = M.option(M.statusField(p), it.v.status);
    return h('button', { class: 'home-row', onclick: () => { openProject(p.id); openItem(it.id); } }, h('span', {}, p.icon), h('span', { class: 'no' }, `#${it.no}`), h('span', { class: 'tt' }, it.title), st && chip(st.name, st.color, st.icon), it.v.due && h('span', { class: `date ${it.v.due < t ? 'late' : ''}` }, shortDate(it.v.due)));
  };
  const mine = stats.flatMap(({ p }) => store.items(p.id).filter((i) => !i.closed && (i.v.assignees || []).includes(me())).map((i) => [p, i]));
  const urgent = stats.flatMap(({ p, s }) => [...s.overdue, ...s.soon].map((i) => [p, i])).sort((a, b) => a[1].v.due.localeCompare(b[1].v.due));
  const hello = () => { const hr = new Date().getHours(); return hr < 11 ? '早安' : hr < 14 ? '午安' : hr < 18 ? '下午好' : '晚安'; };

  fill(host, h('div', { class: 'page home' },
    h('header', { class: 'hero' }, h('img', { src: 'img/robot96.png', alt: '', width: 72, height: 72 }), h('div', {}, h('h2', {}, !me() || me() === '我' ? `${hello()}！` : `${hello()}，${me()}！`), h('p', { class: 'muted' }, urgent.length ? `有 ${urgent.length} 個項目快到期或已逾期，小柯幫您整理好了。` : '目前沒有快到期的工作，繼續保持！'))),
    h('div', { class: 'stats' }, stat('進行中專案', all.length, '📋', '#3b82f6'), stat('開啟的項目', sum((s) => s.open), '📝', '#6366f1'), stat('已逾期', sum((s) => s.overdue.length), '🔥', '#ef4444'), stat('七天內到期', sum((s) => s.soon.length), '⏰', '#eab308'), stat('已完成', sum((s) => s.closed), '✅', '#22c55e')),
    h('div', { class: 'page-head' }, h('h3', {}, '我的專案'), h('span', { class: 'sp' }), h('button', { class: 'btn primary', id: 'btnNewProject', onclick: newProjectDialog }, '＋ 新增專案')),
    all.length ? h('div', { class: 'proj-grid' }, stats.map(({ p, s }) => h('button', { class: 'proj-card', style: { '--c': p.color }, onclick: () => openProject(p.id) },
      h('div', { class: 'pc-top' }, h('span', { class: 'proj-icon', style: { '--c': p.color } }, p.icon), h('b', {}, p.name), h('span', { class: 'sp' }), p.health !== 'none' && h('span', { title: health(p.health).name }, health(p.health).icon)),
      h('small', { class: 'muted pc-desc' }, p.desc || ' '),
      h('span', { class: 'bar lg' }, h('span', { style: { width: s.pct + '%' } })),
      h('div', { class: 'pc-foot' }, h('small', {}, `${s.closed}/${s.total} 完成`), s.overdue.length > 0 && h('small', { class: 'late' }, `🔥 逾期 ${s.overdue.length}`), h('span', { class: 'sp' }), h('small', { class: 'muted' }, `${s.pct}%`))))) : h('p', { class: 'empty' }, '還沒有專案，按「新增專案」開始吧！'),
    h('div', { class: 'home-cols' },
      h('section', { class: 'set-card' }, h('h4', {}, '⏰ 快到期與逾期'), urgent.length ? urgent.slice(0, 12).map(([p, i]) => line(p, i)) : h('p', { class: 'muted' }, '沒有快到期的項目')),
      h('section', { class: 'set-card' }, h('h4', {}, '👤 指派給我'), mine.length ? mine.slice(0, 12).map(([p, i]) => line(p, i)) : h('p', { class: 'muted' }, '沒有指派給您的項目')))));
}

// 第一次使用時的示範專案
export function seedDemo() {
  const p = M.createProject(store, { name: '小柯示範專案', template: 'dev', desc: '這是示範資料，可以隨意修改或到專案設定刪除', icon: '🤖', color: '#6366f1' });
  const who = me() || '我';
  const iter = M.fieldOf(p, 'iteration').iter.list;
  store.tx('', () => {
    M.updateProject(store, p, { members: [who, '小明', '小華'] }, '');
    const add = (title, v, parent) => M.addItem(store, p, { title, v: { iteration: iter[0].id, ...v }, parent, by: who });
    for (const it of store.items(p.id)) { M.setValue(store, p, it, 'start', addDays(today(), -5), who); M.setValue(store, p, it, 'due', addDays(today(), 6), who); M.setValue(store, p, it, 'assignees', [who], who); M.setValue(store, p, it, 'iteration', iter[0].id, who); }
    const big = add('手機版介面', { status: 'doing', kind: 'feature', priority: 'p1', labels: ['l1'], assignees: ['小明'], estimate: 12, start: addDays(today(), 1), due: addDays(today(), 20) });
    add('畫面草圖', { status: 'done', kind: 'task', assignees: ['小明'], estimate: 3 }, big.id);
    add('底部導覽列', { status: 'doing', kind: 'task', assignees: ['小明'], estimate: 4 }, big.id);
    add('深色模式', { status: 'todo', kind: 'task', estimate: 5 }, big.id);
    add('語音說明補上說明圖', { status: 'todo', kind: 'doc', priority: 'p3', labels: ['l3'], assignees: ['小華'], due: addDays(today(), 12), start: addDays(today(), 8), estimate: 2 });
    add('匯出報表時間錯誤', { status: 'review', kind: 'bug', priority: 'p0', labels: ['l2'], assignees: ['小華'], due: addDays(today(), -1), start: addDays(today(), -4), estimate: 2 });
  });
  store.undoStack.length = 0;
  return p;
}

export { menu };
