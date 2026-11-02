// 對正式網站做的檢查：線上版載入、CSP 允許呼叫雲端與 OpenAI（用錯誤金鑰，只看連不連得到）
// 用法：node e2e/online-live.mjs <Apps Script 的 /exec 網址>
import { chromium } from 'playwright-core';

const SITE = 'https://achir1015.github.io/xiaoke-tracker/';
const gas = process.argv[2];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-TW' })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(SITE + 'online/');
await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
console.log('線上版版本：', await page.evaluate(() => window.XK_VERSION), '歡迎畫面：', await page.evaluate(() => !!document.querySelector('.welcome')));
const out = await page.evaluate(async (url) => {
  const r = {};
  try { const a = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer wrong' } }); r.openai = a.status; } catch (e) { r.openai = '被擋：' + e.message; }
  if (url) { try { const g = await fetch(url + '?app=tracker', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: 'wrong', action: 'ping' }) }); r.gas = await g.text(); } catch (e) { r.gas = '被擋：' + e.message; } }
  try { const v = await fetch('version.json', { cache: 'no-store' }); r.version = await v.text(); } catch (e) { r.version = e.message; }
  try { const h = await fetch('https://api.github.com/repos/achir1015/xiaoke-tracker/releases/latest'); r.github = h.status; } catch (e) { r.github = '被擋：' + e.message; }
  return r;
}, gas);
console.log(out);
const real = errors.filter((e) => !/401|404/.test(e));
console.log('畫面錯誤：', real.length ? real : '無');
await page.goto(SITE + 'ios/');
console.log('安裝頁：', await page.textContent('h1'), '／', await page.textContent('#ver'));
await browser.close();
