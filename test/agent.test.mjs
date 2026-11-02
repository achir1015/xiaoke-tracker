import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/app/js/core/store.js';
import * as M from '../src/app/js/core/model.js';
import { callTool, runAgent, TOOLS, outputText } from '../src/app/js/core/agent.js';

const setup = () => {
  const store = new Store();
  const p = M.createProject(store, { name: '小柯官網', template: 'blank' });
  return { store, p, ctx: { store, me: '吳玉柱', projectId: p.id } };
};

test('工具宣告符合 Responses API 格式', () => {
  for (const t of TOOLS) {
    assert.equal(t.type, 'function');
    assert.equal(t.strict, false);
    assert.ok(t.name && t.description);
    assert.equal(t.parameters.type, 'object');
    assert.ok(t.parameters.required.every((r) => r in t.parameters.properties), t.name);
  }
});

test('新增項目：用欄位名稱與文字值，子項目用 #編號', async () => {
  const { store, p, ctx } = setup();
  const a = await callTool('create_item', { project: '小柯', title: '首頁', fields: { 優先度: '高', 目標日: '2026-12-1', 負責人: '小明,小華', 標籤: '前端,新標籤' } }, ctx);
  assert.equal(a.優先度, '高');
  assert.equal(a.目標日, '2026-12-01');
  assert.deepEqual(p.members, ['小明', '小華']);
  assert.ok(M.fieldOf(p, 'labels').options.find((o) => o.name === '新標籤'));
  await callTool('create_item', { project: p.id, title: '子', parent: '#1' }, ctx);
  assert.equal(store.children(a.id).length, 1);
});

test('不存在的欄位與不正確的值回報問題，不中斷', async () => {
  const { ctx } = setup();
  const r = await callTool('create_item', { project: '小柯官網', title: 'x', fields: { 亂寫: 1, 目標日: '明天' } }, ctx);
  assert.equal(r.問題.length, 2);
});

test('修改與關閉、搜尋', async () => {
  const { store, ctx } = setup();
  const a = await callTool('create_item', { project: '小柯官網', title: '原標題' }, ctx);
  await callTool('update_item', { item: '#1', title: '新標題', fields: { 狀態: '進行中' } }, ctx);
  assert.equal(store.item(a.id).title, '新標題');
  assert.equal(store.item(a.id).v.status, 'doing');
  await callTool('update_item', { item: a.id, closed: true }, ctx);
  assert.equal(store.item(a.id).v.status, 'done');
  const r = await callTool('search_items', { project: '小柯官網', query: 'is:closed' }, ctx);
  assert.equal(r.共, 1);
  const all = await callTool('search_items', { query: '新標題' }, ctx);
  assert.equal(all.項目[0].專案, '小柯官網');
});

test('刪除一定要使用者同意', async () => {
  const { store, ctx } = setup();
  const a = await callTool('create_item', { project: '小柯官網', title: 'x' }, ctx);
  const no = await callTool('delete_items', { items: ['#1'] }, { ...ctx, confirm: async () => false });
  assert.ok(no.取消);
  assert.ok(store.item(a.id));
  const none = await callTool('delete_items', { items: ['#1'] }, ctx);  // 沒有確認機制時視同拒絕
  assert.ok(none.取消);
  await callTool('delete_items', { items: ['#1'] }, { ...ctx, confirm: async () => true });
  assert.equal(store.item(a.id), null);
});

test('找不到專案時回報現有清單', async () => {
  const { ctx } = setup();
  await assert.rejects(callTool('project_detail', { project: '沒有這個' }, ctx), /現有專案：小柯官網/);
});

test('代理迴圈：工具呼叫、接續 previous_response_id、錯誤回給模型', async () => {
  const { store, ctx } = setup();
  const seen = [];
  const replies = [
    { id: 'r1', output: [{ type: 'reasoning' }, { type: 'function_call', call_id: 'c1', name: 'create_item', arguments: JSON.stringify({ project: '小柯官網', title: 'AI 建的' }) }, { type: 'function_call', call_id: 'c2', name: 'get_item', arguments: '{"item":"#99"}' }] },
    { id: 'r2', output: [{ type: 'message', content: [{ type: 'output_text', text: '建好了 #1' }] }] },
  ];
  const post = async (body) => { seen.push(body); return replies.shift(); };
  const steps = [];
  const r = await runAgent({ post, text: '幫我建', model: 'm', ctx, onStep: (s) => steps.push(s) });
  assert.equal(r.text, '建好了 #1');
  assert.deepEqual(r.changed, ['create_item']);
  assert.equal(r.undoCount, 1);
  assert.equal(seen[1].previous_response_id, 'r1');
  assert.equal(seen[1].input[0].call_id, 'c1');
  assert.match(seen[1].input[1].output, /找不到項目/);
  assert.equal(steps.filter((s) => s.phase === 'error').length, 1);
  assert.equal(store.items(ctx.projectId).length, 1);
  store.undo();
  assert.equal(store.items(ctx.projectId).length, 0);
});

test('步驟上限避免無限迴圈；API 錯誤往外丟', async () => {
  const { ctx } = setup();
  const loop = async () => ({ id: 'x', output: [{ type: 'function_call', call_id: 'c', name: 'list_projects', arguments: '{}' }] });
  const r = await runAgent({ post: loop, text: 'x', model: 'm', ctx, maxSteps: 3 });
  assert.match(r.text, /繼續/);
  await assert.rejects(runAgent({ post: async () => ({ error: { message: '金鑰錯誤' } }), text: 'x', model: 'm', ctx }), /金鑰錯誤/);
});

test('outputText 兩種格式都讀得到', () => {
  assert.equal(outputText({ output_text: 'a' }), 'a');
  assert.equal(outputText({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'b' }] }] }), 'b');
});
