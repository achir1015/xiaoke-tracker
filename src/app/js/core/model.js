// 專案與項目的操作（新增、修改、自動化工作流程、匯出）；畫面和 AI 助手都呼叫這裡
import { baseFields, defaultViews, defaultCharts, TEMPLATES, WORKFLOWS, addDays, today, diffDays } from './defs.js';
import { compileFilter } from './query.js';

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---- 欄位工具 ----
export const fieldOf = (p, id) => p.fields.find((f) => f.id === id) || null;
export const option = (f, id) => (f && f.options ? f.options.find((o) => o.id === id) || null : null);
export const statusField = (p) => fieldOf(p, 'status');
export const doneOptions = (p) => statusField(p).options.filter((o) => o.done).map((o) => o.id);
export const openStatus = (p) => (statusField(p).options.find((o) => !o.done) || statusField(p).options[0]);

export function iterationList(f) { return (f.iter && f.iter.list) || []; }
export function iterationOf(f, id) { return iterationList(f).find((x) => x.id === id) || null; }
export function iterEnd(it) { return addDays(it.start, it.days - 1); }

// 往後加一個迭代：接在最後一個後面，週期沿用設定
export function nextIteration(f) {
  const list = iterationList(f);
  const last = list[list.length - 1];
  const days = (f.iter && f.iter.days) || 14;
  const start = last ? addDays(iterEnd(last), 1) : today();
  return { id: uid('it_'), name: `${f.name} ${list.length + 1}`, start, days };
}

// 欄位的值
export function val(item, f) {
  if (f.type === 'title') return item.title;
  if (f.id === 'parent') return item.parent || null;
  if (f.type === 'updated') return item.u;
  return item.v ? item.v[f.id] : undefined;
}

export function subProgress(store, item) {
  const kids = store.children(item.id).filter((k) => !k.archived);
  return { done: kids.filter((k) => k.closed).length, total: kids.length };
}

// 給人看的文字（篩選、搜尋、匯出、AI 都用）
export function textOf(store, p, item, f) {
  const v = val(item, f);
  switch (f.type) {
    case 'title': case 'text': return v || '';
    case 'number': return v == null ? '' : String(v);
    case 'date': return v || '';
    case 'select': { const o = option(f, v); return o ? o.name : ''; }
    case 'multi': return (v || []).map((id) => { const o = option(f, id); return o ? o.name : ''; }).filter(Boolean).join(', ');
    case 'people': return (v || []).join(', ');
    case 'iteration': { const it = iterationOf(f, v); return it ? it.name : ''; }
    case 'progress': { const s = subProgress(store, item); return s.total ? `${s.done}/${s.total}` : ''; }
    case 'parent': { const it = v && store.item(v); return it ? it.title : ''; }
    case 'link': return (v || []).map((l) => l.url).join(' ');
    case 'updated': return v ? new Date(v).toLocaleString('zh-TW') : '';
    default: return v == null ? '' : String(v);
  }
}

// ---- 專案 ----
export function createProject(store, { name, template = 'blank', icon, color, desc } = {}) {
  const tpl = TEMPLATES.find((t) => t.id === template) || TEMPLATES[0];
  const now = store.now();
  const fields = baseFields();
  if (tpl.status) fields.find((f) => f.id === 'status').options = clone(tpl.status);
  const p = {
    id: uid('p_'), name: name || tpl.name, icon: icon || tpl.icon, color: color || tpl.color, desc: desc || tpl.desc || '',
    readme: '', closed: false, createdAt: now, fields, views: defaultViews(), charts: defaultCharts(),
    members: [], updates: [], health: 'none', workflows: Object.fromEntries(WORKFLOWS.map((w) => [w.id, { ...w.def }])),
  };
  const st = fields.find((f) => f.id === 'status').options;
  const pickStatus = (id) => (st.find((o) => o.id === id) ? id : st[0].id);
  p.workflows.added.status = st[0].id;
  p.workflows.closed.status = (st.find((o) => o.done) || st[st.length - 1]).id;
  p.workflows.reopened.status = pickStatus('doing');
  p.workflows.assigned.status = pickStatus('doing');
  if (tpl.startView) { const i = p.views.findIndex((v) => v.id === tpl.startView); if (i > 0) p.views.unshift(p.views.splice(i, 1)[0]); }
  if (tpl.iter) {
    const f = fields.find((x) => x.id === 'iteration');
    for (let i = 0; i < 3; i++) f.iter.list.push(nextIteration(f));
  }
  store.tx(`新增專案「${p.name}」`, () => {
    store.put('project', p);
    tpl.items.forEach(([title, status, kind, priority]) => addItem(store, p, { title, v: { status: pickStatus(status), kind, priority } }));
  });
  return p;
}

export function copyProject(store, src, { name, withItems = false } = {}) {
  const p = clone(src);
  p.id = uid('p_'); p.name = name || `${src.name}（副本）`; p.createdAt = store.now(); p.closed = false; p.updates = []; p.health = 'none';
  store.tx(`複製專案「${src.name}」`, () => {
    store.put('project', p);
    if (withItems) {
      const map = {};
      for (const it of store.items(src.id)) {
        const n = clone(it);
        n.id = uid('i_'); map[it.id] = n.id; n.pid = p.id; n.comments = []; n.activity = [];
        store.put('item', n);
      }
      for (const id of Object.values(map)) { const n = store.db.items[id]; if (n.parent) n.parent = map[n.parent] || null; }
    }
  });
  return p;
}

export function updateProject(store, p, patch, label = '修改專案') {
  store.tx(label, () => { store.touch('project', p); Object.assign(p, patch); });
}

export function deleteProject(store, p) {
  store.tx(`刪除專案「${p.name}」`, () => {
    for (const it of store.items(p.id, { archived: 'all' })) store.remove('item', it);
    store.remove('project', p);
  });
}

// ---- 欄位 ----
export function addField(store, p, { name, type, options, iter }) {
  const f = { id: uid('f_'), name, type };
  if (type === 'select' || type === 'multi') f.options = options || [];
  if (type === 'iteration') f.iter = iter || { days: 14, list: [] };
  store.tx(`新增欄位「${name}」`, () => { store.touch('project', p); p.fields.push(f); });
  return f;
}

export function deleteField(store, p, fid) {
  const f = fieldOf(p, fid);
  if (!f || f.sys) throw new Error('內建欄位不能刪除');
  store.tx(`刪除欄位「${f.name}」`, () => {
    store.touch('project', p);
    p.fields = p.fields.filter((x) => x.id !== fid);
    for (const v of p.views) {
      v.hidden = (v.hidden || []).filter((x) => x !== fid);
      v.sort = (v.sort || []).filter((s) => s.f !== fid);
      if (v.group === fid) v.group = '';
      if (v.slice === fid) v.slice = '';
      if (v.column === fid) v.column = 'status';
      if (v.road && v.road.start === fid) v.road.start = 'start';
      if (v.road && v.road.end === fid) v.road.end = 'due';
    }
    for (const c of p.charts || []) { if (c.x === fid) c.x = 'status'; if (c.group === fid) c.group = ''; if (c.y === fid) c.y = 'count'; }
    for (const it of store.items(p.id, { archived: 'all' })) {
      if (it.v && fid in it.v) { store.touch('item', it); delete it.v[fid]; }
    }
  });
}

export function deleteOption(store, p, fid, oid) {
  const f = fieldOf(p, fid);
  store.tx(`刪除選項`, () => {
    store.touch('project', p);
    f.options = f.options.filter((o) => o.id !== oid);
    for (const it of store.items(p.id, { archived: 'all' })) {
      const cur = it.v && it.v[fid];
      if (f.type === 'multi' ? (cur || []).includes(oid) : cur === oid) {
        store.touch('item', it);
        if (f.type === 'multi') it.v[fid] = cur.filter((x) => x !== oid); else delete it.v[fid];
      }
    }
  });
}

// ---- 項目 ----
// 編號從現有項目算（含已刪除的），新增項目不用改到專案紀錄，兩台裝置才不會互相蓋掉專案設定
function nextNo(store, p) {
  let max = 0;
  for (const it of Object.values(store.db.items)) if (it.pid === p.id && it.no > max) max = it.no;
  return max + 1;
}

export function addItem(store, p, { title, body = '', v = {}, parent = null, order, by = '' }) {
  return store.tx(`新增項目「${title}」`, () => {
    const now = store.now();
    const last = store.items(p.id).at(-1);
    const it = {
      id: uid('i_'), pid: p.id, no: nextNo(store, p), title: String(title).trim() || '未命名項目', body, v: { ...v }, parent, closed: false, closedAt: null,
      archived: false, order: order ?? (last ? last.order + 1 : 1), createdAt: now, by, comments: [], activity: [],
    };
    store.put('item', it);
    log(it, by, '建立了這個項目', now);
    run(store, p, 'added', it);
    if (it.v.status && doneOptions(p).includes(it.v.status) && p.workflows.doneClose?.on) setClosed(store, p, it, true);
    return it;
  });
}

function log(it, by, text, at) {
  (it.activity ||= []).push({ at, by: by || '', text });
  if (it.activity.length > 200) it.activity.shift();
}

// 修改一個欄位；自動化工作流程在這裡觸發
export function setValue(store, p, it, fid, value, by = '') {
  const f = fieldOf(p, fid);
  if (!f) throw new Error('找不到欄位');
  store.tx(`修改${f.name}`, () => {
    store.touch('item', it);
    const before = textOf(store, p, it, f);
    if (f.type === 'title') it.title = String(value).trim() || it.title;
    else if (f.id === 'parent') it.parent = value || null;
    else if (value == null || value === '' || (Array.isArray(value) && !value.length)) delete it.v[fid];
    else it.v[fid] = value;
    const after = textOf(store, p, it, f);
    if (before !== after) log(it, by, `把「${f.name}」從「${before || '空白'}」改成「${after || '空白'}」`, store.now());
    if (fid === 'status') onStatus(store, p, it);
    if (fid === 'assignees' && (it.v.assignees || []).length) run(store, p, 'assigned', it);
    if (f.id === 'parent' && it.parent) parentCheck(store, p, it);
  });
}

function onStatus(store, p, it) {
  const done = doneOptions(p).includes(it.v.status);
  if (p.workflows.doneClose?.on && done !== it.closed) setClosed(store, p, it, done);
}

export function setClosed(store, p, it, closed, by = '') {
  if (!!it.closed === !!closed) return;
  store.tx(closed ? '關閉項目' : '重新開啟項目', () => {
    store.touch('item', it);
    it.closed = !!closed;
    it.closedAt = closed ? store.now() : null;
    log(it, by, closed ? '關閉了這個項目' : '重新開啟這個項目', store.now());
    run(store, p, closed ? 'closed' : 'reopened', it);
    parentCheck(store, p, it);
  });
}

function parentCheck(store, p, it) {
  if (!it.parent || !p.workflows.subDone?.on) return;
  const par = store.item(it.parent);
  if (!par) return;
  const s = subProgress(store, par);
  if (s.total && s.done === s.total && !par.closed) setClosed(store, p, par, true);
}

// 內建工作流程
function run(store, p, event, it) {
  const w = p.workflows && p.workflows[event];
  if (!w || !w.on) return;
  if (event === 'added') { if (!it.v.status) it.v.status = w.status; return; }
  if (event === 'assigned') {
    if (it.v.status === p.workflows.added?.status && !it.closed) it.v.status = w.status;
    return;
  }
  if (it.v.status !== w.status) { it.v.status = w.status; log(it, '自動化', `狀態自動改為「${option(statusField(p), w.status)?.name || ''}」`, store.now()); }
}

// 定期清理：符合條件的項目自動封存；回傳封存數量
export function sweep(store, p, me = '') {
  const w = p.workflows && p.workflows.autoArchive;
  if (!w || !w.on || !w.filter) return 0;
  const pred = compileFilter(store, p, w.filter, { me });
  const hit = store.items(p.id).filter(pred);
  if (!hit.length) return 0;
  store.tx('', () => { for (const it of hit) { store.touch('item', it); it.archived = true; log(it, '自動化', '自動封存', store.now()); } });
  return hit.length;
}

export function archive(store, items, archived = true) {
  store.tx(archived ? '封存項目' : '還原項目', () => { for (const it of items) { store.touch('item', it); it.archived = archived; } });
}

export function deleteItems(store, items) {
  store.tx('刪除項目', () => {
    for (const it of items) {
      store.remove('item', it);
      for (const k of store.children(it.id)) { store.touch('item', k); k.parent = null; }
    }
  });
}

export function addComment(store, it, text, by = '') {
  store.tx('新增留言', () => { store.touch('item', it); (it.comments ||= []).push({ id: uid('c_'), by, at: store.now(), text }); });
}

// 把項目移到 before 前面（before 為 null 表示最後）
export function moveItem(store, p, it, before, patch) {
  const list = store.items(p.id).filter((x) => x.id !== it.id);
  let order;
  if (before) {
    const i = list.findIndex((x) => x.id === before.id);
    const prev = list[i - 1];
    order = prev ? (prev.order + before.order) / 2 : before.order - 1;
  } else order = (list.at(-1)?.order ?? 0) + 1;
  store.tx('移動項目', () => {
    store.touch('item', it);
    it.order = order;
    if (patch) setValue(store, p, it, patch.f, patch.v);
  });
}

// ---- 檢視 ----
export function addView(store, p, view) {
  const v = { id: uid('v_'), name: '新檢視', icon: '📊', layout: 'table', filter: '', sort: [], group: '', slice: '', hidden: [], column: 'status', limits: {}, widths: {}, road: { start: 'start', end: 'due', zoom: 'quarter' }, ...view };
  store.tx('新增檢視', () => { store.touch('project', p); p.views.push(v); });
  return v;
}

export function editView(store, p, vid, patch, label = '修改檢視') {
  const v = p.views.find((x) => x.id === vid);
  store.tx(label, () => { store.touch('project', p); Object.assign(v, patch); });
  return v;
}

export function deleteView(store, p, vid) {
  if (p.views.length <= 1) throw new Error('至少要留一個檢視');
  store.tx('刪除檢視', () => { store.touch('project', p); p.views = p.views.filter((x) => x.id !== vid); });
}

// ---- 專案更新 ----
export function addUpdate(store, p, { health, start, target, text, by }) {
  store.tx('新增專案更新', () => {
    store.touch('project', p);
    p.updates.unshift({ id: uid('u_'), at: store.now(), by: by || '', health, start: start || '', target: target || '', text: text || '' });
    p.health = health || p.health;
    if (start !== undefined) p.startDate = start;
    if (target !== undefined) p.targetDate = target;
  });
}

// ---- 總覽（首頁、AI 助手）----
export function summary(store, p, todayStr = today()) {
  const items = store.items(p.id);
  const open = items.filter((i) => !i.closed);
  const overdue = open.filter((i) => i.v.due && i.v.due < todayStr);
  const soon = open.filter((i) => i.v.due && i.v.due >= todayStr && diffDays(i.v.due, todayStr) <= 7);
  return { total: items.length, open: open.length, closed: items.length - open.length, overdue, soon, pct: items.length ? Math.round(((items.length - open.length) / items.length) * 100) : 0 };
}

// ---- 匯出匯入 ----
export function toCSV(store, p, items, fields) {
  const esc = (s) => { s = String(s ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cols = fields || p.fields;
  const rows = [['編號', ...cols.map((f) => f.name), '狀況'].map(esc).join(',')];
  for (const it of items) rows.push([`#${it.no}`, ...cols.map((f) => textOf(store, p, it, f)), it.closed ? '已關閉' : '開啟'].map(esc).join(','));
  return '﻿' + rows.join('\r\n');
}

export function parseCSV(text) {
  const rows = [[]];
  let cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { rows.at(-1).push(cell); cell = ''; }
    else if (c === '\n') { rows.at(-1).push(cell); cell = ''; rows.push([]); }
    else if (c !== '\r') cell += c;
  }
  if (cell || rows.at(-1).length) rows.at(-1).push(cell);
  return rows.filter((r) => r.some((x) => x !== ''));
}

// CSV 匯入：第一列比對欄位名稱，單選找不到的選項自動新增
export function importCSV(store, p, text, by = '') {
  const rows = parseCSV(text);
  if (rows.length < 2) return 0;
  const head = rows[0].map((s) => s.trim());
  const titleAt = Math.max(head.indexOf('標題'), head.indexOf('title'));
  const ti = titleAt >= 0 ? titleAt : 0;
  let n = 0;
  store.tx('匯入項目', () => {
    store.touch('project', p);
    for (const r of rows.slice(1)) {
      if (!r[ti] || !r[ti].trim()) continue;
      const it = addItem(store, p, { title: r[ti], by });
      head.forEach((name, i) => {
        if (i === ti || !r[i]) return;
        const f = p.fields.find((x) => x.name === name);
        if (!f) return;
        const value = coerce(store, p, f, r[i]);
        if (value !== undefined) setValue(store, p, it, f.id, value, by);
      });
      n++;
    }
  });
  return n;
}

// JSON 備份匯入成一個新專案（換新 id，不會蓋掉現有資料）
export function importJSON(store, text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('這不是正確的 JSON 檔'); }
  if (!data || !data.project || !Array.isArray(data.project.fields) || !Array.isArray(data.items)) throw new Error('這不是專案追蹤工具匯出的備份');
  const p = clone(data.project);
  p.id = uid('p_');
  p.name = `${p.name}（匯入）`;
  const map = {};
  for (const it of data.items) map[it.id] = uid('i_');
  store.tx(`匯入專案「${p.name}」`, () => {
    store.put('project', p);
    for (const src of data.items) {
      const n = clone(src);
      n.id = map[src.id]; n.pid = p.id; n.parent = src.parent ? map[src.parent] || null : null;
      store.put('item', n);
    }
  });
  return p;
}

// 把文字轉成欄位的值；單選、多選沒有的選項會新增（CSV 匯入、AI 助手共用）
export function coerce(store, p, f, value) {
  const names = (s) => (Array.isArray(s) ? s : String(s).split(/[,，、]/)).map((x) => String(x).trim()).filter(Boolean);
  const opt = (name) => {
    let o = f.options.find((x) => x.name === name || x.id === name);
    if (!o) {
      o = { id: uid('o_'), name, color: '#64748b', icon: '' };
      store.tx('', () => { store.touch('project', p); f.options.push(o); });
    }
    return o.id;
  };
  switch (f.type) {
    case 'text': return String(value);
    case 'number': { const n = Number(value); return Number.isFinite(n) ? n : undefined; }
    case 'date': return /^\d{4}-\d{1,2}-\d{1,2}$/.test(String(value)) ? String(value).split('-').map((x, i) => (i ? x.padStart(2, '0') : x)).join('-') : undefined;
    case 'select': return opt(names(value)[0]);
    case 'multi': return names(value).map(opt);
    case 'people': {
      const list = names(value);
      if (list.some((n) => !p.members.includes(n))) store.tx('', () => { store.touch('project', p); for (const n of list) if (!p.members.includes(n)) p.members.push(n); });
      return list;
    }
    case 'iteration': { const it = iterationList(f).find((x) => x.name === value || x.id === value); return it ? it.id : undefined; }
    default: return undefined;
  }
}
