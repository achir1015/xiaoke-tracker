import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/app/js/core/store.js';
import * as M from '../src/app/js/core/model.js';
import { Sync, encodePairing, decodePairing } from '../src/app/js/core/sync.js';
import { loadGas } from './gas-mock.mjs';

// 一台裝置：自己的 Store 和游標；用 clock 模擬時鐘
function device(gas, token = 'test-token', skew = 0) {
  const store = new Store({ now: () => Date.now() + skew });
  let cursor = 0;
  const sync = new Sync(store, async (body) => gas.post({ token, ...body }), { getCursor: () => cursor, setCursor: (x) => { cursor = x; } });
  return { store, sync, cursor: () => cursor };
}

test('金鑰錯誤被擋下，不會寫入', async () => {
  const gas = loadGas();
  const d = device(gas, 'wrong');
  M.createProject(d.store, { name: 'A' });
  await assert.rejects(d.sync.run(), /同步金鑰不正確/);
  assert.equal(d.sync.state.status, 'error');
  assert.ok(Object.keys(d.store.dirty).length > 0);
  assert.equal(gas.post({ token: 'test-token', action: 'ping' }).count, 0);
});

test('兩台裝置互相同步：新增、修改、刪除', async () => {
  const gas = loadGas();
  const a = device(gas), b = device(gas);
  const pa = M.createProject(a.store, { name: '專案', template: 'blank' });
  const it = M.addItem(a.store, pa, { title: '事項' });
  await a.sync.run();
  assert.deepEqual(a.store.dirty, {});
  await b.sync.run();
  const pb = b.store.project(pa.id);
  assert.equal(pb.name, '專案');
  assert.equal(b.store.item(it.id).title, '事項');
  M.setValue(b.store, pb, b.store.item(it.id), 'status', 'done');
  await b.sync.run();
  await a.sync.run();
  assert.equal(a.store.item(it.id).closed, true);
  M.deleteItems(a.store, [a.store.item(it.id)]);
  await a.sync.run();
  await b.sync.run();
  assert.equal(b.store.item(it.id), null);
});

test('同一筆同時修改：時間新的贏，舊的那台收到結果', async () => {
  const gas = loadGas();
  const a = device(gas), b = device(gas, 'test-token', 5000);  // b 的時鐘快 5 秒
  const p = M.createProject(a.store, { name: 'P', template: 'blank' });
  const it = M.addItem(a.store, p, { title: '原本' });
  await a.sync.run(); await b.sync.run();
  M.setValue(b.store, b.store.project(p.id), b.store.item(it.id), 'title', 'B 改的');
  await b.sync.run();
  M.setValue(a.store, p, a.store.item(it.id), 'title', 'A 改的');   // 時間比較舊
  await a.sync.run();
  assert.equal(a.store.item(it.id).title, 'B 改的');
  assert.deepEqual(a.store.dirty, {});
  await b.sync.run();
  assert.equal(b.store.item(it.id).title, 'B 改的');
});

test('離線累積的修改之後一次送出；重複同步不會重送', async () => {
  const gas = loadGas();
  const a = device(gas);
  const p = M.createProject(a.store, { name: 'P', template: 'blank' });
  for (let i = 0; i < 20; i++) M.addItem(a.store, p, { title: `項目${i}` });
  const r = await a.sync.run();
  assert.equal(r.sent, 21);
  const seq = gas.post({ token: 'test-token', action: 'ping' }).seq;
  assert.equal((await a.sync.run()).sent, 0);
  assert.equal(gas.post({ token: 'test-token', action: 'ping' }).seq, seq);
});

test('同步途中又修改的紀錄不會被標記為已送', async () => {
  const gas = loadGas();
  const store = new Store();
  const p = M.createProject(store, { template: 'blank' });
  const it = M.addItem(store, p, { title: 'x' });
  let cursor = 0;
  const sync = new Sync(store, async (body) => {
    const res = gas.post({ token: 'test-token', ...body });
    M.setValue(store, p, it, 'title', '途中修改');
    return res;
  }, { getCursor: () => cursor, setCursor: (x) => { cursor = x; } });
  await sync.run();
  assert.ok(store.dirty['item:' + it.id]);
  assert.equal(store.item(it.id).title, '途中修改');
});

test('復原的結果也會同步到其他裝置', async () => {
  const gas = loadGas();
  const a = device(gas), b = device(gas);
  const p = M.createProject(a.store, { template: 'blank' });
  const it = M.addItem(a.store, p, { title: '原文' });
  await a.sync.run();
  M.setValue(a.store, p, it, 'title', '改掉');
  await a.sync.run(); await b.sync.run();
  assert.equal(b.store.item(it.id).title, '改掉');
  a.store.undo();
  await a.sync.run(); await b.sync.run();
  assert.equal(b.store.item(it.id).title, '原文');
});

test('伺服器：壞資料略過、每天一份備份', () => {
  const gas = loadGas();
  const r = gas.post({ token: 'test-token', action: 'sync', since: 0, changes: [null, { k: 'x', id: '1', u: 1, r: {} }, { k: 'item', id: 'a', u: 1, r: { id: 'a' } }] });
  assert.equal(r.ok, true);
  assert.equal(r.changes.length, 1);
  gas.post({ token: 'test-token', action: 'sync', since: 0, changes: [{ k: 'item', id: 'b', u: 2, r: { id: 'b' } }] });
  assert.equal([...gas.files.keys()].filter((n) => n.startsWith('backup-')).length, 1);
  assert.equal(gas.post({ token: 'test-token', action: 'nope' }).ok, false);
});

test('還沒執行 setupTracker 時一律拒絕，即使送空金鑰', () => {
  const gas = loadGas('');
  assert.equal(gas.post({ token: '', action: 'ping' }).ok, false);
  assert.equal(gas.post({ action: 'ping' }).ok, false);
});

test('setupTracker 產生金鑰與 App 看得懂的設定碼，重跑不會換金鑰', () => {
  const gas = loadGas('');
  const code = gas.ctx.setupTracker();
  const o = decodePairing(code);
  assert.equal(o.url, 'https://script.google.com/macros/s/TEST/exec');
  assert.ok(o.token.length >= 32);
  assert.equal(gas.ctx.setupTracker(), code);
  assert.equal(gas.post({ token: o.token, action: 'ping' }).ok, true);
});

test('設定碼可以來回轉換，亂碼回傳 null', () => {
  const code = encodePairing('https://x.y/exec', '金鑰abc');
  assert.deepEqual(decodePairing(code), { url: 'https://x.y/exec', token: '金鑰abc' });
  assert.equal(decodePairing('亂打'), null);
  assert.equal(decodePairing('XKT1.@@@'), null);
});
