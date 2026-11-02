import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/app/js/core/store.js';
import * as M from '../src/app/js/core/model.js';
import { addDays, today, TEMPLATES } from '../src/app/js/core/defs.js';
import { chartData } from '../src/app/js/core/insights.js';

const setup = (template = 'kanban') => { const s = new Store(); const p = M.createProject(s, { name: '測試', template }); return { s, p }; };

test('每個範本都能建立，狀態工作流程指向存在的選項', () => {
  for (const t of TEMPLATES) {
    const s = new Store();
    const p = M.createProject(s, { template: t.id });
    const ids = M.statusField(p).options.map((o) => o.id);
    for (const w of ['added', 'closed', 'reopened', 'assigned']) assert.ok(ids.includes(p.workflows[w].status), `${t.id}.${w}`);
    assert.equal(s.items(p.id).length, t.items.length);
    assert.ok(M.doneOptions(p).length >= 1, t.id);
  }
});

test('新增項目：編號遞增、狀態自動設定', () => {
  const { s, p } = setup('blank');
  const a = M.addItem(s, p, { title: 'A' });
  const b = M.addItem(s, p, { title: 'B' });
  assert.deepEqual([a.no, b.no], [1, 2]);
  assert.equal(a.v.status, 'todo');
  assert.ok(b.order > a.order);
});

test('狀態與關閉互相連動', () => {
  const { s, p } = setup('blank');
  const a = M.addItem(s, p, { title: 'A' });
  M.setValue(s, p, a, 'status', 'done');
  assert.equal(a.closed, true);
  assert.ok(a.closedAt);
  M.setClosed(s, p, a, false);
  assert.equal(a.v.status, 'doing');
  M.setClosed(s, p, a, true);
  assert.equal(a.v.status, 'done');
});

test('子項目全部完成時父項目自動關閉', () => {
  const { s, p } = setup('blank');
  const par = M.addItem(s, p, { title: '父' });
  const k1 = M.addItem(s, p, { title: '子1', parent: par.id });
  const k2 = M.addItem(s, p, { title: '子2', parent: par.id });
  M.setClosed(s, p, k1, true);
  assert.deepEqual(M.subProgress(s, par), { done: 1, total: 2 });
  assert.equal(par.closed, false);
  M.setClosed(s, p, k2, true);
  assert.equal(par.closed, true);
});

test('指定負責人工作流程預設關閉，開啟後才改狀態', () => {
  const { s, p } = setup('blank');
  const a = M.addItem(s, p, { title: 'A' });
  M.setValue(s, p, a, 'assignees', ['小明']);
  assert.equal(a.v.status, 'todo');
  p.workflows.assigned.on = true;
  const b = M.addItem(s, p, { title: 'B' });
  M.setValue(s, p, b, 'assignees', ['小明']);
  assert.equal(b.v.status, 'doing');
});

test('復原與重做：一次操作含自動化連動', () => {
  const { s, p } = setup('blank');
  const a = M.addItem(s, p, { title: 'A' });
  M.setValue(s, p, a, 'status', 'done');
  assert.equal(s.item(a.id).closed, true);
  s.undo();
  assert.equal(s.item(a.id).closed, false);
  assert.equal(s.item(a.id).v.status, 'todo');
  s.redo();
  assert.equal(s.item(a.id).closed, true);
  s.undo(); s.undo();
  assert.equal(s.item(a.id), null);
  s.redo();
  assert.equal(s.item(a.id).title, 'A');
});

test('tx 內出錯要還原', () => {
  const { s, p } = setup('blank');
  const a = M.addItem(s, p, { title: 'A' });
  assert.throws(() => s.tx('壞', () => { s.touch('item', a); a.title = 'B'; throw new Error('x'); }));
  assert.equal(s.item(a.id).title, 'A');
});

test('刪除欄位會清掉檢視與項目的參照；內建欄位不能刪', () => {
  const { s, p } = setup('blank');
  const f = M.addField(s, p, { name: '客戶', type: 'select', options: [{ id: 'x', name: 'X', color: '#000', icon: '' }] });
  const a = M.addItem(s, p, { title: 'A' });
  M.setValue(s, p, a, f.id, 'x');
  const v = p.views[0];
  M.editView(s, p, v.id, { group: f.id, sort: [{ f: f.id, dir: 'asc' }], hidden: [f.id] });
  M.deleteField(s, p, f.id);
  assert.equal(M.fieldOf(p, f.id), null);
  assert.equal(p.views[0].group, '');
  assert.deepEqual(p.views[0].sort, []);
  assert.equal(a.v[f.id], undefined);
  assert.throws(() => M.deleteField(s, p, 'status'));
});

test('刪除選項會清掉項目上的值', () => {
  const { s, p } = setup('blank');
  const a = M.addItem(s, p, { title: 'A', v: { labels: ['l1', 'l2'], priority: 'p0' } });
  M.deleteOption(s, p, 'labels', 'l1');
  M.deleteOption(s, p, 'priority', 'p0');
  assert.deepEqual(a.v.labels, ['l2']);
  assert.equal(a.v.priority, undefined);
});

test('拖曳排序與換欄', () => {
  const { s, p } = setup('blank');
  const [a, b, c] = ['A', 'B', 'C'].map((title) => M.addItem(s, p, { title }));
  M.moveItem(s, p, c, a);
  assert.deepEqual(s.items(p.id).map((x) => x.title), ['C', 'A', 'B']);
  M.moveItem(s, p, c, null, { f: 'status', v: 'done' });
  assert.deepEqual(s.items(p.id).map((x) => x.title), ['A', 'B', 'C']);
  assert.equal(c.closed, true);
  M.moveItem(s, p, a, b);
  assert.deepEqual(s.items(p.id).map((x) => x.title), ['A', 'B', 'C']);
});

test('自動封存依篩選條件', () => {
  const { s, p } = setup('blank');
  const a = M.addItem(s, p, { title: '舊' });
  const b = M.addItem(s, p, { title: '新' });
  M.setClosed(s, p, a, true);
  M.setClosed(s, p, b, true);
  p.workflows.autoArchive = { on: true, filter: 'is:closed title:舊' };
  assert.equal(M.sweep(s, p), 1);
  assert.equal(a.archived, true);
  assert.equal(s.items(p.id).length, 1);
  assert.equal(s.items(p.id, { archived: true }).length, 1);
});

test('迭代接續排程', () => {
  const { p } = setup('dev');
  const f = M.fieldOf(p, 'iteration');
  assert.equal(f.iter.list.length, 3);
  assert.equal(f.iter.list[1].start, addDays(M.iterEnd(f.iter.list[0]), 1));
  assert.equal(M.nextIteration(f).name, '迭代 4');
});

test('複製專案：可帶項目與父子關係', () => {
  const { s, p } = setup('blank');
  const par = M.addItem(s, p, { title: '父' });
  M.addItem(s, p, { title: '子', parent: par.id });
  const c = M.copyProject(s, p, { withItems: true });
  const list = s.items(c.id);
  assert.equal(list.length, 2);
  assert.equal(list[1].parent, list[0].id);
  assert.notEqual(list[0].id, par.id);
  assert.equal(M.copyProject(s, p, {}).id !== c.id, true);
});

test('CSV 匯出再匯入：引號、逗號、換行、新選項', () => {
  const { s, p } = setup('blank');
  const a = M.addItem(s, p, { title: '含,逗號"引號"\n換行', v: { priority: 'p1', labels: ['l1', 'l2'], due: '2026-12-01', estimate: 3 } });
  const csv = M.toCSV(s, p, [a]);
  const { s: s2, p: p2 } = setup('blank');
  assert.equal(M.importCSV(s2, p2, csv), 1);
  const b = s2.items(p2.id)[0];
  assert.equal(b.title, a.title.trim());
  assert.equal(b.v.priority, 'p1');
  assert.deepEqual(b.v.labels, ['l1', 'l2']);
  assert.equal(b.v.due, '2026-12-01');
  assert.equal(b.v.estimate, 3);
  assert.equal(M.importCSV(s2, p2, '標題,客戶,優先度\n新項目,甲,超急\n'), 1);
  const c = s2.items(p2.id).at(-1);
  assert.equal(M.option(M.fieldOf(p2, 'priority'), c.v.priority).name, '超急');
});

test('摘要與逾期', () => {
  const { s, p } = setup('blank');
  M.addItem(s, p, { title: '逾期', v: { due: addDays(today(), -1) } });
  M.addItem(s, p, { title: '將到期', v: { due: addDays(today(), 3) } });
  const c = M.addItem(s, p, { title: '完成' });
  M.setClosed(s, p, c, true);
  const r = M.summary(s, p);
  assert.equal(r.total, 3);
  assert.equal(r.overdue.length, 1);
  assert.equal(r.soon.length, 1);
  assert.equal(r.pct, 33);
});

test('洞察：依欄位統計與堆疊、累積趨勢', () => {
  const { s, p } = setup('blank');
  const a = M.addItem(s, p, { title: 'A', v: { priority: 'p0', estimate: 2 } });
  M.addItem(s, p, { title: 'B', v: { priority: 'p0', estimate: 3 } });
  M.addItem(s, p, { title: 'C', v: { priority: 'p1' } });
  M.setClosed(s, p, a, true);
  const c1 = chartData(s, p, { x: 'priority', y: 'count', group: '', filter: '' });
  assert.deepEqual(c1.labels, ['緊急', '高']);
  assert.deepEqual(c1.series[0].data, [2, 1]);
  const c2 = chartData(s, p, { x: 'priority', y: 'estimate', group: '', filter: '' });
  assert.deepEqual(c2.series[0].data, [5, 0]);
  const c3 = chartData(s, p, { x: 'priority', y: 'count', group: 'status', filter: '' });
  assert.equal(c3.series.reduce((n, x) => n + x.data[0], 0), 2);
  const c4 = chartData(s, p, { x: '@time', y: 'count', days: 7 });
  assert.equal(c4.labels.length, 7);
  assert.equal(c4.series[0].data[6], 1);
  assert.equal(c4.series[1].data[6], 3);
});
