// 看板檢視：依單選或迭代欄位分欄，拖曳換欄，可設每欄上限與泳道
import { h, fill, startDrag, $$ } from './util.js';
import { menu, promptBox, iconColorPicker } from './ui.js';
import { cellValue, avatar, progressBar, chip } from './cells.js';
import { store, S, openItem } from './state.js';
import * as M from './core/model.js';
import { groupsOf, sumOf } from './core/query.js';
import { viewItems, shownFields, quickAdd, groupValuePatch, groupMove } from './views.js';

export function renderBoard(p, v, host) {
  const items = viewItems(p, v);
  const fc = M.fieldOf(p, v.column) || M.statusField(p);
  const fg = v.group && v.group !== fc.id ? M.fieldOf(p, v.group) : null;
  const shown = shownFields(p, v).filter((f) => f.id !== fc.id && !['assignees', 'progress', 'kind'].includes(f.id));
  const num = shownFields(p, v).filter((f) => f.type === 'number');

  const columns = (list, laneKey) => h('div', { class: 'board' }, groupsOf(store, p, fc, list).map((g) => column(p, v, fc, fg, g, shown, num, laneKey)));
  if (fg) {
    const lanes = groupsOf(store, p, fg, items, { keepEmpty: false });
    fill(host, h('div', { class: 'lanes' }, lanes.map((l) => {
      const key = `${v.id}:lane:${l.key}`;
      const shut = S.collapsed.has(key);
      return h('section', { class: 'lane' },
        h('div', { class: 'g-head', style: { '--c': l.color }, onclick: () => { if (shut) S.collapsed.delete(key); else S.collapsed.add(key); import('./state.js').then((s) => s.refresh()); } },
          h('span', { class: 'caret' }, shut ? '▸' : '▾'), l.icon && h('span', {}, l.icon), h('b', {}, l.name), h('span', { class: 'count' }, l.items.length)),
        !shut && columns(l.items, l.key));
    })));
  } else fill(host, columns(items, null));
}

function column(p, v, fc, fg, g, shown, num, laneKey) {
  const limit = v.limits && v.limits[g.key];
  const over = limit && g.items.length > limit;
  const patch = { ...groupValuePatch(fc, g.key), ...(fg && laneKey ? groupValuePatch(fg, laneKey) : {}) };
  const body = h('div', { class: 'col-body', dataset: { key: g.key, lane: laneKey ?? '' } }, g.items.map((it) => card(p, v, it, fc, fg, shown, g.key, laneKey)));
  const add = quickAdd({ placeholder: '＋ 新增項目', patch, cls: 'in-col' });
  add.dataset.key = `c:${laneKey}:${g.key}`;
  return h('div', { class: `col ${over ? 'over' : ''}`, style: { '--c': g.color } },
    h('div', { class: 'col-head' },
      g.icon ? h('span', { class: 'col-icon' }, g.icon) : h('span', { class: 'col-dot' }),
      h('b', {}, g.name),
      h('span', { class: 'count' }, limit ? `${g.items.length}/${limit}` : g.items.length),
      num.map((f) => h('small', { class: 'sum', title: f.name }, `Σ${sumOf(g.items, f.id)}`)),
      h('span', { class: 'sp' }),
      h('button', { class: 'icon-btn small', title: '這一欄的設定', 'aria-label': `${g.name} 欄設定`, onclick: (e) => colMenu(e.currentTarget, p, v, fc, g) }, '⋯')),
    g.opt && g.opt.desc && h('small', { class: 'col-desc' }, g.opt.desc),
    body, add);
}

function colMenu(anchor, p, v, fc, g) {
  const items = [
    { icon: '🔢', label: '設定數量上限', onClick: async () => {
      const n = await promptBox(`「${g.name}」最多幾張卡片`, { value: v.limits?.[g.key] || '', placeholder: '空白表示不限制' });
      if (n === null) return;
      const limits = { ...(v.limits || {}) };
      if (Number(n) > 0) limits[g.key] = Number(n); else delete limits[g.key];
      M.editView(store, p, v.id, { limits }, '設定欄位上限');
    } },
  ];
  if (g.opt) {
    items.push({ icon: '🎨', label: '改顏色與小圖案', onClick: () => iconColorPicker(anchor, { icon: g.opt.icon, color: g.opt.color, onChange: (x) => store.tx('修改選項外觀', () => { store.touch('project', p); Object.assign(g.opt, x); }) }) });
    items.push({ icon: '✏️', label: '重新命名', onClick: async () => { const n = await promptBox('選項名稱', { value: g.opt.name }); if (n) store.tx('重新命名選項', () => { store.touch('project', p); g.opt.name = n; }); } });
  }
  menu(anchor, items, { width: 200 });
}

function card(p, v, it, fc, fg, shown, key, laneKey) {
  const kind = M.option(M.fieldOf(p, 'kind'), it.v.kind);
  const people = it.v.assignees || [];
  const hidden = v.hidden || [];
  const sub = M.subProgress(store, it);
  const vals = shown.map((f) => { const x = cellValue(p, it, f); return x && !(f.id === 'updated') ? h('span', { class: 'cv', title: f.name }, x) : null; }).filter(Boolean);
  const el = h('div', {
    class: `card ${it.closed ? 'closed' : ''} ${S.itemId === it.id ? 'cur' : ''}`, tabIndex: 0, role: 'button', dataset: { id: it.id },
    onclick: () => openItem(it.id),
    onkeydown: (e) => { if (e.key === 'Enter') openItem(it.id); },
    onpointerdown: (e) => dragCard(e, p, v, it, el, fc, fg, key, laneKey),
  },
    h('div', { class: 'card-top' }, kind && !hidden.includes('kind') && h('span', { title: kind.name }, kind.icon), h('span', { class: 'no' }, `#${it.no}`), it.closed && h('span', { class: 'ok' }, '✔'), h('span', { class: 'sp' }), !hidden.includes('assignees') && people.slice(0, 3).map((n) => avatar(n))),
    h('div', { class: 'card-title' }, it.title),
    vals.length > 0 && h('div', { class: 'card-vals' }, vals),
    !hidden.includes('progress') && progressBar(sub, 'in-card'));
  return el;
}

function dragCard(e, p, v, it, el, fc, fg, fromKey, fromLane) {
  if (e.target.closest('button,input,a')) return;
  let ghost = null, target = null, before = null, ph = null, ox = 0, oy = 0;
  startDrag(e, {
    onStart: () => {
      const r = el.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      ghost = el.cloneNode(true);
      ghost.classList.add('ghost');
      ghost.style.width = r.width + 'px';
      document.body.append(ghost);
      el.classList.add('drag');
      ph = h('div', { class: 'card-ph', style: { height: r.height + 'px' } });
    },
    onMove: (ev) => {
      ghost.style.left = ev.clientX - ox + 'px';
      ghost.style.top = ev.clientY - oy + 'px';
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const col = under && (under.closest('.col-body') || under.closest('.col')?.querySelector('.col-body'));
      target = col || null;
      if (!col) { ph.remove(); return; }
      const cards = $$('.card', col).filter((c) => c !== el);
      before = cards.find((c) => { const r = c.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; }) || null;
      col.insertBefore(ph, before);
      const box = col.getBoundingClientRect();
      if (ev.clientY > box.bottom - 30) col.scrollTop += 12; else if (ev.clientY < box.top + 30) col.scrollTop -= 12;
    },
    onEnd: (ev, canceled) => {
      ghost.remove();
      ph.remove();
      el.classList.remove('drag');
      if (canceled || !target) return;
      const toKey = target.dataset.key, toLane = target.dataset.lane;
      const beforeIt = before ? store.item(before.dataset.id) : null;
      const sameCol = toKey === fromKey && (toLane || null) === (fromLane || null);
      if (sameCol) { M.moveItem(store, p, it, beforeIt); return; }
      store.tx('移動卡片', () => {
        M.moveItem(store, p, it, beforeIt, toKey !== fromKey ? groupMove(store, p, it, fc, fromKey, toKey) : null);
        if (fg && (toLane || '') !== (fromLane || '')) { const m = groupMove(store, p, it, fg, fromLane, toLane); M.setValue(store, p, it, m.f, m.v); }
      });
    },
  });
}

export { chip };
