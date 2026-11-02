// 表格檢視：行內編輯、分組、拖曳排序、欄寬、大量操作
import { h, fill, startDrag, $$ } from './util.js';
import { menu, confirmBox, promptBox, toast } from './ui.js';
import { cellValue, editField, readOnly } from './cells.js';
import { store, S, me, openItem, refresh } from './state.js';
import * as M from './core/model.js';
import { groupsOf, sumOf } from './core/query.js';
import { viewItems, shownFields, quickAdd, groupValuePatch, groupMove } from './views.js';

const DEF_W = { assignees: 150, status: 130, priority: 110, kind: 110, labels: 170, due: 100, start: 100, estimate: 90, progress: 120, iteration: 130, milestone: 130, parent: 200, links: 80, updated: 110 };

export function renderTable(p, v, host) {
  const items = viewItems(p, v);
  const cols = shownFields(p, v);
  const width = (f) => (v.widths && v.widths[f.id]) || DEF_W[f.id] || 140;
  const titleW = (v.widths && v.widths.title) || 340;

  const head = h('tr', {},
    h('th', { class: 'c-check' }, h('input', { type: 'checkbox', 'aria-label': '全選', checked: items.length > 0 && items.every((i) => S.selected.has(i.id)), onchange: (e) => { for (const it of items) { if (e.target.checked) S.selected.add(it.id); else S.selected.delete(it.id); } refresh(); } })),
    h('th', { class: 'c-title', style: { width: titleW + 'px' } }, headLabel(p, v, M.fieldOf(p, 'title')), resizer(p, v, 'title')),
    cols.map((f) => h('th', { style: { width: width(f) + 'px' } }, headLabel(p, v, f), resizer(p, v, f.id))),
    h('th', { class: 'c-add' }, h('button', { class: 'icon-btn', title: '顯示或新增欄位', onclick: (e) => import('./toolbar.js').then((t) => t.fieldsMenu(e.currentTarget || e.target, p, v)) }, '＋')));

  const body = h('tbody', {});
  const numeric = cols.filter((f) => f.type === 'number');
  const addRows = (list, gKey, gField) => { for (const it of list) body.append(itemRow(p, v, it, cols, gKey, gField)); };
  if (v.group && M.fieldOf(p, v.group)) {
    const fg = M.fieldOf(p, v.group);
    for (const g of groupsOf(store, p, fg, items, { keepEmpty: fg.type === 'select' || fg.type === 'iteration' })) {
      const key = `${v.id}:${g.key}`;
      const shut = S.collapsed.has(key);
      body.append(h('tr', { class: 'g-row', dataset: { gkey: g.key } }, h('td', { colSpan: cols.length + 3 },
        h('div', { class: 'g-head', style: { '--c': g.color }, onclick: () => { if (shut) S.collapsed.delete(key); else S.collapsed.add(key); refresh(); } },
          h('span', { class: 'caret' }, shut ? '▸' : '▾'), g.icon && h('span', {}, g.icon), h('b', {}, g.name), h('span', { class: 'count' }, g.items.length),
          numeric.map((f) => h('small', { class: 'sum' }, `${f.name} ${sumOf(g.items, f.id)}`))))));
      if (!shut) {
        addRows(g.items, g.key, fg);
        body.append(h('tr', { class: 'add-row' }, h('td', {}), h('td', { colSpan: cols.length + 2 }, keyed(quickAdd({ patch: groupValuePatch(fg, g.key) }), `g:${g.key}`))));
      }
    }
  } else {
    addRows(items);
    body.append(h('tr', { class: 'add-row' }, h('td', {}), h('td', { colSpan: cols.length + 2 }, keyed(quickAdd({}), 'main'))));
  }

  const foot = numeric.length && !v.group ? h('tfoot', {}, h('tr', {}, h('td', {}), h('td', { class: 'muted' }, `共 ${items.length} 項`), cols.map((f) => h('td', {}, f.type === 'number' ? h('b', {}, String(sumOf(items, f.id))) : null)), h('td', {}))) : null;
  const total = 44 + titleW + cols.reduce((a, f) => a + width(f), 0) + 44;
  const table = h('table', { class: 'tbl', style: { width: total + 'px' } }, h('thead', {}, head), body, foot);
  fill(host, h('div', { class: 'tbl-wrap' }, table));
  if (!items.length && !(S.liveFilter || v.filter)) host.firstChild.append(h('p', { class: 'empty' }, '這裡還沒有項目，在上面的「新增項目」輸入第一件事吧！'));
  else if (!items.length) host.firstChild.append(h('p', { class: 'empty' }, '沒有符合篩選條件的項目'));
}

const keyed = (el, k) => { el.dataset.key = k; return el; };

function headLabel(p, v, f) {
  const s = (v.sort || []).find((x) => x.f === f.id);
  const setSort = (dir) => M.editView(store, p, v.id, { sort: dir ? [{ f: f.id, dir }] : [] }, '修改排序');
  return h('button', {
    class: 'th-btn',
    onclick: (e) => menu(e.currentTarget, [
      { icon: '🔼', label: '由小到大排序', onClick: () => setSort('asc') },
      { icon: '🔽', label: '由大到小排序', onClick: () => setSort('desc') },
      s && { icon: '✕', label: '取消排序', onClick: () => setSort(null) },
      f.id !== 'title' && { icon: '🗂️', label: v.group === f.id ? '取消分組' : '依這個欄位分組', onClick: () => M.editView(store, p, v.id, { group: v.group === f.id ? '' : f.id }, '修改分組') },
      { sep: true },
      { icon: '✏️', label: '重新命名', onClick: async () => { const n = await promptBox('欄位名稱', { value: f.name }); if (n) store.tx('重新命名欄位', () => { store.touch('project', p); f.name = n; }); } },
      f.id !== 'title' && { icon: '🙈', label: '在這個檢視隱藏', onClick: () => M.editView(store, p, v.id, { hidden: [...(v.hidden || []), f.id] }, '隱藏欄位') },
    ], { width: 190 }),
  }, f.name, s && h('span', { class: 'sort-mark' }, s.dir === 'desc' ? ' ↓' : ' ↑'));
}

function resizer(p, v, id) {
  return h('span', {
    class: 'col-resize',
    onpointerdown: (e) => {
      e.stopPropagation();
      const th = e.target.parentElement, w0 = th.offsetWidth, table = th.closest('table'), t0 = table.offsetWidth;
      let w = w0;
      startDrag(e, {
        threshold: 1,
        onMove: (ev, dx) => { w = Math.max(70, w0 + dx); th.style.width = w + 'px'; table.style.width = t0 + (w - w0) + 'px'; },
        onEnd: (ev, canceled) => { if (!canceled) M.editView(store, p, v.id, { widths: { ...(v.widths || {}), [id]: Math.round(w) } }, ''); },
      });
    },
  });
}

function itemRow(p, v, it, cols, gKey, gField) {
  const sel = S.selected.has(it.id);
  const tr = h('tr', { class: `row ${it.closed ? 'closed' : ''} ${sel ? 'sel' : ''} ${S.itemId === it.id ? 'cur' : ''}`, dataset: { id: it.id, gkey: gKey ?? '' } });
  const openBtn = h('button', { class: 'title-btn', onclick: () => openItem(it.id) }, h('span', { class: 'st-dot', style: { color: statusColor(p, it) } }, it.closed ? '✔' : '●'), h('span', { class: 'no' }, `#${it.no}`), h('span', { class: 'tt' }, it.title));
  const kind = M.option(M.fieldOf(p, 'kind'), it.v.kind);
  tr.append(...[
    h('td', { class: 'c-check' },
      h('span', { class: 'grip', title: '拖曳可調整順序', onpointerdown: (e) => dragRow(e, p, v, it, tr, gKey, gField) }, '⋮⋮'),
      h('input', { type: 'checkbox', 'aria-label': `選取 #${it.no}`, checked: sel, onchange: (e) => { if (e.target.checked) S.selected.add(it.id); else S.selected.delete(it.id); refresh(); } })),
    h('td', { class: 'c-title' }, kind && h('span', { class: 'kind', title: kind.name }, kind.icon), openBtn),
    cols.map((f) => {
      const ro = readOnly(f);
      return h('td', { class: ro ? 'ro' : 'ed', tabIndex: ro ? null : 0, onclick: ro ? null : (e) => editField(e.currentTarget, p, it, f), onkeydown: ro ? null : (e) => { if (e.key === 'Enter') editField(e.currentTarget, p, it, f); } }, cellValue(p, it, f));
    }),
    h('td', {})].flat());
  return tr;
}

const statusColor = (p, it) => M.option(M.statusField(p), it.v.status)?.color || '#94a3b8';

function dragRow(e, p, v, it, tr, gKey, gField) {
  if (v.sort && v.sort.length) { toast('有排序時不能手動調整順序，請先取消排序'); return; }
  let target = null, after = false, line = null;
  startDrag(e, {
    onStart: () => { tr.classList.add('drag'); line = h('div', { class: 'drop-line' }); document.body.append(line); },
    onMove: (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const row = el && el.closest('tr.row, tr.g-row');
      target = row || null;
      if (!row) { line.style.display = 'none'; return; }
      const r = row.getBoundingClientRect();
      after = ev.clientY > r.top + r.height / 2 || row.classList.contains('g-row');
      line.style.cssText = `display:block;left:${r.left}px;width:${r.width}px;top:${(after ? r.bottom : r.top) - 1}px`;
    },
    onEnd: (ev, canceled) => {
      tr.classList.remove('drag');
      line.remove();
      if (canceled || !target || target.dataset.id === it.id) return;
      const rows = $$('tr.row', tr.closest('table'));
      let before = null;
      if (target.classList.contains('row')) {
        const i = rows.indexOf(target);
        const nb = after ? rows[i + 1] : target;
        before = nb && nb.dataset.id !== it.id ? store.item(nb.dataset.id) : nb ? store.item(rows[rows.indexOf(nb) + 1]?.dataset.id) : null;
      } else {
        const nb = rows.find((r) => target.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
        before = nb ? store.item(nb.dataset.id) : null;
      }
      const toKey = target.dataset.gkey ?? '';
      const patch = gField && toKey !== (gKey ?? '') ? groupMove(store, p, it, gField, gKey, toKey) : null;
      M.moveItem(store, p, it, before, patch);
    },
    hold: 30,
  });
}

// 勾選多筆後出現的操作列
export function bulkBar(p) {
  const n = S.selected.size;
  if (!n) return null;
  const list = () => [...S.selected].map((id) => store.item(id)).filter(Boolean);
  const clear = () => { S.selected.clear(); refresh(); };
  const setBulk = (e, f) => {
    const opts = f.options.map((o) => ({ icon: o.icon || '•', label: o.name, onClick: () => { store.tx(`批次修改${f.name}`, () => { for (const it of list()) M.setValue(store, p, it, f.id, o.id, me()); }); clear(); } }));
    menu(e.currentTarget, opts, { width: 180 });
  };
  return h('div', { class: 'bulk' },
    h('b', {}, `已選 ${n} 項`),
    h('button', { class: 'btn small', onclick: (e) => setBulk(e, M.statusField(p)) }, '🔘 改狀態'),
    M.fieldOf(p, 'priority') && h('button', { class: 'btn small', onclick: (e) => setBulk(e, M.fieldOf(p, 'priority')) }, '🔥 改優先度'),
    h('button', { class: 'btn small', onclick: () => { store.tx('批次關閉', () => { for (const it of list()) M.setClosed(store, p, it, true, me()); }); clear(); } }, '✔ 關閉'),
    h('button', { class: 'btn small', onclick: () => { M.archive(store, list()); clear(); toast(`已封存 ${n} 項`, { action: { label: '復原', onClick: () => store.undo() } }); } }, '📦 封存'),
    h('button', { class: 'btn small danger', onclick: async () => { if (await confirmBox(`要刪除選取的 ${n} 個項目嗎？可以用「復原」救回。`, { ok: '刪除', danger: true })) { M.deleteItems(store, list()); clear(); } } }, '🗑️ 刪除'),
    h('button', { class: 'btn small ghost', onclick: clear }, '取消選取'));
}
