// 篩選語法（仿 GitHub Projects）、排序、分組
// 例：status:待辦,進行中 assignee:@me -label:測試 due:<@today+7 estimate:>=3 is:open no:assignee "關鍵字"
import { today, addDays } from './defs.js';

const ALIAS = {
  status: 'status', 狀態: 'status', assignee: 'assignees', assignees: 'assignees', 負責人: 'assignees', label: 'labels', labels: 'labels', 標籤: 'labels',
  type: 'kind', kind: 'kind', 類型: 'kind', priority: 'priority', 優先度: 'priority', due: 'due', 目標日: 'due', start: 'start', 開始日: 'start',
  iteration: 'iteration', 迭代: 'iteration', milestone: 'milestone', 里程碑: 'milestone', parent: 'parent', 父項目: 'parent', title: 'title', 標題: 'title',
  estimate: 'estimate', 預估工時: 'estimate', updated: 'updated', 更新時間: 'updated',
};
const SPECIAL = new Set(['is', 'no', 'has', 'created', '建立']);

export const FILTER_HELP = [
  ['status:進行中', '狀態是進行中'], ['status:待辦,進行中', '逗號表示「或」'], ['-label:測試', '減號表示「不是」'], ['assignee:@me', '指派給我'],
  ['no:assignee', '沒有負責人'], ['has:due', '有目標日'], ['is:open / is:closed', '開啟中／已關閉'], ['is:overdue', '已逾期'], ['is:archived', '已封存'],
  ['due:<@today+7', '七天內到期'], ['estimate:>=3', '數字比較'], ['estimate:2..5', '範圍'], ['iteration:@current', '目前的迭代'], ['登入', '標題或內容含「登入」'],
];

// 切成 token，支援引號：key:"有 空白" 與 "關鍵字"
export function tokenize(s) {
  const out = [];
  const re = /\s*(-?)(?:([^\s:"]+|"[^"]*"):)?((?:"[^"]*"|[^\s])*)/gy;
  let m;
  while (re.lastIndex < s.length && (m = re.exec(s))) {
    if (m[0] === '') break;
    const unq = (x) => (x || '').replace(/"/g, '');
    if (!m[2] && !m[3]) continue;
    out.push({ neg: !!m[1], key: m[2] ? unq(m[2]) : null, value: unq(m[3]) });
  }
  return out;
}

function resolveField(p, key) {
  const k = key.toLowerCase();
  if (ALIAS[k]) return p.fields.find((f) => f.id === ALIAS[k]) || null;
  return p.fields.find((f) => f.name.toLowerCase() === k) || null;
}

function dateToken(v) {
  const m = /^@today([+-]\d+)?[dD]?$/i.exec(v);
  if (m) return addDays(today(), m[1] ? Number(m[1]) : 0);
  return v;
}

// 比較式：回傳 (x) => bool；x 是字串或數字
function comparator(raw, conv) {
  const range = /^(.+)\.\.(.+)$/.exec(raw);
  if (range) { const a = conv(range[1]), b = conv(range[2]); return (x) => x >= a && x <= b; }
  const m = /^(>=|<=|>|<)(.+)$/.exec(raw);
  if (m) {
    const y = conv(m[2]);
    return { '>=': (x) => x >= y, '<=': (x) => x <= y, '>': (x) => x > y, '<': (x) => x < y }[m[1]];
  }
  return null;
}

function wild(pat) {
  const esc = pat.toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${esc}$`);
}

function iterMatch(f, tok) {
  const list = (f.iter && f.iter.list) || [];
  const t = today();
  const end = (x) => addDays(x.start, x.days - 1);
  const m = /^@(current|next|previous)([+-]\d+)?$/i.exec(tok);
  if (!m) { const it = list.find((x) => x.name.toLowerCase() === tok.toLowerCase()); return it ? it.id : null; }
  const cur = list.findIndex((x) => x.start <= t && t <= end(x));
  const base = cur >= 0 ? cur : list.findIndex((x) => x.start > t);
  if (base < 0) return null;
  const off = (m[1].toLowerCase() === 'next' ? 1 : m[1].toLowerCase() === 'previous' ? -1 : 0) + (m[2] ? Number(m[2]) : 0);
  return list[base + off] ? list[base + off].id : null;
}

function fieldPredicate(store, p, f, value, me) {
  const alts = value.split(',').map((x) => x.trim()).filter(Boolean);
  const single = (tok) => {
    const lo = tok.toLowerCase();
    switch (f.type) {
      case 'title': { const re = lo.includes('*') ? wild(lo) : null; return (it) => (re ? re.test(it.title.toLowerCase()) : it.title.toLowerCase().includes(lo)); }
      case 'text': { const re = wild(lo); return (it) => re.test(String(it.v[f.id] || '').toLowerCase()); }
      case 'number': {
        const c = comparator(tok, Number) || ((x) => x === Number(tok));
        return (it) => it.v[f.id] != null && c(Number(it.v[f.id]));
      }
      case 'date': {
        const c = comparator(tok, dateToken) || ((x) => x === dateToken(tok));
        return (it) => !!it.v[f.id] && c(it.v[f.id]);
      }
      case 'updated': {
        const c = comparator(tok, dateToken) || ((x) => x === dateToken(tok));
        return (it) => c(ymdOf(it.u));
      }
      case 'select': { const re = wild(lo); const ids = f.options.filter((o) => re.test(o.name.toLowerCase())).map((o) => o.id); return (it) => ids.includes(it.v[f.id]); }
      case 'multi': { const re = wild(lo); const ids = f.options.filter((o) => re.test(o.name.toLowerCase())).map((o) => o.id); return (it) => (it.v[f.id] || []).some((x) => ids.includes(x)); }
      case 'people': { const name = lo === '@me' ? String(me || '').toLowerCase() : lo; const re = wild(name); return (it) => (it.v[f.id] || []).some((x) => re.test(x.toLowerCase())); }
      case 'iteration': { const id = iterMatch(f, tok); return (it) => id != null && it.v[f.id] === id; }
      case 'parent': return (it) => { const par = it.parent && store.item(it.parent); return !!par && (par.title.toLowerCase().includes(lo) || `#${par.no}` === lo); };
      default: return () => true;
    }
  };
  const preds = alts.map(single);
  return (it) => preds.some((q) => q(it));
}

const ymdOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function hasValue(store, p, f, it) {
  if (f.type === 'title') return !!it.title;
  if (f.type === 'progress') return store.children(it.id).length > 0;
  if (f.id === 'parent') return !!it.parent;
  const v = it.v[f.id];
  return Array.isArray(v) ? v.length > 0 : v != null && v !== '';
}

// 編譯成 (item) => bool。不認得的 key 當成一般文字搜尋，打字打到一半不會整片變空白
export function compileFilter(store, p, query, { me = '' } = {}) {
  const preds = [];
  let wantArchived = false, anyArchive = false;
  for (const t of tokenize(query || '')) {
    let q = null;
    const key = t.key && t.key.toLowerCase();
    if (key === 'is') {
      const vs = t.value.split(',').map((x) => x.trim().toLowerCase());
      if (vs.includes('archived')) { wantArchived = !t.neg; anyArchive = true; if (vs.length === 1) continue; }
      const is = {
        open: (it) => !it.closed, closed: (it) => !!it.closed, done: (it) => !!it.closed, archived: (it) => !!it.archived,
        overdue: (it) => !it.closed && !!it.v.due && it.v.due < today(), sub: (it) => !!it.parent, parent: (it) => store.children(it.id).length > 0,
      };
      const fs = vs.map((v) => is[v]).filter(Boolean);
      if (fs.length) q = (it) => fs.some((fn) => fn(it));
    } else if (key === 'no' || key === 'has') {
      const f = resolveField(p, t.value);
      if (f) q = key === 'has' ? (it) => hasValue(store, p, f, it) : (it) => !hasValue(store, p, f, it);
    } else if (key === 'created' || key === '建立') {
      const c = comparator(t.value, dateToken) || ((x) => x === dateToken(t.value));
      q = (it) => c(ymdOf(it.createdAt));
    } else if (t.key) {
      const f = resolveField(p, t.key);
      if (f && t.value) q = fieldPredicate(store, p, f, t.value, me);
      else if (!f) { const s = `${t.key}:${t.value}`.toLowerCase(); q = (it) => matchText(it, s); }
    } else if (t.value) {
      const s = t.value.toLowerCase();
      q = (it) => matchText(it, s);
    }
    if (q) preds.push(t.neg ? (it) => !q(it) : q);
  }
  return (it) => (anyArchive ? !!it.archived === wantArchived : !it.archived) && preds.every((q) => q(it));
}

const matchText = (it, s) => it.title.toLowerCase().includes(s) || (it.body || '').toLowerCase().includes(s) || `#${it.no}` === s;

// ---- 排序 ----
function sortKey(store, p, f, it) {
  const v = f.type === 'title' ? it.title : f.type === 'updated' ? it.u : f.id === 'parent' ? it.parent : it.v[f.id];
  if (f.type === 'select') { const i = f.options.findIndex((o) => o.id === v); return i < 0 ? null : i; }
  if (f.type === 'multi' || f.type === 'people') return v && v.length ? String(v[0]) : null;
  if (f.type === 'iteration') { const i = (f.iter.list || []).findIndex((x) => x.id === v); return i < 0 ? null : i; }
  if (f.type === 'progress') { const k = store.children(it.id); return k.length ? k.filter((x) => x.closed).length / k.length : null; }
  return v ?? null;
}

export function sortItems(store, p, items, sorts) {
  if (!sorts || !sorts.length) return items;
  const keyed = sorts.map((s) => ({ f: p.fields.find((x) => x.id === s.f), dir: s.dir === 'desc' ? -1 : 1 })).filter((s) => s.f);
  return [...items].sort((a, b) => {
    for (const { f, dir } of keyed) {
      const x = sortKey(store, p, f, a), y = sortKey(store, p, f, b);
      if (x === y) continue;
      if (x == null) return 1;           // 空白永遠排最後
      if (y == null) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'zh-Hant');
      if (c) return c * dir;
    }
    return a.order - b.order;
  });
}

// ---- 分組：回傳 [{ key, name, color, icon, items, opt }]；sum 是各數字欄的加總 ----
export function groupsOf(store, p, f, items, { keepEmpty = true } = {}) {
  const none = { key: '', name: `沒有${f.name}`, color: '#94a3b8', icon: '', items: [] };
  let groups;
  if (f.type === 'select' || f.type === 'multi') {
    groups = f.options.map((o) => ({ key: o.id, name: o.name, color: o.color, icon: o.icon, items: [], opt: o }));
  } else if (f.type === 'iteration') {
    groups = (f.iter.list || []).map((x) => ({ key: x.id, name: x.name, color: '#6366f1', icon: '🔁', items: [], iter: x }));
  } else if (f.type === 'people') {
    groups = [...new Set([...(p.members || []), ...items.flatMap((it) => it.v[f.id] || [])])].map((n) => ({ key: n, name: n, color: '#3b82f6', icon: '👤', items: [] }));
  } else if (f.id === 'parent') {
    const ids = [...new Set(items.map((it) => it.parent).filter(Boolean))];
    groups = ids.map((id) => { const par = store.item(id); return { key: id, name: par ? par.title : '已刪除', color: '#6366f1', icon: '🧩', items: [] }; });
  } else {
    const vals = [...new Set(items.map((it) => it.v[f.id]).filter((v) => v != null && v !== ''))].sort();
    groups = vals.map((v) => ({ key: String(v), name: String(v), color: '#64748b', icon: '', items: [] }));
  }
  const map = new Map(groups.map((g) => [g.key, g]));
  for (const it of items) {
    const v = f.id === 'parent' ? it.parent : it.v[f.id];
    const keys = Array.isArray(v) ? v : v == null || v === '' ? [] : [String(v)];
    let hit = false;
    for (const k of keys) { const g = map.get(k); if (g) { g.items.push(it); hit = true; } }
    if (!hit) none.items.push(it);
  }
  const out = keepEmpty ? groups : groups.filter((g) => g.items.length);
  if (none.items.length || keepEmpty) out.push(none);
  return out;
}

export const sumOf = (items, fid) => items.reduce((a, it) => a + (Number(it.v[fid]) || 0), 0);
