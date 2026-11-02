// 用真的 OpenAI 金鑰測試 AI 助手（金鑰只從環境變數 OPENAI_API_KEY 讀，不存檔）
// 用法：OPENAI_API_KEY=… node e2e/real-ai.mjs
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
if (!process.env.OPENAI_API_KEY) { console.log('沒有 OPENAI_API_KEY'); process.exit(2); }
const profile = 'e2eRealAI';
const dir = path.join(process.env.APPDATA, `xiaoke-tracker-${profile}`);
fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: require('electron'), args: ['.', `--profile=${profile}`, '--hidden'], env: { ...process.env } });
const win = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setPosition(-6000, 0); w.showInactive(); });
await win.waitForFunction(() => document.documentElement.dataset.ready === '1');
await win.waitForSelector('.welcome');
await win.evaluate(() => [...document.querySelectorAll('.modal-foot .btn')].find((x) => x.textContent.includes('先自己看看')).click());

const test = await win.evaluate(() => window.xk.ai.test());
console.log('金鑰測試：', test.ok, test.error || '', '模型數', test.models?.length, '有 terra：', test.models?.includes('gpt-6.1-terra'));

const ask = async (text) => {
  const n = await win.evaluate(() => document.querySelectorAll('.ag-msg.bot, .ag-msg.err').length);
  await win.fill('#agentInput', text);
  await win.keyboard.press('Enter');
  await win.waitForFunction((k) => {
    const list = document.querySelectorAll('.ag-msg.bot, .ag-msg.err');
    return list.length > k && !list[list.length - 1].querySelector(':scope > .muted') && document.querySelector('#agentSend');
  }, n, { timeout: 90000 });
  return win.evaluate(() => { const list = document.querySelectorAll('.ag-msg.bot, .ag-msg.err'); const m = list[list.length - 1]; return { steps: [...m.querySelectorAll('.ag-step')].map((x) => x.textContent), text: m.textContent.slice(0, 400) }; });
};

await win.evaluate(() => document.querySelector('#btnAgent').click());
await win.waitForSelector('#agentInput');
console.log(await ask('目前這個專案有哪些項目已逾期？'));
const r2 = await ask('幫我新增一個項目「準備週會簡報」，優先度高，目標日 2026-11-20，再拆成三個子項目');
console.log(r2);
const items = await win.evaluate(() => [...document.querySelectorAll('.card-title')].map((x) => x.textContent));
console.log('看板上的標題：', items.slice(-6));
await app.close();
fs.rmSync(dir, { recursive: true, force: true });
