// 路線圖檢視：時間軸、拖曳移動與調整長度、點空白處排日期、今天標線、迭代色帶
import { h, fill, startDrag, shortDate } from './util.js';
import { avatar } from './cells.js';
import { store, S, me, openItem, refresh } from './state.js';
import * as M from './core/model.js';
import { groupsOf } from './core/query.js';
import { addDays, diffDays, today, parseYmd, ymd, pad2 } from './core/defs.js';
import { viewItems, quickAdd, groupValuePatch } from './views.js';

const PX = { month: 30, quarter: 11, year: 3.4 };
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const nameW = () => (innerWidth <= 820 ? 132 : 280); // 左邊標題欄寬；手機要留空間給時間軸

// 開始日或結束日都可能只有一邊
function spanOf(it, a, b, fi) {
  if (a && b) { const x = it.v[a.id], y = it.v[b.id]; if (x || y) return { s: x || y, e: y || x }; }
  if (fi) { const x = M.iterationOf(fi, it.v[fi.id]); if (x) return { s: x.start, e: M.iterEnd(x), iter: true }; }
  return null;
}

export function renderRoadmap(p, v, host) {
  const items = viewItems(p, v);
  const road = v.road || { start: 'start', end: 'due', zoom: 'quarter' };
  const fa = M.fieldOf(p, road.start), fb = M.fieldOf(p, road.end);
  const fi = p.fields.find((f) => f.type === 'iteration');
  const px = PX[road.zoom] || PX.quarter;
  const t = today();

  // 範圍：涵蓋所有項目，今天前後留空間
  let lo = addDays(t, -21), hi = addDays(t, 90);
  for (const it of items) { const s = spanOf(it, fa, fb, fi); if (s) { if (s.s < lo) lo = addDays(s.s, -7); if (s.e > hi) hi = addDays(s.e, 21); } }
  if (road.zoom === 'year') { lo = addDays(lo, -30); hi = addDays(hi, 120); }
  lo = ymd(new Date(parseYmd(lo).getFullYear(), parseYmd(lo).getMonth(), 1));
  const days = diffDays(hi, lo) + 1;
  const width = days * px;
  const X = (d) => diffDays(d, lo) * px;

  // 月份列與刻度
  const months = [], ticks = [], weekends = [];
  for (let d = lo; d <= hi;) {
    const dt = parseYmd(d);
    const next = ymd(new Date(dt.getFullYear(), dt.getMonth() + 1, 1));
    months.push(h('div', { class: 'rm-month', style: { left: X(d) + 'px', width: (diffDays(next, d)) * px + 'px' } }, h('span', {}, `${dt.getFullYear()} 年 ${dt.getMonth() + 1} 月`)));
    d = next;
  }
  if (road.zoom === 'month') {
    for (let i = 0; i < days; i++) {
      const d = addDays(lo, i), dt = parseYmd(d), w = dt.getDay();
      ticks.push(h('div', { class: `rm-tick ${d === t ? 'now' : ''} ${w % 6 === 0 ? 'we' : ''}`, style: { left: i * px + 'px', width: px + 'px' } }, h('b', {}, dt.getDate()), h('small', {}, WEEK[w])));
      if (w % 6 === 0) weekends.push(h('div', { class: 'rm-weekend', style: { left: i * px + 'px', width: px + 'px' } }));
    }
  } else if (road.zoom === 'quarter') {
    for (let i = 0; i < days; i += 7) {
      const dt = parseYmd(addDays(lo, i));
      ticks.push(h('div', { class: 'rm-tick', style: { left: i * px + 'px', width: 7 * px + 'px' } }, h('small', {}, `${dt.getMonth() + 1}/${dt.getDate()}`)));
    }
  }
  const grid = h('div', { class: 'rm-layer', style: { width: width + 'px' } }, weekends);
  const iters = fi ? M.iterationList(fi).filter((x) => x.start <= hi && M.iterEnd(x) >= lo) : [];
  for (const x of iters) grid.append(h('div', { class: 'rm-iter', style: { left: X(x.start) + 'px', width: x.days * px + 'px' } }));
  if (t >= lo && t <= hi) grid.append(h('div', { class: 'rm-today', title: `今天 ${t}`, style: { left: X(t) + px / 2 + 'px' } }));

  const rows = h('div', { class: 'rm-rows' });
  const addList = (list) => { for (const it of list) rows.append(row(p, it, { fa, fb, fi, px, X, lo, width })); };
  if (v.group && M.fieldOf(p, v.group)) {
    const fg = M.fieldOf(p, v.group);
    for (const g of groupsOf(store, p, fg, items, { keepEmpty: false })) {
      const key = `${v.id}:${g.key}`;
      const shut = S.collapsed.has(key);
      rows.append(h('div', { class: 'rm-row rm-group', style: { width: nameW() + width + 'px' } }, h('div', { class: 'rm-name g-head', style: { '--c': g.color }, onclick: () => { if (shut) S.collapsed.delete(key); else S.collapsed.add(key); refresh(); } }, h('span', { class: 'caret' }, shut ? '▸' : '▾'), g.icon && h('span', {}, g.icon), h('b', {}, g.name), h('span', { class: 'count' }, g.items.length))));
      if (!shut) addList(g.items);
    }
  } else addList(items);

  const add = quickAdd({ placeholder: '＋ 新增項目' });
  add.dataset.key = 'road';
  const wrap = h('div', { class: 'rm-scroll' },
    h('div', { class: 'rm', style: { width: nameW() + width + 'px', '--rm-name': nameW() + 'px' } },
      h('div', { class: 'rm-head' }, h('div', { class: 'rm-corner' }, `${items.length} 個項目`), h('div', { class: `rm-time ${iters.length ? 'has-iter' : ''}`, style: { width: width + 'px' } }, h('div', { class: 'rm-months' }, months), h('div', { class: 'rm-ticks' }, ticks), iters.length > 0 && h('div', { class: 'rm-iters' }, iters.map((x) => h('div', { class: 'rm-iter-name', title: x.name, style: { left: X(x.start) + 'px', width: x.days * px + 'px' } }, x.name))))),
      h('div', { class: 'rm-bodywrap' }, h('div', { class: 'rm-gridwrap', style: { left: nameW() + 'px' } }, grid), rows),
      h('div', { class: 'rm-add' }, add)));
  const keep = host.firstChild && host.firstChild.classList.contains('rm-scroll') ? host.firstChild.scrollLeft : null;
  fill(host, wrap);
  // 第一次打開時把今天捲到看得到的位置
  wrap.scrollLeft = keep ?? Math.max(0, X(t) - (wrap.clientWidth - nameW()) / 4);
}

function row(p, it, ctx) {
  const { fa, fb, fi, px, X, width } = ctx;
  const span = spanOf(it, fa, fb, fi);
  const color = M.option(M.statusField(p), it.v.status)?.color || '#94a3b8';
  const track = h('div', {
    class: 'rm-track', style: { width: width + 'px' },
    onclick: (e) => {
      if (span || !fa || !fb || e.target !== track) return;
      const r = track.getBoundingClientRect();
      const d = addDays(ctx.lo, Math.floor((e.clientX - r.left) / px));
      store.tx('排定日期', () => { M.setValue(store, p, it, fa.id, d, me()); M.setValue(store, p, it, fb.id, addDays(d, 6), me()); });
    },
  });
  if (span) track.append(bar(p, it, span, ctx, color));
  else track.title = '點一下排定日期';
  const kind = M.option(M.fieldOf(p, 'kind'), it.v.kind);
  return h('div', { class: `rm-row ${it.closed ? 'closed' : ''} ${S.itemId === it.id ? 'cur' : ''}`, dataset: { id: it.id } },
    h('button', { class: 'rm-name', onclick: () => openItem(it.id) }, kind && h('span', {}, kind.icon), h('span', { class: 'no' }, `#${it.no}`), h('span', { class: 'tt' }, it.title)),
    track);
}

function bar(p, it, span, ctx, color) {
  const { px, X, fa, fb } = ctx;
  const len = (diffDays(span.e, span.s) + 1) * px;
  const people = it.v.assignees || [];
  const label = h('span', { class: 'rm-label' }, it.title);
  const tip = h('span', { class: 'rm-tip' });
  const el = h('div', {
    class: `rm-bar ${span.iter ? 'iter' : ''} ${it.closed ? 'closed' : ''}`, tabIndex: 0, role: 'button', 'aria-label': `${it.title}，${span.s} 到 ${span.e}`,
    title: `${it.title}\n${shortDate(span.s)} ～ ${shortDate(span.e)}`, style: { left: X(span.s) + 'px', width: Math.max(len, px) + 'px', '--c': color }, onclick: () => openItem(it.id),
  },
    !span.iter && h('i', { class: 'rm-h left' }), label, people.slice(0, 2).map((n) => avatar(n)), !span.iter && h('i', { class: 'rm-h right' }), tip);
  if (!span.iter) {
    el.addEventListener('pointerdown', (e) => {
      const mode = e.target.classList.contains('left') ? 'left' : e.target.classList.contains('right') ? 'right' : 'move';
      const l0 = X(span.s), w0 = len;
      let nS = span.s, nE = span.e;
      startDrag(e, {
        onStart: () => el.classList.add('drag'),
        onMove: (ev, dx) => {
          const n = Math.round(dx / px);
          nS = mode === 'right' ? span.s : addDays(span.s, n);
          nE = mode === 'left' ? span.e : addDays(span.e, n);
          if (nS > nE) { if (mode === 'left') nS = nE; else nE = nS; }
          el.style.left = l0 + diffDays(nS, span.s) * px + 'px';
          el.style.width = (diffDays(nE, nS) + 1) * px + 'px';
          tip.textContent = `${shortDate(nS)} ～ ${shortDate(nE)}`;
        },
        onEnd: (ev, canceled) => {
          el.classList.remove('drag');
          tip.textContent = '';
          if (canceled) { el.style.left = l0 + 'px'; el.style.width = w0 + 'px'; return; }
          if (nS === span.s && nE === span.e) return;
          store.tx('調整時程', () => { M.setValue(store, p, it, fa.id, nS, me()); M.setValue(store, p, it, fb.id, nE, me()); });
        },
      });
    });
  }
  return el;
}

export { pad2 };
