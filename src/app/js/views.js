// 檢視共用：取得篩選後的項目、欄位清單、快速新增
import { h } from './util.js';
import { toast } from './ui.js';
import { store, S, me, project, view } from './state.js';
import * as M from './core/model.js';
import { compileFilter, sortItems } from './core/query.js';

export const filterText = (v) => (S.liveFilter != null ? S.liveFilter : v.filter || '');

export function viewItems(p, v) {
  const pred = compileFilter(store, p, filterText(v), { me: me() });
  const wantArchived = /(^|\s)is:archived/.test(filterText(v));
  let items = store.items(p.id, { archived: wantArchived ? true : false }).filter(pred);
  const sl = S.slice[v.id];
  if (v.slice && sl !== undefined) {
    const f = M.fieldOf(p, v.slice);
    if (f) items = items.filter((it) => { const x = it.v[f.id]; return sl === '' ? x == null || (Array.isArray(x) && !x.length) : Array.isArray(x) ? x.includes(sl) : String(x) === sl; });
  }
  return sortItems(store, p, items, v.sort);
}

// 檢視顯示的欄位（依 cols 排序、扣掉 hidden）
export function shownFields(p, v, { includeTitle = false } = {}) {
  const order = v.cols || [];
  const rank = (f) => { const i = order.indexOf(f.id); return i < 0 ? 1000 + p.fields.indexOf(f) : i; };
  return p.fields.filter((f) => (includeTitle || f.id !== 'title') && !(v.hidden || []).includes(f.id)).sort((a, b) => rank(a) - rank(b));
}

// 目前的分組／篩選條件能推出的預設值：status:待辦 這樣的篩選下新增項目，應該就在這一組
export function defaultsFrom(p, v, patch) {
  const out = { ...(patch || {}) };
  const m = /(?:^|\s)(?:status|狀態):("[^"]+"|[^\s,]+)(?=\s|$)/.exec(filterText(v));
  if (m && !out.status) {
    const name = m[1].replace(/"/g, '');
    const o = M.statusField(p).options.find((x) => x.name === name);
    if (o) out.status = o.id;
  }
  return out;
}

export function quickAdd({ placeholder = '＋ 新增項目，按 Enter 建立', patch, cls = '' } = {}) {
  const input = h('input', {
    class: `quick-add ${cls}`, type: 'text', placeholder, 'aria-label': '新增項目',
    onkeydown: (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      const title = input.value.trim();
      if (!title) return;
      const p = project(), v = view();
      const it = M.addItem(store, p, { title, v: defaultsFrom(p, v, patch), by: me() });
      input.value = '';
      S.refocus = input.dataset.key;
      if (compileFilter(store, p, filterText(v), { me: me() })(it) === false) toast(`#${it.no} 已新增，但不符合目前的篩選條件`);
    },
  });
  return input;
}

export function groupValuePatch(f, key) {
  if (f.type === 'multi' || f.type === 'people') return key ? { [f.id]: [key] } : {};
  if (f.type === 'number') return key ? { [f.id]: Number(key) } : {};
  return key ? { [f.id]: key } : {};
}

// 把項目拖到另一組時的值
export function groupMove(store_, p, it, f, fromKey, toKey) {
  if (f.type === 'multi' || f.type === 'people') {
    const cur = (it.v[f.id] || []).filter((x) => x !== fromKey);
    return { f: f.id, v: toKey ? [...new Set([...cur, toKey])] : cur };
  }
  if (f.id === 'parent') return { f: f.id, v: toKey || null };
  if (f.type === 'number') return { f: f.id, v: toKey === '' ? null : Number(toKey) };
  return { f: f.id, v: toKey || null };
}
