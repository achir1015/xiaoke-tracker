// 端對端測試：實際操作 App（看板拖曳、表格編輯、路線圖、詳細面板、洞察、設定、AI、同步、重開）
// 用法：node e2e/smoke.mjs；XK_EXE=打包後的 exe 可測打包版
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fakeOpenAI, fakeGas, fakeRelease } from './fakes.mjs';

const require = createRequire(import.meta.url);
const outDir = 'e2e/out';
fs.mkdirSync(outDir, { recursive: true });
const appData = process.env.APPDATA || path.join(os.homedir(), 'Library', 'Application Support');
for (const n of ['e2eA', 'e2eB']) fs.rmSync(path.join(appData, `xiaoke-tracker-${n}`), { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ai = await fakeOpenAI();
const TOKEN = 'e2e-token-123';
const cloud = await fakeGas(TOKEN);
const rel = await fakeRelease('9.9.9');

async function launch(profile) {
  const opts = process.env.XK_EXE ? { executablePath: process.env.XK_EXE, args: [`--profile=${profile}`, '--hidden'] } : { executablePath: require('electron'), args: ['.', `--profile=${profile}`, '--hidden'] };
  opts.env = { ...process.env, XIAOKE_OPENAI_BASE: ai.base, XIAOKE_UPDATE_API: rel.url };
  const app = await electron.launch(opts);
  const win = await app.firstWindow();
  // 隱藏視窗不會重畫，也收不到滑鼠；移到螢幕外顯示，不打擾使用者
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setPosition(-6000, 0); w.showInactive(); });
  const errors = [];
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  win.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  const waitFor = async (fn, arg, ms = 10000) => {
    const t = Date.now();
    for (;;) {
      const v = await win.evaluate(fn, arg).catch(() => false);
      if (v) return v;
      if (Date.now() - t > ms) throw new Error('等待逾時：' + fn);
      await sleep(60);
    }
  };
  const shot = async (name) => {
    await sleep(220);
    const b64 = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
    fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(b64, 'base64'));
  };
  await waitFor(() => document.documentElement.dataset.ready === '1');
  return { app, win, errors, waitFor, shot };
}

const { app, win, errors, waitFor, shot } = await launch('e2eA');
const click = (sel) => win.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error('找不到 ' + s); e.click(); }, sel);
const clickText = (sel, text) => win.evaluate(([s, t]) => { const e = [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t)); if (!e) throw new Error('找不到 ' + t); e.click(); }, [sel, text]);
const text = (sel) => win.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
const count = (sel) => win.evaluate((s) => document.querySelectorAll(s).length, sel);
const fill = async (sel, v) => { await win.fill(sel, v); };
const tab = (name) => clickText('.vt', name);
const box = (sel, i = 0) => win.evaluate(([s, n]) => { const r = document.querySelectorAll(s)[n].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, [sel, i]);

// 拖曳：在頁面裡發出真實流程的指標事件（Playwright 的滑鼠座標在視窗縮放時對不準）
const drag = (from, to) => win.evaluate(async ([f, t]) => {
  const ev = (type, x, y, target) => (target || window).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerType: 'mouse', pointerId: 1 }));
  const start = document.elementFromPoint(f.x, f.y);
  ev('pointerdown', f.x, f.y, start);
  const steps = 8;
  for (let i = 1; i <= steps; i++) { ev('pointermove', f.x + ((t.x - f.x) * i) / steps, f.y + ((t.y - f.y) * i) / steps); await new Promise((r) => setTimeout(r, 16)); }
  ev('pointerup', t.x, t.y);
  await new Promise((r) => setTimeout(r, 120));
}, [from, to]);

// ---- 歡迎 ----
await waitFor(() => !!document.querySelector('.welcome'));
check('第一次開啟顯示歡迎', true);
await clickText('.modal-foot .btn', '先自己看看');
await waitFor(() => !document.querySelector('.modal'));
await shot('01-board');
check('示範專案與看板', (await text('.p-title h2')).includes('小柯示範專案') && (await count('.col')) >= 4, await text('.p-title h2'));
check('卡片有顯示', (await count('.card')) >= 7, String(await count('.card')));
check('圖示載入', await win.evaluate(() => { const i = document.querySelector('.brand img'); return i.complete && i.naturalWidth > 0; }));

// ---- 看板 ----
const col1 = await box('.col', 0);
await win.fill('.col:nth-child(1) .quick-add', '端對端新增項目');
await win.keyboard.press('Enter');
await waitFor(() => [...document.querySelectorAll('.card-title')].some((x) => x.textContent === '端對端新增項目'));
check('看板快速新增', true);
check('新增後游標留在輸入框', await win.evaluate(() => document.activeElement?.classList.contains('quick-add')));
check('新卡片捲到看得見的位置', await win.evaluate(() => { const c = [...document.querySelectorAll('.card')].find((x) => x.textContent.includes('端對端新增項目')).getBoundingClientRect(); const b = document.querySelector('.col-body').getBoundingClientRect(); return c.bottom <= b.bottom + 2; }));
const cardBox = await win.evaluate(() => { const c = [...document.querySelectorAll('.card')].find((x) => x.textContent.includes('端對端新增項目')); const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const col2 = await box('.col', 1);
await drag(cardBox, { x: col2.x + col2.w / 2, y: col2.y + 90 });
const inCol2 = await win.evaluate(() => [...document.querySelectorAll('.col')[1].querySelectorAll('.card-title')].some((x) => x.textContent === '端對端新增項目'));
check('拖曳卡片換欄', inCol2);
await win.evaluate(() => { const c = [...document.querySelectorAll('.card')].find((x) => x.textContent.includes('端對端新增項目')); c.click(); });
await waitFor(() => document.querySelector('#detail.open'));
check('卡片開啟詳細面板，狀態已改', (await text('.d-head .chip')).includes('進行中'));
await shot('02-detail');

// ---- 詳細面板 ----
await win.fill('.d-sec .quick-add', '子項目一');
await win.keyboard.press('Enter');
await waitFor(() => document.querySelectorAll('.sub').length === 1);
await win.keyboard.type('子項目二');
await win.keyboard.press('Enter');
await waitFor(() => document.querySelectorAll('.sub').length === 2);
check('連續新增子項目', true);
await win.fill('.cmt-new textarea', '這是留言 **粗體**');
await clickText('.cmt-new .btn', '送出');
await waitFor(() => document.querySelector('.cmt b + small') || document.querySelector('.cmt .md b'));
check('留言顯示 Markdown', (await text('.cmt .md b')) === '粗體');
await win.evaluate(() => { for (const c of document.querySelectorAll('.sub input')) c.click(); });
await waitFor(() => (document.querySelector('.d-head .btn')?.textContent || '').includes('重新開啟'));
check('子項目全完成，父項目自動關閉', true);
await click('.d-head .icon-btn[aria-label="關閉面板"]');

// ---- 表格 ----
await tab('表格');
await waitFor(() => document.querySelector('.tbl'));
await shot('03-table');
check('表格列出項目', (await count('tr.row')) >= 9, String(await count('tr.row')));
await win.evaluate(() => { const r = [...document.querySelectorAll('tr.row')].find((x) => x.textContent.includes('語音說明補上說明圖')); [...r.querySelectorAll('td.ed')][2].click(); });
await waitFor(() => document.querySelector('.pop'));
const popText = await text('.pop');
check('點儲存格開啟選單', popText.includes('緊急'), popText);
await clickText('.pop .opt', '緊急');
await waitFor(() => { const r = [...document.querySelectorAll('tr.row')].find((x) => x.textContent.includes('語音說明補上說明圖')); return r.textContent.includes('緊急'); });
check('表格修改優先度', true);

await win.fill('#filterInput', 'priority:緊急 is:open');
await waitFor(() => document.querySelectorAll('tr.row').length === 2);
check('篩選即時生效', true);
await win.keyboard.press('Enter');
await sleep(100);
check('篩選存到檢視', await win.evaluate(() => document.querySelector('#filterInput').value === 'priority:緊急 is:open'));
await win.evaluate(() => { const i = document.querySelector('[aria-label="清除篩選"]'); i.click(); });
await waitFor(() => document.querySelectorAll('tr.row').length >= 9);
check('清除篩選', true);

await click('#btnViewOpts');
await waitFor(() => document.querySelector('.vo'));
await win.evaluate(() => { const s = document.querySelectorAll('.vo select')[1]; s.value = 'status'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await waitFor(() => document.querySelectorAll('.g-row').length >= 4);
check('表格分組', true);
await shot('04-table-group');
await win.keyboard.press('Escape');
// 勾選與批次
await win.evaluate(() => { for (const c of [...document.querySelectorAll('tr.row input[type=checkbox]')].slice(0, 2)) c.click(); });
await waitFor(() => document.querySelector('.bulk'));
check('勾選出現批次列', (await text('.bulk b')) === '已選 2 項');
await clickText('.bulk .btn', '取消選取');
await waitFor(() => !document.querySelector('.bulk'));

// ---- 路線圖 ----
await tab('路線圖');
await waitFor(() => document.querySelector('.rm-bar'));
await sleep(100);
await shot('05-roadmap');
check('路線圖有色條與今天線', (await count('.rm-bar')) >= 3 && (await count('.rm-today')) === 1);
const barInfo = await win.evaluate(() => { const b = [...document.querySelectorAll('.rm-bar')].find((x) => x.textContent.includes('語音說明補上說明圖')); b.scrollIntoView({ inline: 'center', block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, title: b.title }; });
await drag(barInfo, { x: barInfo.x + 77, y: barInfo.y });
const after = await win.evaluate(() => [...document.querySelectorAll('.rm-bar')].find((x) => x.textContent.includes('語音說明補上說明圖')).title);
check('拖曳色條改日期', after !== barInfo.title, after);

// ---- 洞察 ----
await click('#tab-insights');
await waitFor(() => document.querySelector('.chart'));
await sleep(50);
await shot('06-insights');
check('三張預設圖表', (await count('.chart-card svg')) === 3);
await click('#btnNewChart');
await waitFor(() => document.querySelector('.chart-edit'));
await win.evaluate(() => { const s = document.querySelectorAll('.chart-edit select')[0]; s.value = 'pie'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await clickText('.modal-foot .btn', '儲存');
await waitFor(() => document.querySelectorAll('.chart-card').length === 4);
check('新增圓餅圖', await win.evaluate(() => document.querySelectorAll('.chart-card')[3].querySelector('path') !== null));

// ---- 專案更新 ----
await click('#tab-updates');
await waitFor(() => document.querySelector('#btnNewUpdate'));
await click('#btnNewUpdate');
await waitFor(() => document.querySelector('.health-pick'));
await clickText('.hp', '有風險');
await win.fill('.modal textarea', '本週**進度**有點落後');
await clickText('.modal-foot .btn', '發布');
await waitFor(() => document.querySelector('.update'));
check('發布專案更新', (await text('.status-card b')) === '有風險');

// ---- 專案設定 ----
await click('#tab-settings');
await waitFor(() => document.querySelector('.set-nav'));
await shot('07-settings');
await click('#set-fields');
await waitFor(() => document.querySelector('#btnNewField'));
await click('#btnNewField');
await waitFor(() => document.querySelector('.type-grid'));
await win.fill('.modal input[type=text]', '客戶');
await clickText('.type-card', '單選');
await win.fill('.modal div[style] input', '甲公司, 乙公司');
await clickText('.modal-foot .btn', '新增');
await waitFor(() => [...document.querySelectorAll('.fcard input')].some((x) => x.value === '客戶'));
check('新增單選欄位含選項', (await win.evaluate(() => [...document.querySelectorAll('.opt-row input')].filter((x) => x.value === '甲公司').length)) === 1);
await click('#set-flows');
await waitFor(() => document.querySelector('.flow'));
await shot('08-flows');
check('工作流程列出 7 項', (await count('.flow')) === 7);
await click('#set-danger');
await waitFor(() => document.querySelector('#btnCloseProject'));

// ---- 新增專案與小圖案 ----
await click('#btnSideNew');
await waitFor(() => document.querySelector('.tpl-grid'));
await shot('09-new-project');
await win.fill('.modal input[type=text]', '第二個專案');
await click('[data-tpl="event"]');
await clickText('.modal-foot .btn', '建立專案');
await waitFor(() => (document.querySelector('.p-title h2')?.textContent || '').includes('第二個專案'));
check('用範本建立專案', (await count('.col')) === 4 && (await count('.card')) === 3, `${await count('.col')} ${await count('.card')}`);
await click('#projLook');
await waitFor(() => document.querySelector('.picker'));
await shot('10-picker');
await win.evaluate(() => { document.querySelectorAll('.swatch')[3].click(); });
await clickText('.emoji', '🚀');
await waitFor(() => document.querySelector('#projLook').textContent === '🚀');
check('更換小圖案', true);

// ---- 復原 ----
await win.evaluate(() => document.activeElement?.blur());
await win.keyboard.press('Control+z');
await waitFor(() => document.querySelector('#projLook').textContent !== '🚀');
check('Ctrl+Z 復原', true);
await win.keyboard.press('Control+y');
await waitFor(() => document.querySelector('#projLook').textContent === '🚀');
check('Ctrl+Y 重做', true);

// ---- 搜尋 ----
await win.keyboard.press('Control+k');
await waitFor(() => document.querySelector('#searchInput'));
await win.fill('#searchInput', '端對端');
await waitFor(() => document.querySelector('.search-list .home-row'));
await win.keyboard.press('Enter');
await waitFor(() => document.querySelector('#detail.open'));
check('搜尋跨專案並開啟項目', (await text('.p-title h2')).includes('小柯示範專案'));
await click('.d-head .icon-btn[aria-label="關閉面板"]');

// ---- 首頁 ----
await click('#navHome');
await waitFor(() => document.querySelector('.proj-grid'));
await shot('11-home');
check('首頁顯示兩個專案', (await count('.proj-card')) === 2);

// ---- 設定與 AI ----
await click('#btnSettings');
await waitFor(() => document.querySelector('.settings'));
await click('#st-ai');
await win.fill('#stKey', 'sk-wrong');
await click('#stKeySave');
await waitFor(() => /❌/.test(document.querySelector('.st-body .hint:nth-of-type(n)')?.textContent + document.querySelector('.st-body').textContent));
check('錯誤金鑰顯示失敗', (await text('.st-body')).includes('金鑰不正確'));
await win.fill('#stKey', 'sk-test-key');
await click('#stKeySave');
await waitFor(() => document.querySelector('.st-body').textContent.includes('金鑰可以使用'));
check('金鑰測試成功', true);
const raw = fs.readFileSync(path.join(appData, 'xiaoke-tracker-e2eA', 'settings.json'), 'utf8');
check('金鑰沒有明文存檔', !raw.includes('sk-test-key'));
await shot('12-settings-ai');
await click('.modal-head .icon-btn');

ai.state.script.push(
  { id: 'r1', output: [{ type: 'function_call', call_id: 'c1', name: 'create_item', arguments: JSON.stringify({ project: '第二個專案', title: 'AI 建立的項目', fields: { 優先度: '高', 目標日: '2026-12-25' } }) }] },
  { id: 'r2', output: [{ type: 'message', content: [{ type: 'output_text', text: '已建立 **#4** 項目' }] }] },
);
await click('#btnAgent');
await waitFor(() => document.querySelector('#agentInput'));
await win.fill('#agentInput', '幫我新增一個項目');
await win.keyboard.press('Enter');
await waitFor(() => document.querySelector('.ag-msg.bot .md b'));
await shot('13-agent');
check('AI 回覆並顯示工具步驟', (await text('.ag-msg.bot .md b')) === '#4' && (await count('.ag-step.done')) === 1);
check('送出工具與模型', ai.state.calls[0].model === 'gpt-6.1-terra' && ai.state.calls[0].tools.length > 8 && ai.state.calls[1].previous_response_id === 'r1');
await win.evaluate(() => [...document.querySelectorAll('.ag-actions .link')].find((x) => x.textContent.includes('復原')).click());
await sleep(200);
ai.state.script.push({ id: 'r3', output: [{ type: 'function_call', call_id: 'c2', name: 'delete_items', arguments: '{"items":["#1"]}' }] });
await click('#sideProjects .side-item');
await waitFor(() => document.querySelector('.p-title h2'));
await win.fill('#agentInput', '刪除 #1');
await win.keyboard.press('Enter');
await waitFor(() => document.querySelector('.modal .confirm-text'));
check('AI 刪除要先確認', (await text('.modal-head h2')) === '小柯要刪除資料');
await clickText('.modal-foot .btn', '取消');
await waitFor(() => document.querySelectorAll('.ag-msg.bot').length === 2 && !document.querySelector('.ag-msg.bot:last-child .muted'));
await click('[aria-label="關閉小柯助手"]');

// ---- 雲端同步 ----
await click('#btnSettings');
await waitFor(() => document.querySelector('.settings'));
await click('#st-sync');
await win.fill('#stUrl', cloud.url);
await win.fill('#stToken', 'wrong-token');
await click('#stConnect');
await waitFor(() => document.querySelector('#stSyncMsg').textContent.includes('❌'));
check('同步金鑰錯誤有提示', (await text('#stSyncMsg')).includes('同步金鑰不正確'));
await win.fill('#stToken', TOKEN);
await click('#stConnect');
await waitFor(() => /上傳|上次同步|已設定/.test(document.querySelector('.st-body').textContent) && !document.querySelector('#stSyncMsg').textContent.includes('連線中') && !document.querySelector('#stSyncMsg').textContent.includes('❌'));
await sleep(200);
const ping = cloud.gas.post({ token: TOKEN, action: 'ping' });
check('資料已上傳到雲端', ping.count >= 10, JSON.stringify(ping));
const pairing = await win.evaluate(async () => { const s = await window.xk.settings.secrets(); const { encodePairing } = await import('./js/core/sync.js'); return encodePairing(s.url, s.token); });
await click('.modal-head .icon-btn');

// ---- 更新 ----
await click('#btnUpdate');
await waitFor(() => document.querySelector('.upd').textContent.includes('9.9.9'));
check('偵測到新版本', true);
await shot('14-update');
await click('.modal-head .icon-btn');

// ---- 說明 ----
await click('#btnGuide');
await waitFor(() => document.querySelector('.guide'));
check('使用說明 14 課', (await count('.g-item')) === 14);
await shot('15-guide');
await win.evaluate(() => document.querySelectorAll('.g-item')[3].click());
await click('#guideShow');
await waitFor(() => document.querySelector('.spot-hole'));
await shot('16-spotlight');
check('指給我看', (await text('.spot-tip b')) === '看板');
await click('.spot');
await click('.modal-head .icon-btn');
await sleep(100);

const seen = await win.evaluate(() => ({ title: document.title }));
check('沒有畫面錯誤', errors.length === 0, errors.join('\n'));
await sleep(500);
await app.close();

// ---- 重開後資料還在 ----
const b = await launch('e2eA');
await b.waitFor(() => document.querySelector('#sideProjects .side-item'));
check('重開後專案還在', (await b.win.evaluate(() => document.querySelectorAll('#sideProjects .side-item').length)) === 2);
await b.app.close();

// ---- 第二台裝置用設定碼同步 ----
const c = await launch('e2eB');
await c.waitFor(() => !!document.querySelector('.welcome'));
await c.win.evaluate(() => [...document.querySelectorAll('.modal-foot .btn')].find((x) => x.textContent.includes('先自己看看')).click());
await c.waitFor(() => !document.querySelector('.modal'));
await c.win.evaluate(() => document.querySelector('#btnSettings').click());
await c.waitFor(() => document.querySelector('.settings'));
await c.win.evaluate(() => document.querySelector('#st-sync').click());
await c.waitFor(() => document.querySelector('#stPaste'));
await c.win.evaluate(() => document.querySelector('#stPaste').click());
await c.waitFor(() => document.querySelectorAll('.modal').length === 2);
await c.win.fill('.modal-back:last-child input', pairing);
await c.win.keyboard.press('Enter');
await c.waitFor(() => [...document.querySelectorAll('#sideProjects .tt')].some((x) => x.textContent === '第二個專案'), undefined, 8000);
const names = await c.win.evaluate(() => [...document.querySelectorAll('#sideProjects .tt')].map((x) => x.textContent));
check('第二台裝置收到資料，示範專案不重複', names.length === 2, names.join());
await c.app.close();

ai.close(); cloud.close(); rel.close();
console.log(`\n通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);
