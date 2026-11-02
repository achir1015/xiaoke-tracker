// 項目詳細面板：內文、欄位、子項目、留言、活動紀錄
import { h, fill, md, timeAgo } from './util.js';
import { modal, menu, confirmBox, toast, promptBox, row } from './ui.js';
import { cellValue, editField, readOnly, avatar, progressBar, chip } from './cells.js';
import { store, S, me, openItem, refresh } from './state.js';
import * as M from './core/model.js';
import { defaultsFrom } from './views.js';

const drafts = { body: {}, comment: {} };

export function renderDetail(host) {
  const it = S.itemId && store.item(S.itemId);
  if (!it) { fill(host); host.classList.remove('open'); S.itemId = null; return; }
  const p = store.project(it.pid);
  if (!p) return;
  host.classList.add('open');
  const close = () => { S.itemId = null; refresh(); };
  const st = M.option(M.statusField(p), it.v.status);

  const title = h('textarea', {
    class: 'd-title', rows: 1, value: it.title, 'aria-label': '標題',
    onchange: (e) => { const t = e.target.value.replace(/\n/g, ' ').trim(); if (t) M.setValue(store, p, it, 'title', t, me()); else e.target.value = it.title; },
    onkeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.target.blur(); } },
    oninput: (e) => grow(e.target),
  });

  const bodyView = h('div', { class: 'md', onclick: (e) => { if (!e.target.closest('a')) editBody(); } });
  if (it.body) bodyView.innerHTML = md(it.body); else bodyView.append(h('span', { class: 'muted' }, '點這裡加上說明…'));
  const bodyBox = h('div', { class: 'd-body' }, bodyView);
  // 草稿留在 S.drafts，畫面重畫時打到一半的字才不會不見
  function editBody() {
    const ta = h('textarea', { rows: 8, value: drafts.body[it.id] ?? (it.body || ''), placeholder: '可以使用 Markdown：# 標題、- 清單、- [ ] 待辦、**粗體**', oninput: (e) => { drafts.body[it.id] = e.target.value; } });
    const end = () => { delete drafts.body[it.id]; };
    const save = () => { const b = ta.value; end(); if (b !== (it.body || '')) store.tx('修改內文', () => { store.touch('item', it); it.body = b; }); else refresh(true); };
    fill(bodyBox, ta, h('div', { class: 'row-end' }, h('button', { class: 'btn small', onclick: () => { end(); refresh(true); } }, '取消'), h('button', { class: 'btn small primary', onclick: save }, '儲存')));
    drafts.body[it.id] ??= it.body || '';
    ta.focus();
  }
  if (drafts.body[it.id] !== undefined) editBody();

  const fields = p.fields.filter((f) => !['title', 'updated'].includes(f.type)).map((f) => {
    const ro = readOnly(f);
    return h('div', { class: 'd-field' }, h('span', { class: 'd-label' }, f.name),
      h('button', { class: `d-val ${ro ? 'ro' : ''}`, disabled: ro, onclick: (e) => editField(e.currentTarget, p, it, f) }, cellValue(p, it, f) || h('span', { class: 'muted' }, ro ? '—' : '尚未設定')));
  });

  const kids = store.children(it.id);
  const addSub = h('input', {
    type: 'text', class: 'quick-add', placeholder: '＋ 新增子項目，按 Enter', 'aria-label': '新增子項目',
    onkeydown: (e) => {
      if (e.key !== 'Enter' || e.isComposing || !e.target.value.trim()) return;
      M.addItem(store, p, { title: e.target.value, parent: it.id, by: me(), v: { kind: it.v.kind } });
      S.refocusSub = true;
      e.target.value = '';
    },
  });
  if (S.refocusSub) { S.refocusSub = false; setTimeout(() => addSub.focus(), 0); }
  const sub = h('section', { class: 'd-sec' },
    h('h4', {}, '子項目', progressBar(M.subProgress(store, it))),
    kids.map((k) => h('div', { class: `sub ${k.closed ? 'closed' : ''}` },
      h('input', { type: 'checkbox', checked: k.closed, 'aria-label': `完成 ${k.title}`, onchange: (e) => M.setClosed(store, p, k, e.target.checked, me()) }),
      h('button', { class: 'link', onclick: () => openItem(k.id) }, `#${k.no} ${k.title}`))),
    addSub);

  const par = it.parent && store.item(it.parent);
  const commentBox = h('textarea', { rows: 2, value: drafts.comment[it.id] || '', placeholder: '寫下留言…（Ctrl+Enter 送出）', 'aria-label': '留言', oninput: (e) => { drafts.comment[it.id] = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter' && e.ctrlKey) send(); } });
  const send = () => { const t = commentBox.value.trim(); if (t) { delete drafts.comment[it.id]; M.addComment(store, it, t, me()); } };
  const timeline = [
    ...(it.comments || []).map((c) => ({ at: c.at, el: h('div', { class: 'cmt' }, avatar(c.by || '我'), h('div', {}, h('div', { class: 'cmt-head' }, h('b', {}, c.by || '我'), h('small', { class: 'muted' }, timeAgo(c.at))), h('div', { class: 'md', html: md(c.text) }))) })),
    ...(it.activity || []).map((a) => ({ at: a.at, el: h('div', { class: 'act' }, h('span', {}, '•'), h('span', {}, `${a.by ? a.by + ' ' : ''}${a.text}`), h('small', { class: 'muted' }, timeAgo(a.at))) })),
  ].sort((a, b) => a.at - b.at).slice(-60);

  fill(host, 
    h('div', { class: 'd-head' },
      h('span', { class: 'no' }, `#${it.no}`), st && chip(st.name, st.color, st.icon), it.archived && chip('已封存', '#64748b', '📦'),
      h('span', { class: 'sp' }),
      h('button', { class: 'btn small', onclick: () => M.setClosed(store, p, it, !it.closed, me()) }, it.closed ? '↩ 重新開啟' : '✔ 完成'),
      h('button', { class: 'icon-btn', title: '更多', 'aria-label': '更多動作', onclick: (e) => itemMenu(e.currentTarget, p, it) }, '⋯'),
      h('button', { class: 'icon-btn', title: '關閉', 'aria-label': '關閉面板', onclick: close }, '✕')),
    h('div', { class: 'd-scroll' },
      par && h('button', { class: 'link d-parent', onclick: () => openItem(par.id) }, `⬆ 父項目：#${par.no} ${par.title}`),
      title, bodyBox,
      h('section', { class: 'd-sec d-fields' }, fields),
      sub,
      h('section', { class: 'd-sec' }, h('h4', {}, '留言與活動'), timeline.map((x) => x.el), h('div', { class: 'cmt-new' }, commentBox, h('button', { class: 'btn small primary', onclick: send }, '送出')))));
  grow(title);
}

const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };

function itemMenu(anchor, p, it) {
  menu(anchor, [
    { icon: '📑', label: '複製項目', onClick: () => { const n = M.addItem(store, p, { title: `${it.title}（副本）`, body: it.body, v: JSON.parse(JSON.stringify(it.v)), parent: it.parent, by: me() }); openItem(n.id); } },
    { icon: '🔗', label: '複製編號與標題', onClick: () => { navigator.clipboard.writeText(`#${it.no} ${it.title}`); toast('已複製'); } },
    { icon: '➡️', label: '移到其他專案', disabled: store.projects().length < 2, onClick: () => moveDialog(p, it) },
    { sep: true },
    it.archived ? { icon: '📤', label: '從封存還原', onClick: () => M.archive(store, [it], false) } : { icon: '📦', label: '封存', onClick: () => { M.archive(store, [it]); S.itemId = null; toast('已封存', { action: { label: '復原', onClick: () => store.undo() } }); } },
    { icon: '🗑️', label: '刪除', danger: true, onClick: async () => { if (await confirmBox(`要刪除「${it.title}」嗎？`, { ok: '刪除', danger: true })) { M.deleteItems(store, [it]); S.itemId = null; refresh(); } } },
  ], { width: 180, align: 'right' });
}

async function moveDialog(p, it) {
  const list = store.projects().filter((x) => x.id !== p.id);
  const sel = h('select', {}, list.map((x) => h('option', { value: x.id }, `${x.icon} ${x.name}`)));
  const ok = await modal({ title: '移到其他專案', body: row('目標專案', sel, '單選欄位會比對同名選項，對不上的值會清除'), buttons: [{ label: '取消' }, { label: '移動', primary: true, value: true }] }).done;
  if (!ok) return;
  const q = store.project(sel.value);
  store.tx('移到其他專案', () => {
    const v = {};
    for (const f of q.fields) {
      const src = p.fields.find((x) => x.id === f.id || x.name === f.name);
      if (!src || it.v[src.id] == null) continue;
      if (f.type !== src.type) continue;
      if (f.type === 'select') { const name = M.option(src, it.v[src.id])?.name; const o = f.options.find((x) => x.name === name); if (o) v[f.id] = o.id; } else if (f.type === 'multi') { const names = it.v[src.id].map((id) => M.option(src, id)?.name); const ids = f.options.filter((x) => names.includes(x.name)).map((x) => x.id); if (ids.length) v[f.id] = ids; } else if (f.type !== 'iteration') v[f.id] = it.v[src.id];
    }
    const n = M.addItem(store, q, { title: it.title, body: it.body, v, by: me() });
    store.touch('item', n);
    n.comments = it.comments; n.activity = [...(it.activity || []), { at: store.now(), by: me(), text: `從「${p.name}」移過來` }];
    M.deleteItems(store, [it]);
    S.itemId = n.id;
  });
  toast(`已移到「${q.name}」`);
}

// 工具列的「新增項目」：可以一次填好常用欄位
export function newItemDialog(p, v) {
  const title = h('input', { type: 'text', placeholder: '要做什麼？' });
  const body = h('textarea', { rows: 3, placeholder: '說明（可不填）' });
  const pick = (f) => h('select', {}, h('option', { value: '' }, '—'), f.options.map((o) => h('option', { value: o.id }, `${o.icon || ''} ${o.name}`)));
  const fs = M.statusField(p), fp = M.fieldOf(p, 'priority'), fk = M.fieldOf(p, 'kind');
  const def = defaultsFrom(p, v);
  const sSel = pick(fs); sSel.value = def.status || '';
  const pSel = fp && pick(fp), kSel = pick(fk);
  const due = h('input', { type: 'date' });
  const who = h('input', { type: 'text', value: '', placeholder: '多人用逗號分開', list: 'memberList' });
  const dl = h('datalist', { id: 'memberList' }, (p.members || []).map((n) => h('option', { value: n })));
  const create = (close, more) => {
    const t = title.value.trim();
    if (!t) { title.focus(); return; }
    const vals = { ...def };
    if (sSel.value) vals.status = sSel.value;
    if (pSel && pSel.value) vals.priority = pSel.value;
    if (kSel.value) vals.kind = kSel.value;
    if (due.value) vals.due = due.value;
    store.tx(`新增項目「${t}」`, () => {
      const it = M.addItem(store, p, { title: t, body: body.value, v: vals, by: me() });
      const names = who.value.split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
      if (names.length) M.setValue(store, p, it, 'assignees', M.coerce(store, p, M.fieldOf(p, 'assignees'), names), me());
    });
    if (more) { title.value = ''; body.value = ''; title.focus(); toast('已新增'); } else close();
  };
  const m = modal({
    title: '新增項目',
    body: h('div', { class: 'form-grid' },
      h('div', { class: 'span2' }, row('標題', title)), h('div', { class: 'span2' }, row('說明', body)),
      row('狀態', sSel), fp && row('優先度', pSel), row('類型', kSel), row('目標日', due), h('div', { class: 'span2' }, row('負責人', who), dl)),
    buttons: [{ label: '取消' }, { label: '新增並繼續', onClick: (close) => create(close, true) }, { label: '新增', primary: true, onClick: (close) => create(close, false) }],
  });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); create(m.close, false); } });
}

export { promptBox };
