// 用已安裝的舊版向真正的 GitHub 查更新並下載安裝檔（不執行安裝，不影響使用者開著的 App）
// 用法：node e2e/update-check.mjs <exe 路徑>
import { _electron as electron } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const profile = 'e2eUpd';
const dir = path.join(process.env.APPDATA, `xiaoke-tracker-${profile}`);
fs.rmSync(dir, { recursive: true, force: true });
const app = await electron.launch({ executablePath: process.argv[2], args: [`--profile=${profile}`, '--hidden'] });
const win = await app.firstWindow();
await win.waitForFunction(() => document.documentElement.dataset.ready === '1');
const r = await win.evaluate(() => window.xk.update.check());
console.log('查詢結果', { current: r.current, latest: r.latest, newer: r.newer, flavor: r.flavor, canInstall: r.canInstall, asset: r.asset });
const file = await win.evaluate(() => window.xk.update.download());
const st = fs.statSync(file);
console.log('下載完成', path.basename(file), (st.size / 1048576).toFixed(1) + ' MB');
await app.close();
fs.rmSync(file, { force: true });
fs.rmSync(dir, { recursive: true, force: true });
