// 專案標題列、檢視分頁、篩選列、檢視設定
import { h, debounce } from './util.js';
import { menu, popover, closePopover, promptBox, confirmBox, iconColorPicker, toast } from './ui.js';
import { store, S, refresh, project } from './state.js';
import * as M from './core/model.js';
import { FILTER_HELP } from './core/query.js';
import { FIELD_TYPES } from './core/defs.js';
import { viewItems, filterText } from './views.js';

const LAYOUTS = [{ id: 'table', name: '表格', icon: '📊' }, { id: 'board', name: '看板', icon: '🗂️' }, { id: 'roadmap', name: '路線圖', icon: '🗺️' }];

export function viewTabs(p) {
  const tabs = p.views.map((v) => {
    const on = S.tab === 'view' && (S.vid === v.id || (!p.views.find((x) => x.id === S.vid) && v === p.views[0]));
    return h('div', { class: `vtab ${on ? 'on' : ''}` },
      h('button', { class: 'vt', onclick: () => { S.tab = 'view'; S.vid = v.id; S.liveFilter = null; S.selected.clear(); refresh(true); } }, h('span', {}, v.icon || '📊'), v.name),
      on && h('button', { class: 'vm', title: '檢視選項', 'aria-label': `${v.name} 檢視選項`, onclick: (e) => tabMenu(e.currentTarget, p, v) }, '▾'));
  });
  const page = (id, icon, label) => h('button', { class: `vtab side ${S.tab === id ? 'on' : ''}`, id: `tab-${id}`, onclick: () => { S.tab = id; refresh(true); } }, h('span', {}, icon), label);
  return h('div', { class: 'vtabs' }, tabs,
    h('button', { class: 'vtab add', id: 'btnAddView', title: '新增檢視', 'aria-label': '新增檢視', onclick: (e) => addViewMenu(e.currentTarget, p) }, '＋'),
    h('span', { class: 'sp' }),
    page('insights', '📈', '洞察'), page('updates', '📣', '專案更新'), page('settings', '⚙️', '專案設定'));
}

function addViewMenu(anchor, p) {
  menu(anchor, LAYOUTS.map((l) => ({
    icon: l.icon, label: `${l.name}檢視`,
    onClick: () => {
      const hidden = l.id === 'table' ? ['estimate', 'iteration', 'milestone', 'parent', 'links', 'updated', 'start'] : [];
      const v = M.addView(store, p, { name: `${l.name} ${p.views.filter((x) => x.layout === l.id).length + 1}`, icon: l.icon, layout: l.id, hidden });
      S.vid = v.id; S.tab = 'view'; refresh(true);
    },
  })), { width: 170 });
}

function tabMenu(anchor, p, v) {
  menu(anchor, [
    { icon: '✏️', label: '重新命名', onClick: async () => { const n = await promptBox('檢視名稱', { value: v.name }); if (n) M.editView(store, p, v.id, { name: n }); } },
    { icon: '🎨', label: '換小圖案', onClick: () => iconColorPicker(anchor, { icon: v.icon, noColor: true, onChange: (x) => M.editView(store, p, v.id, { icon: x.icon }) }) },
    { sep: true, title: '版面' },
    ...LAYOUTS.map((l) => ({ icon: l.icon, label: l.name, checked: v.layout === l.id, onClick: () => M.editView(store, p, v.id, { layout: l.id }, '變更版面') })),
    { sep: true },
    { icon: '📑', label: '複製這個檢視', onClick: () => { const c = M.addView(store, p, { ...JSON.parse(JSON.stringify(v)), id: M.uid('v_'), name: `${v.name} 副本` }); S.vid = c.id; refresh(true); } },
    p.views.length > 1 && { icon: '🗑️', label: '刪除這個檢視', danger: true, onClick: async () => { if (await confirmBox(`要刪除檢視「${v.name}」嗎？項目不會被刪除。`, { ok: '刪除', danger: true })) { M.deleteView(store, p, v.id); S.vid = null; refresh(true); } } },
  ], { width: 190 });
}

// 篩選列
export function filterBar(p, v, onLive) {
  const saved = v.filter || '';
  const input = h('input', { id: 'filterInput', type: 'text', value: filterText(v), placeholder: '篩選，例如 status:進行中 assignee:@me　或輸入關鍵字', 'aria-label': '篩選' });
  const live = debounce(() => { S.liveFilter = input.value; onLive(); }, 120);
  const commit = () => {
    if (S.liveFilter == null) return;
    const q = S.liveFilter.trim();
    S.liveFilter = null;
    if (q !== saved) M.editView(store, p, v.id, { filter: q }, '修改篩選');
  };
  input.addEventListener('input', live);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { live.cancel(); S.liveFilter = input.value; commit(); input.blur(); } if (e.key === 'Escape') { input.value = ''; S.liveFilter = ''; onLive(); } });
  input.addEventListener('blur', () => { live.cancel(); if (input.value !== (S.liveFilter ?? saved)) S.liveFilter = input.value; commit(); });
  const bar = h('div', { class: 'filter-bar' },
    h('span', { class: 'f-icon' }, '🔍'), input,
    (saved || S.liveFilter) ? h('button', { class: 'icon-btn small', title: '清除篩選', 'aria-label': '清除篩選', onmousedown: (e) => e.preventDefault(), onclick: () => { input.value = ''; S.liveFilter = ''; commit(); input.blur(); onLive(); } }, '✕') : null,
    h('button', { class: 'icon-btn small', title: '篩選語法說明', 'aria-label': '篩選語法說明', onmousedown: (e) => e.preventDefault(), onclick: (e) => filterHelp(e.currentTarget, input, p) }, '？'));
  return h('div', { class: 'toolbar' }, bar,
    h('span', { class: 'count-all' }, `${viewItems(p, v).length} 項`),
    h('button', { class: 'btn', id: 'btnViewOpts', onclick: (e) => viewOptions(e.currentTarget, p, v) }, '🎛️ 檢視設定'),
    h('button', { class: 'btn primary', id: 'btnNewItem', onclick: () => import('./detail.js').then((d) => d.newItemDialog(p, v)) }, '＋ 新增項目'));
}

function filterHelp(anchor, input, p) {
  const put = (s) => { const first = s.split(' /')[0]; input.value = (input.value.trim() + ' ' + first).trim(); input.dispatchEvent(new Event('input')); closePopover(); input.focus(); };
  popover(anchor, h('div', { class: 'help-pop' },
    h('b', {}, '篩選語法'), h('small', { class: 'muted' }, '點一下加入篩選；可以組合多個條件'),
    FILTER_HELP.map(([q, d]) => h('button', { class: 'help-row', onclick: () => put(q) }, h('code', {}, q), h('span', {}, d))),
    h('small', { class: 'muted' }, `自訂欄位直接用名稱，例如 ${p.fields.find((f) => !f.sys && f.type === 'text')?.name || '客戶'}:甲公司`)), { width: 340, align: 'right' });
}

// 檢視設定面板
function viewOptions(anchor, p, v) {
  const set = (patch, label = '修改檢視') => { M.editView(store, p, v.id, patch, label); viewOptions(anchor, p, p.views.find((x) => x.id === v.id)); };
  const groupable = p.fields.filter((f) => ['select', 'multi', 'people', 'iteration', 'date', 'number', 'text', 'parent'].includes(f.type));
  const choose = (list, cur, onPick, none) => h('select', { onchange: (e) => onPick(e.target.value) }, none && h('option', { value: '', selected: !cur }, none), list.map((f) => h('option', { value: f.id, selected: cur === f.id }, f.name)));
  const srt = (v.sort || [])[0];
  const rowOf = (t, c) => h('div', { class: 'vo-row' }, h('span', {}, t), c);
  const rows = [
    rowOf('排序', h('div', { class: 'vo-two' },
      choose(p.fields.filter((f) => !['link', 'parent'].includes(f.type)), srt?.f, (x) => set({ sort: x ? [{ f: x, dir: srt?.dir || 'asc' }] : [] }, '修改排序'), '手動順序'),
      srt && h('select', { onchange: (e) => set({ sort: [{ f: srt.f, dir: e.target.value }] }, '修改排序') }, h('option', { value: 'asc', selected: srt.dir !== 'desc' }, '小到大'), h('option', { value: 'desc', selected: srt.dir === 'desc' }, '大到小')))),
    rowOf(v.layout === 'board' ? '泳道分組' : '分組', choose(groupable, v.group, (x) => set({ group: x }, '修改分組'), '不分組')),
    rowOf('切片', choose(p.fields.filter((f) => ['select', 'multi', 'people', 'iteration'].includes(f.type)), v.slice, (x) => { delete S.slice[v.id]; set({ slice: x }, '修改切片'); }, '不使用')),
  ];
  if (v.layout === 'board') rows.push(rowOf('看板欄位', choose(p.fields.filter((f) => f.type === 'select' || f.type === 'iteration'), v.column, (x) => set({ column: x }, '修改看板欄位'))));
  if (v.layout === 'roadmap') {
    const dates = p.fields.filter((f) => f.type === 'date');
    const road = v.road || {};
    rows.push(rowOf('開始日期', choose(dates, road.start, (x) => set({ road: { ...road, start: x } }))));
    rows.push(rowOf('結束日期', choose(dates, road.end, (x) => set({ road: { ...road, end: x } }))));
    rows.push(rowOf('時間縮放', h('div', { class: 'seg' }, [['month', '月'], ['quarter', '季'], ['year', '年']].map(([id, t]) => h('button', { class: road.zoom === id ? 'on' : '', onclick: () => set({ road: { ...road, zoom: id } }) }, t)))));
  }
  popover(anchor, h('div', { class: 'vo' },
    rows,
    h('div', { class: 'sep' }, '顯示的欄位'),
    fieldChecks(p, v, set),
    h('button', { class: 'menu-item', onclick: () => { closePopover(); newFieldDialog(p, (f) => M.editView(store, p, v.id, { hidden: (v.hidden || []).filter((x) => x !== f.id) })); } }, '＋ 新增欄位')), { width: 320, align: 'right' });
}

function fieldChecks(p, v, set) {
  const list = p.fields.filter((f) => f.id !== 'title');
  const cols = [...(v.cols || []), ...list.map((f) => f.id).filter((id) => !(v.cols || []).includes(id))].filter((id) => list.find((f) => f.id === id));
  return h('div', { class: 'fc-list' }, cols.map((id, i) => {
    const f = M.fieldOf(p, id);
    const on = !(v.hidden || []).includes(id);
    const swap = (d) => { const c = [...cols]; [c[i], c[i + d]] = [c[i + d], c[i]]; set({ cols: c }, '調整欄位順序'); };
    return h('div', { class: 'fc' },
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: on, onchange: () => set({ hidden: on ? [...(v.hidden || []), id] : (v.hidden || []).filter((x) => x !== id) }, '顯示或隱藏欄位') }), f.name),
      h('span', { class: 'sp' }),
      h('button', { class: 'icon-btn small', disabled: i === 0, title: '往前', 'aria-label': `${f.name} 往前`, onclick: () => swap(-1) }, '↑'),
      h('button', { class: 'icon-btn small', disabled: i === cols.length - 1, title: '往後', 'aria-label': `${f.name} 往後`, onclick: () => swap(1) }, '↓'));
  }));
}

export function fieldsMenu(anchor, p, v) { viewOptions(anchor, p, v); }

// 新增欄位對話框
export async function newFieldDialog(p, after) {
  const { modal, row } = await import('./ui.js');
  let type = 'text';
  const name = h('input', { type: 'text', placeholder: '例如：客戶、金額、負責部門' });
  const types = h('div', { class: 'type-grid' }, Object.entries(FIELD_TYPES).filter(([k]) => k !== 'people').map(([k, t]) => h('button', { class: `type-card ${k === type ? 'on' : ''}`, onclick: (e) => { type = k; [...types.children].forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); opts.style.display = k === 'select' || k === 'multi' ? '' : 'none'; } }, h('span', { class: 'big' }, t.icon), h('b', {}, t.name), h('small', {}, t.desc))));
  const optsInput = h('input', { type: 'text', placeholder: '用逗號分開，例如：甲公司, 乙公司, 丙公司' });
  const opts = h('div', { style: { display: 'none' } }, row('選項', optsInput, '之後也可以到專案設定調整顏色與小圖案'));
  const m = modal({
    title: '新增欄位', body: h('div', {}, row('欄位名稱', name), h('div', { class: 'field' }, h('span', {}, '類型'), types), opts),
    buttons: [{ label: '取消' }, {
      label: '新增', primary: true, onClick: (close) => {
        const n = name.value.trim();
        if (!n) { name.focus(); return; }
        if (p.fields.some((f) => f.name === n)) { toast('已經有同名的欄位', { type: 'warn' }); return; }
        const palette = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#14b8a6', '#ec4899', '#eab308', '#6366f1'];
        const options = optsInput.value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean).map((o, i) => ({ id: M.uid('o_'), name: o, color: palette[i % palette.length], icon: '' }));
        const f = M.addField(store, p, { name: n, type, options });
        close();
        if (after) after(f);
      },
    }],
  });
  return m.done;
}

// 切片面板
export function slicePanel(p, v) {
  const f = v.slice && M.fieldOf(p, v.slice);
  if (!f) return null;
  const all = store.items(p.id);
  const cur = S.slice[v.id];
  const count = (key) => all.filter((it) => { const x = it.v[f.id]; return Array.isArray(x) ? x.includes(key) : String(x) === key; }).length;
  const vals = f.type === 'people' ? [...new Set(all.flatMap((i) => i.v[f.id] || []))].map((n) => ({ id: n, name: n, icon: '👤' }))
    : f.type === 'iteration' ? M.iterationList(f).map((x) => ({ id: x.id, name: x.name, icon: '🔁' })) : f.options;
  const btn = (key, name, icon, n) => h('button', { class: `sl ${cur === key ? 'on' : ''}`, onclick: () => { if (key === undefined || cur === key) delete S.slice[v.id]; else S.slice[v.id] = key; refresh(); } }, icon && h('span', {}, icon), h('span', { class: 'tt' }, name), n != null && h('span', { class: 'count' }, n));
  return h('aside', { class: 'slice' }, h('div', { class: 'sl-title' }, f.name), btn(undefined, '全部', '📋', all.length), vals.map((o) => btn(o.id, o.name, o.icon, count(o.id))));
}

export { project };
