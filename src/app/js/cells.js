// 欄位值的顯示與編輯（表格、看板、詳細面板共用）
import { h, ink, shortDate } from './util.js';
import { popover, closePopover, iconColorPicker, promptBox } from './ui.js';
import * as M from './core/model.js';
import { addDays, today, COLORS } from './core/defs.js';
import { store, me } from './state.js';

export const chip = (name, color, icon, extra) => h('span', { class: `chip ${extra || ''}`, style: { '--c': color || '#64748b' } }, icon && h('i', {}, icon), h('b', {}, name));

export function avatar(name) {
  const hue = [...String(name)].reduce((a, c) => a + c.codePointAt(0), 0) % 360;
  return h('span', { class: 'avatar', title: name, style: { background: `hsl(${hue} 60% 45%)` } }, String(name).slice(0, 1));
}

export function progressBar({ done, total }, cls = '') {
  if (!total) return null;
  return h('span', { class: `progress ${cls}`, title: `${done} / ${total}` }, h('span', { class: 'bar' }, h('span', { style: { width: (done / total) * 100 + '%' } })), h('small', {}, `${done}/${total}`));
}

function dueClass(item, v, f) {
  if (f.id !== 'due' || item.closed || !v) return '';
  if (v < today()) return 'late';
  if (v <= addDays(today(), 3)) return 'soon';
  return '';
}

// 顯示：回傳元素；沒有值回傳 null
export function cellValue(p, item, f) {
  const v = M.val(item, f);
  switch (f.type) {
    case 'select': { const o = M.option(f, v); return o ? chip(o.name, o.color, o.icon) : null; }
    case 'multi': return (v || []).length ? h('span', { class: 'chips' }, v.map((id) => { const o = M.option(f, id); return o && chip(o.name, o.color, o.icon); })) : null;
    case 'people': return (v || []).length ? h('span', { class: 'people' }, v.map((n) => h('span', { class: 'person' }, avatar(n), h('span', { class: 'pn' }, n)))) : null;
    case 'date': return v ? h('span', { class: `date ${dueClass(item, v, f)}` }, shortDate(v)) : null;
    case 'number': return v == null ? null : h('span', { class: 'num' }, String(v));
    case 'iteration': { const it = M.iterationOf(f, v); return it ? chip(it.name, '#6366f1', '🔁') : null; }
    case 'progress': return progressBar(M.subProgress(store, item));
    case 'parent': { const par = v && store.item(v); return par ? h('span', { class: 'ref' }, `#${par.no} ${par.title}`) : null; }
    case 'link': return (v || []).length ? h('span', { class: 'ref' }, `🔗 ${v.length}`) : null;
    case 'updated': return h('small', { class: 'muted' }, new Date(v).toLocaleDateString('zh-TW'));
    default: return v ? h('span', {}, String(v)) : null;
  }
}

export const readOnly = (f) => ['progress', 'updated', 'title'].includes(f.type);

const apply = (p, item, f, value) => M.setValue(store, p, item, f.id, value, me());

function searchable(list, render, placeholder = '搜尋…') {
  const box = h('div', { class: 'opt-list' });
  const input = h('input', { type: 'text', placeholder, class: 'opt-search', oninput: () => paint(), onkeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) { const b = box.querySelector('button'); if (b) b.click(); } } });
  const paint = () => {
    const q = input.value.trim().toLowerCase();
    box.replaceChildren(...list.filter((x) => !q || (x.name || '').toLowerCase().includes(q)).map(render));
  };
  paint();
  return { input, box, paint };
}

// 編輯：在 anchor 旁開彈出面板，選好就存
export function editField(anchor, p, item, f) {
  const cur = M.val(item, f);
  if (f.type === 'select') return editSelect(anchor, p, item, f, cur);
  if (f.type === 'multi') return editMulti(anchor, p, item, f, cur || []);
  if (f.type === 'people') return editPeople(anchor, p, item, f, cur || []);
  if (f.type === 'date') return editDate(anchor, p, item, f, cur);
  if (f.type === 'number' || f.type === 'text') return editText(anchor, p, item, f, cur);
  if (f.type === 'iteration') return editIteration(anchor, p, item, f, cur);
  if (f.type === 'parent') return editParent(anchor, p, item, f, cur);
  if (f.type === 'link') return editLinks(anchor, p, item, f, cur || []);
  return null;
}

function addOption(p, f, name) {
  const color = COLORS[(f.options.length + 2) % COLORS.length].c;
  const o = { id: M.uid('o_'), name, color, icon: '' };
  store.tx(`新增選項「${name}」`, () => { store.touch('project', p); f.options.push(o); });
  return o;
}

function editSelect(anchor, p, item, f, cur) {
  const { input, box } = searchable(f.options, (o) => h('button', { class: `opt ${o.id === cur ? 'on' : ''}`, onclick: () => { closePopover(); apply(p, item, f, o.id === cur ? null : o.id); } }, chip(o.name, o.color, o.icon), o.desc && h('small', {}, o.desc)));
  const add = h('button', { class: 'menu-item', onclick: async () => {
    closePopover();
    const name = await promptBox(`新增「${f.name}」選項`, { placeholder: '選項名稱' });
    if (name) apply(p, item, f, addOption(p, f, name).id);
  } }, '＋ 新增選項');
  popover(anchor, h('div', {}, input, box, cur && h('button', { class: 'menu-item', onclick: () => { closePopover(); apply(p, item, f, null); } }, '✕ 清除'), f.id !== 'status' && add), { width: 240 });
}

function editMulti(anchor, p, item, f, cur) {
  let sel = [...cur];
  const toggle = (id) => { sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]; apply(p, item, f, sel); };
  const { input, box, paint } = searchable(f.options, (o) => h('button', { class: `opt ${sel.includes(o.id) ? 'on' : ''}`, onclick: () => { toggle(o.id); paint(); } }, h('span', { class: 'tick' }, sel.includes(o.id) ? '✔' : ''), chip(o.name, o.color, o.icon)));
  const add = h('button', { class: 'menu-item', onclick: async () => {
    closePopover();
    const name = await promptBox(`新增「${f.name}」`, { placeholder: '名稱' });
    if (name) apply(p, item, f, [...sel, addOption(p, f, name).id]);
  } }, '＋ 新增');
  popover(anchor, h('div', {}, input, box, add), { width: 240 });
}

export function memberList(p) {
  const all = new Set(p.members || []);
  if (me()) all.add(me());
  return [...all];
}

function editPeople(anchor, p, item, f, cur) {
  let sel = [...cur];
  const list = [...new Set([...memberList(p), ...cur])].map((name) => ({ name }));
  const toggle = (n) => { sel = sel.includes(n) ? sel.filter((x) => x !== n) : [...sel, n]; apply(p, item, f, sel); };
  const addMember = (n) => { if (!p.members.includes(n)) M.updateProject(store, p, { members: [...p.members, n] }, '新增成員'); };
  const { input, box, paint } = searchable(list, (x) => h('button', { class: `opt ${sel.includes(x.name) ? 'on' : ''}`, onclick: () => { toggle(x.name); addMember(x.name); paint(); } }, h('span', { class: 'tick' }, sel.includes(x.name) ? '✔' : ''), avatar(x.name), x.name), '搜尋或輸入新名字');
  const add = h('button', { class: 'menu-item', onclick: () => {
    const n = input.value.trim();
    if (!n) { input.focus(); return; }
    addMember(n); closePopover(); apply(p, item, f, [...sel, n]);
  } }, '＋ 新增這個人');
  popover(anchor, h('div', {}, input, box, add), { width: 240 });
}

function editDate(anchor, p, item, f, cur) {
  const set = (v) => { closePopover(); apply(p, item, f, v); };
  const input = h('input', { type: 'date', value: cur || '', onchange: (e) => { if (e.target.value) set(e.target.value); } });
  const quick = [['今天', 0], ['明天', 1], ['三天後', 3], ['下週', 7], ['兩週後', 14]];
  popover(anchor, h('div', { class: 'date-pop' }, input, h('div', { class: 'quick' }, quick.map(([t, n]) => h('button', { class: 'btn small', onclick: () => set(addDays(today(), n)) }, t))), cur && h('button', { class: 'menu-item', onclick: () => set(null) }, '✕ 清除')), { width: 230 });
}

function editText(anchor, p, item, f, cur) {
  const input = h('input', { type: f.type === 'number' ? 'number' : 'text', value: cur ?? '', step: 'any', placeholder: f.name });
  const done = () => {
    const raw = input.value.trim();
    const v = raw === '' ? null : f.type === 'number' ? Number(raw) : raw;
    if (v !== (cur ?? null)) apply(p, item, f, v);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) closePopover(); });
  popover(anchor, input, { width: 220, onClose: done });
}

function editIteration(anchor, p, item, f, cur) {
  const list = M.iterationList(f);
  const t = today();
  const content = h('div', { class: 'opt-list' },
    list.map((x) => h('button', { class: `opt ${x.id === cur ? 'on' : ''}`, onclick: () => { closePopover(); apply(p, item, f, x.id === cur ? null : x.id); } },
      chip(x.name, '#6366f1', '🔁'), h('small', {}, `${shortDate(x.start)}～${shortDate(M.iterEnd(x))}${x.start <= t && t <= M.iterEnd(x) ? '（目前）' : ''}`))),
    !list.length && h('p', { class: 'muted pad' }, '還沒有迭代，請到專案設定的「欄位」新增'));
  popover(anchor, content, { width: 260 });
}

function editParent(anchor, p, item, f, cur) {
  const kids = new Set();
  const walk = (id) => { for (const k of store.children(id)) { kids.add(k.id); walk(k.id); } };
  walk(item.id);
  const list = store.items(p.id).filter((x) => x.id !== item.id && !kids.has(x.id)).map((x) => ({ name: `#${x.no} ${x.title}`, id: x.id }));
  const { input, box } = searchable(list, (x) => h('button', { class: `opt ${x.id === cur ? 'on' : ''}`, onclick: () => { closePopover(); apply(p, item, f, x.id); } }, x.name));
  popover(anchor, h('div', {}, input, box, cur && h('button', { class: 'menu-item', onclick: () => { closePopover(); apply(p, item, f, null); } }, '✕ 不要父項目')), { width: 300 });
}

function editLinks(anchor, p, item, f, cur) {
  const list = h('div', {}, cur.map((l, i) => h('div', { class: 'link-row' }, h('span', { class: 'ref' }, l.url), h('button', { class: 'icon-btn', title: '移除', onclick: () => { closePopover(); apply(p, item, f, cur.filter((_, j) => j !== i)); } }, '✕'))));
  const input = h('input', { type: 'url', placeholder: '貼上網址，例如 GitHub Pull Request' });
  const add = () => {
    const url = input.value.trim();
    if (!/^https?:\/\//.test(url)) { input.focus(); return; }
    closePopover();
    apply(p, item, f, [...cur, { url }]);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) add(); });
  popover(anchor, h('div', { class: 'date-pop' }, list, input, h('button', { class: 'btn small', onclick: add }, '加入連結')), { width: 300 });
}

export { iconColorPicker, ink };
