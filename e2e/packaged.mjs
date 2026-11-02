// 驗收已安裝的程式：真實視窗、真實滑鼠輸入拖曳卡片、捷徑
// 用法：node e2e/packaged.mjs <exe 路徑>
import { _electron as electron } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import os from 'os';

const exe = process.argv[2];
const profile = 'e2ePkg';
const appData = process.env.APPDATA;
fs.rmSync(path.join(appData, `xiaoke-tracker-${profile}`), { recursive: true, force: true });
fs.mkdirSync('e2e/out', { recursive: true });
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { if (ok) { pass++; console.log('✔', n); } else { fail++; console.log('✘', n, x); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = await electron.launch({ executablePath: exe, args: [`--profile=${profile}`] });
const win = await app.firstWindow();
await win.waitForFunction(() => document.documentElement.dataset.ready === '1');
await win.waitForSelector('.welcome');
await win.evaluate(() => [...document.querySelectorAll('.modal-foot .btn')].find((x) => x.textContent.includes('先自己看看')).click());
await sleep(500);
const info = await app.evaluate(({ BrowserWindow, app: a }) => { const w = BrowserWindow.getAllWindows()[0]; const [cw, ch] = w.getContentSize(); return { cw, ch, zoom: w.webContents.getZoomFactor(), packaged: a.isPackaged, version: a.getVersion(), name: a.getName() }; });
console.log(info);
check('打包版版本與名稱', info.packaged && info.version === JSON.parse(fs.readFileSync('package.json', 'utf8')).version && info.name === '小柯機器人專案追蹤工具');
const fits = await win.evaluate(() => { const out = []; for (const s of ['#btnNewItem', '#btnViewOpts', '#btnSettings', '#syncState', '#tab-settings']) { const r = document.querySelector(s).getBoundingClientRect(); if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.width === 0) out.push(s); } return out; });
check('主要按鈕都在視窗內', fits.length === 0, fits.join());

// 真實滑鼠：sendInputEvent 走的是和使用者一樣的輸入路徑
const pos = await win.evaluate(() => {
  const card = document.querySelector('.col:nth-child(1) .card');
  const r = card.getBoundingClientRect(), c = document.querySelectorAll('.col')[1].querySelector('.col-body').getBoundingClientRect();
  return { title: card.querySelector('.card-title').textContent, sx: r.x + r.width / 2, sy: r.y + r.height / 2, tx: c.x + c.width / 2, ty: c.y + 40 };
});
const send = (type, x, y, extra = {}) => app.evaluate(({ BrowserWindow }, a) => BrowserWindow.getAllWindows()[0].webContents.sendInputEvent(a), { type, x: Math.round(x * info.zoom), y: Math.round(y * info.zoom), ...extra });
await send('mouseMove', pos.sx, pos.sy);
await send('mouseDown', pos.sx, pos.sy, { button: 'left', clickCount: 1 });
for (let i = 1; i <= 10; i++) { await send('mouseMove', pos.sx + ((pos.tx - pos.sx) * i) / 10, pos.sy + ((pos.ty - pos.sy) * i) / 10, { button: 'left', modifiers: ['leftButtonDown'] }); await sleep(30); }
const ghost = await win.evaluate(() => !!document.querySelector('.card.ghost'));
await send('mouseUp', pos.tx, pos.ty, { button: 'left', clickCount: 1 });
await sleep(300);
check('拖曳時有卡片跟著滑鼠', ghost);
const moved = await win.evaluate((t) => [...document.querySelectorAll('.col')[1].querySelectorAll('.card-title')].some((x) => x.textContent === t), pos.title);
check('真實滑鼠拖曳卡片換欄', moved, pos.title);

const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
fs.writeFileSync('e2e/out/20-packaged.png', Buffer.from(png, 'base64'));
await app.close();
fs.rmSync(path.join(appData, `xiaoke-tracker-${profile}`), { recursive: true, force: true });
console.log(`\n通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);
