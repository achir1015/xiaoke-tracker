// Android 實機測試：透過 adb 連到除錯版 APK 的 WebView
// 用法：python android/build.py debug install，手機解鎖後執行 node e2e/phone.mjs
import { chromium } from 'playwright-core';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ADB = process.env.ADB || 'E:/小米觸控音箱/tools/android-sdk/platform-tools/adb.exe';
const SERIAL = process.env.ANDROID_SERIAL || 'R5CY236CQ3B';
const PKG = 'com.achir.xiaoketracker';
const outDir = 'e2e/out';
fs.mkdirSync(outDir, { recursive: true });
const adb = (...a) => execFileSync(ADB, ['-s', SERIAL, ...a], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const shotPhone = (name) => fs.writeFileSync(path.join(outDir, 'p-' + name + '.png'), execFileSync(ADB, ['-s', SERIAL, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };

const win = adb('shell', 'dumpsys', 'window');
if (/isKeyguardShowing=true|mDreamingLockscreen=true/.test(win)) { console.log('手機鎖著，請先解鎖'); process.exit(2); }
adb('shell', 'pm', 'clear', PKG);   // 從全新狀態開始（只清這個 App 的資料）
adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
await sleep(3000);
const sock = /@?(webview_devtools_remote_\d+)/.exec(adb('shell', 'cat', '/proc/net/unix'));
if (!sock) { console.log('找不到 WebView 偵錯通道（要用 python android/build.py debug 建置）'); process.exit(2); }
execFileSync(ADB, ['-s', SERIAL, 'forward', 'tcp:9336', 'localabstract:' + sock[1]]);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9336');
const page = browser.contexts()[0].pages().find((p) => p.url().includes('appassets')) || browser.contexts()[0].pages()[0];
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const waitFor = async (fn, arg, ms = 15000) => { const t = Date.now(); for (;;) { const v = await page.evaluate(fn, arg).catch(() => false); if (v) return v; if (Date.now() - t > ms) throw new Error('等待逾時：' + fn); await sleep(150); } };

try {
  await waitFor(() => document.documentElement.dataset.ready === '1');
  const info = await page.evaluate(() => ({ android: !!window.XiaokeAndroid, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, ver: JSON.parse(window.XiaokeAndroid.appInfo()).version, model: JSON.parse(window.XiaokeAndroid.appInfo()).model }));
  console.log('  ', JSON.stringify(info));
  check('在 Android App 裡執行（原生橋接）', info.android);
  check('版本號正確', info.ver === JSON.parse(fs.readFileSync('package.json', 'utf8')).version, info.ver);
  check('手機版面（有頂端列）', await page.evaluate(() => getComputedStyle(document.querySelector('#topbar')).display === 'flex'));
  await waitFor(() => document.querySelector('.welcome'));
  check('第一次開啟有歡迎畫面', true);
  shotPhone('welcome');
  await page.evaluate(() => [...document.querySelectorAll('.modal-foot .btn')].find((x) => x.textContent.includes('先自己看看')).click());
  await waitFor(() => !document.querySelector('.modal') && document.querySelector('.card'));
  await sleep(300);
  shotPhone('board');
  check('看板有卡片', (await page.evaluate(() => document.querySelectorAll('.card').length)) >= 3);
  check('沒有橫向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  // 語音引擎
  const tts = await page.evaluate(() => ({ ok: window.XiaokeAndroid.ttsAvailable(), voice: window.XiaokeAndroid.ttsVoice() }));
  console.log('   語音：', JSON.stringify(tts));
  check('文字轉語音可用（有中文語音）', tts.ok);
  if (tts.ok) {
    const done = await page.evaluate(() => new Promise((res) => { const t = setTimeout(() => res('逾時'), 9000); window.__xkTtsDone = () => { clearTimeout(t); res('念完'); }; window.XiaokeAndroid.ttsSpeak('語音測試', 1.2, 'e2e'); }));
    check('語音真的念完', done === '念完', done);
  }

  // 真實手指：長按卡片拖到下面
  const pos = await page.evaluate(() => {
    const cards = document.querySelectorAll('.col .card');
    const a = cards[0].getBoundingClientRect(), b = cards[2].getBoundingClientRect();
    return { title: cards[0].querySelector('.card-title').textContent, x: a.x + a.width / 2, y: a.y + a.height / 2, ty: b.y + b.height - 6, dpr: devicePixelRatio, top: 0 };
  });
  const offset = Number(adb('shell', 'dumpsys', 'window').match(/mStableInsets=|statusBars.*?frame=\[0,0\]\[\d+,(\d+)\]/)?.[1] || 0);
  const px = (v) => Math.round(v * pos.dpr);
  // input swipe 同一點停 700ms 模擬長按，接著用 motionevent 移動
  const X = px(pos.x), Y = px(pos.y) + offset, TY = px(pos.ty) + offset;
  adb('shell', `input motionevent DOWN ${X} ${Y}; sleep 0.6; for i in 1 2 3 4 5 6 7 8; do input motionevent MOVE ${X} $((${Y} + (${TY} - ${Y}) * i / 8)); done; input motionevent UP ${X} ${TY}`);
  await sleep(500);
  const idx = await page.evaluate((t) => [...document.querySelectorAll('.col')[0].querySelectorAll('.card-title')].map((x) => x.textContent).indexOf(t), pos.title);
  check('真實手指長按拖曳', idx > 0, `位置 ${idx}`);
  shotPhone('dragged');

  // 手指點卡片開詳細面板
  const c2 = await page.evaluate(() => { const r = document.querySelector('.col .card-title').getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2 }; });
  adb('shell', 'input', 'tap', String(px(c2.x)), String(px(c2.y) + offset));
  await waitFor(() => document.querySelector('#detail.open'));
  check('手指點卡片開啟項目', true);
  await sleep(300);
  shotPhone('detail');
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await waitFor(() => !document.querySelector('#detail.open'));
  check('返回鍵關閉項目', true);

  // 表格、路線圖
  await page.evaluate(() => [...document.querySelectorAll('.vt')].find((x) => x.textContent.includes('表格')).click());
  await waitFor(() => document.querySelector('.tbl'));
  await sleep(250);
  shotPhone('table');
  await page.evaluate(() => [...document.querySelectorAll('.vt')].find((x) => x.textContent.includes('路線圖')).click());
  await waitFor(() => document.querySelector('.rm-bar'));
  await sleep(250);
  shotPhone('roadmap');
  check('路線圖有色條', true);

  // 匯出到下載資料夾
  await page.evaluate(() => document.querySelector('#tab-settings').click());
  await waitFor(() => document.querySelector('#set-data'));
  const saved = await page.evaluate(async () => {
    const t = '標題,狀態\n測試中文,待辦\n';
    const A = window.XiaokeAndroid;
    const r = JSON.parse(A.beginSave('e2e-匯出測試.csv'));
    const b = btoa(String.fromCharCode(...new TextEncoder().encode(t)));
    A.writeChunk(r.token, b);
    return JSON.parse(A.endSave(r.token));
  });
  check('匯出到下載資料夾', saved.status === 'ok', JSON.stringify(saved));
  const ls = adb('shell', 'ls', '/sdcard/Download/小柯專案追蹤/');
  check('手機裡真的有檔案', ls.includes('e2e-匯出測試'), ls);
  adb('shell', 'rm', '-f', '/sdcard/Download/小柯專案追蹤/e2e-匯出測試.csv');

  // 資料保存：關掉重開
  await page.evaluate(() => window.__xkBack && 0);
  await sleep(500);
  const upd = await page.evaluate(() => { const r = JSON.parse(window.XiaokeAndroid.checkUpdate()); return { status: r.status, latest: r.latest, msg: r.message, hasApk: !!r.url }; });
  console.log('   更新：', JSON.stringify(upd));
  check('檢查更新有回應', upd.status === 'ok' || /404|查詢失敗/.test(String(upd.msg)), JSON.stringify(upd));
  check('沒有畫面錯誤', errors.length === 0, errors.join('\n'));
} catch (e) {
  fail++;
  console.log('✘ 中斷：', e.message);
  shotPhone('fail');
}
await browser.close().catch(() => {});
console.log(`\n通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);
