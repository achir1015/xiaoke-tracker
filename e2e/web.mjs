// 線上版／手機版面測試：用 Edge 開 mobile/www，模擬手機尺寸與觸控
// 用法：node scripts/build-mobile.mjs && node e2e/web.mjs
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'mobile/www';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
let versionJson = null;
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/version.json' && versionJson) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(versionJson); return; }
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(path.normalize(ROOT)) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/`;

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { if (ok) { pass++; console.log('✔', n); } else { fail++; console.log('✘', n, x); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync('e2e/out', { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function phone(w, h, name) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await page.goto(base);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.waitForSelector('.welcome');
  check(`${name}：歡迎畫面`, true);
  await page.evaluate(() => [...document.querySelectorAll('.modal-foot .btn')].find((x) => x.textContent.includes('先自己看看')).click());
  await page.waitForFunction(() => !document.querySelector('.modal'));
  const noX = async (label) => check(`${name}：${label}沒有橫向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), await page.evaluate(() => `${document.documentElement.scrollWidth}/${innerWidth}`));
  return { ctx, page, errors, noX };
}

// ---- iPhone 尺寸 ----
{
  const { ctx, page, errors, noX } = await phone(390, 844, 'iPhone');
  const shot = async (n) => { await sleep(150); await page.screenshot({ path: `e2e/out/m-${n}.png` }); };
  await page.waitForSelector('.card');
  await noX('看板');
  await shot('board');
  check('頂端列顯示專案名稱', (await page.textContent('#topTitle')).includes('小柯示範專案'));
  check('側邊欄收起來', await page.evaluate(() => document.querySelector('#side').getBoundingClientRect().right <= 0));
  await page.tap('#btnMenu');
  await sleep(260);
  check('抽屜打開', await page.evaluate(() => document.querySelector('#side').getBoundingClientRect().left === 0));
  await shot('drawer');
  await page.tap('#navHome');
  await page.waitForSelector('.proj-grid');
  await sleep(260);
  check('點選後抽屜自動關閉', await page.evaluate(() => !document.body.classList.contains('side-open')));
  await noX('首頁');
  await shot('home');
  await page.tap('.proj-card');
  await page.waitForSelector('.card');

  // 長按拖曳卡片：真實的 touch 事件
  const cdp = await ctx.newCDPSession(page);
  const pos = await page.evaluate(() => {
    const c = document.querySelector('.col .card').getBoundingClientRect();
    return { title: document.querySelector('.col .card-title').textContent, x: c.x + c.width / 2, y: c.y + c.height / 2 };
  });
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', pos.x, pos.y);
  await sleep(420);
  check('長按後卡片浮起', await page.evaluate(() => !!document.querySelector('.card.ghost')));
  const scroll0 = await page.evaluate(() => document.querySelector('.board').scrollLeft);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', pos.x + 2, pos.y + i * 30); await sleep(20); }
  check('拖曳時畫面不跟著捲動', (await page.evaluate(() => document.querySelector('.board').scrollLeft)) === scroll0);
  await touch('touchEnd', 0, 0);
  await sleep(250);
  const order = await page.evaluate((t) => [...document.querySelectorAll('.col')[0].querySelectorAll('.card-title')].map((x) => x.textContent).indexOf(t), pos.title);
  check('長按拖曳改變順序', order > 0, String(order));

  // 手指快速滑過卡片不算拖曳
  await touch('touchStart', pos.x, pos.y + 100);
  await touch('touchMove', pos.x - 60, pos.y + 100);
  await sleep(30);
  await touch('touchEnd', 0, 0);
  check('快速滑動不會變成拖曳', await page.evaluate(() => !document.querySelector('.card.ghost')));

  await page.evaluate(() => document.querySelector('.card').click());
  await page.waitForSelector('#detail.open');
  await shot('detail');
  check('詳細面板占滿畫面', await page.evaluate(() => document.querySelector('#detail').getBoundingClientRect().width >= innerWidth - 1));
  check('返回鍵關閉詳細面板', await page.evaluate(() => window.__xkBack()));
  await sleep(60);
  check('面板已關閉', await page.evaluate(() => !document.querySelector('#detail.open')));

  await page.evaluate(() => [...document.querySelectorAll('.vt')].find((x) => x.textContent.includes('表格')).click());
  await page.waitForSelector('.tbl');
  await noX('表格');
  await shot('table');
  await page.evaluate(() => [...document.querySelectorAll('.vt')].find((x) => x.textContent.includes('路線圖')).click());
  await page.waitForSelector('.rm-bar');
  await noX('路線圖');
  check('路線圖開啟時看得到今天', await page.evaluate(() => { const r = document.querySelector('.rm-today').getBoundingClientRect(), n = document.querySelector('.rm-name').getBoundingClientRect(); return r.left > n.right && r.right < innerWidth; }));
  await shot('roadmap');
  check('路線圖標題欄縮窄', await page.evaluate(() => document.querySelector('.rm-name').getBoundingClientRect().width < 150));

  for (const t of ['insights', 'updates', 'settings']) {
    await page.tap(`#tab-${t}`);
    await sleep(120);
    await noX(t);
    await shot(t);
  }
  await page.tap('#btnTopAgent');
  await sleep(100);
  check('AI 面板打開，提示設定金鑰', (await page.textContent('#agent')).includes('前往設定金鑰'));
  await shot('agent');
  await page.evaluate(() => window.__xkBack());
  await page.tap('#btnMenu');
  await sleep(260);
  await page.tap('#btnGuide');
  await page.waitForSelector('.guide');
  await shot('guide');
  check('使用說明沒有超出螢幕', await page.evaluate(() => { const r = document.querySelector('.modal').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5; }));
  check('使用說明有示意圖', await page.evaluate(() => { const r = document.querySelector('.guide-art').getBoundingClientRect(); return r.width > 50 && r.left >= 0 && r.right <= innerWidth; }));
  await page.evaluate(() => document.querySelector('.modal-head .icon-btn').click());

  // 線上版更新
  await page.evaluate(() => window.XK_VERSION);
  versionJson = JSON.stringify({ version: '9.9.9' });
  await page.tap('#btnMenu');
  await sleep(260);
  await page.tap('#btnUpdate');
  await page.waitForFunction(() => document.querySelector('.upd')?.textContent.includes('9.9.9'));
  check('線上版偵測到新版本', true);
  versionJson = null;
  await page.evaluate(() => window.__xkBack());

  // 資料保存在 IndexedDB，重新整理還在
  await sleep(600);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await sleep(150);
  check('重新整理後資料還在', await page.evaluate(() => !document.querySelector('.welcome') && document.querySelectorAll('#sideProjects .side-item').length === 1));
  check('iPhone：沒有畫面錯誤', errors.length === 0, errors.join('\n'));
  await ctx.close();
}

// ---- iPad 直放與橫放 ----
for (const [w, h, name] of [[820, 1180, 'iPad 直放'], [1180, 820, 'iPad 橫放']]) {
  const { ctx, page, errors, noX } = await phone(w, h, name);
  await page.waitForSelector('.card');
  await noX('看板');
  await sleep(150);
  await page.screenshot({ path: `e2e/out/m-${w}.png` });
  check(`${name}：沒有畫面錯誤`, errors.length === 0, errors.join('\n'));
  await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);
