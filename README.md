# 小柯機器人專案追蹤工具

把工作整理得清清楚楚：誰要做什麼、做到哪裡、什麼時候要完成。功能參考 [GitHub Projects](https://docs.github.com/zh/issues/planning-and-tracking-with-projects)，全面繁體中文，由小柯機器人語音帶您上手。

系統開發：吳玉柱 先生 與 Claude AI Opus 5.5

## 功能

- **三種檢視**：表格（行內編輯、分組、欄寬）、看板（拖曳換欄、數量上限、泳道）、路線圖（拖曳排程、月／季／年）
- **自訂欄位**：文字、數字、日期、單選、多選、迭代；每個選項都有顏色與小圖案
- **篩選語法**：`status:進行中 assignee:@me -label:測試 due:<@today+7 is:open`，篩選與排序存在檢視裡
- **子項目與進度**、留言、活動紀錄、封存、復原與重做
- **自動化工作流程**：新增時設狀態、關閉時設完成、子項目全完成時關閉父項目、自動封存
- **洞察圖表**：狀態分布、工作量、累積完成趨勢，可自訂圖表
- **專案更新**：標示順利、有風險、落後，保留歷史紀錄
- **範本、複製專案、CSV／JSON 匯出匯入**
- **小柯助手**：用自己的 OpenAI 金鑰，說一句話就幫您查詢、新增、拆解工作，刪除前一定先問
- **雲端同步**：資料存在自己的 Google 雲端硬碟，沒有網路也能用
- **語音文字說明**與**自動更新**

## 平台

| 平台 | 狀態 |
| --- | --- |
| Windows 11、macOS（Intel／Apple 晶片） | [下載](https://github.com/achir1015/xiaoke-tracker/releases/latest) |
| Android | [下載 APK](https://github.com/achir1015/xiaoke-tracker/releases/latest) |
| iPhone、iPad | [安裝頁](https://achir1015.github.io/xiaoke-tracker/ios/)（限登記過的裝置） |
| 線上版 | [直接打開](https://achir1015.github.io/xiaoke-tracker/online/) |

首頁：https://achir1015.github.io/xiaoke-tracker/

## 發佈新版本

改 `package.json` 的版本和 `docs/ios/manifest.plist` 的 `bundle-version`，推上 main 後 CI 會建 Windows、Mac 並建立 Release。APK（`python android/build.py`）和 `.ipa`（在 Mac 跑 `ios/build-ipa.sh`）要手動上傳到 Release，`.ipa` 檔名固定 `xiaoke-tracker-ios.ipa`。

## 雲端同步設定

雲端端的程式在 [gas/tracker.gs](gas/tracker.gs)，部署在 Google Apps Script：

1. 在 Apps Script 專案新增一個檔案，貼上 `gas/tracker.gs`。程式碼裡沒有任何金鑰，可以放心公開。
2. 專案裡只有這個功能時，加上 `function doPost(e) { return trackerPost_(e); }`；已經有 `doPost` 時，在第一行加上：
   ```js
   if (e && e.parameter && e.parameter.app === 'tracker') return trackerPost_(e);
   ```
3. 部署為網頁應用程式（存取權：任何人）。已經部署過就用「管理部署作業」→ 編輯 → 新版本，網址不會變。
4. 把 `TRACKER_EXEC_URL` 填成部署的 `/exec` 網址（否則設定碼可能帶到 App 連不上的 `/dev` 網址），打開 `tracker.gs`，選 `setupTracker` 按「執行」，完成授權。函式選單只列目前打開的檔案。它會產生同步金鑰存在指令碼屬性，並在執行記錄印出「設定碼」。
5. 在 App 的「設定 → 雲端同步」按「貼上設定碼」。其他裝置用「複製設定碼」→「貼上設定碼」。

## 開發

需要 Node 22。

```bash
npm install
npm start
npm test
npm run e2e
npm run dist:win
```

- `src/app/js/core/`：不碰畫面的邏輯（資料、篩選、同步、AI 工具），手機和線上版共用
- `src/app/js/platform.js`：平台介面。桌面由 preload 提供 `window.xk`，其他平台用網頁實作
- `src/main/`：Electron 主程序（金鑰加密、資料檔、OpenAI 與 Apps Script 請求、更新）
- `e2e/fakes.mjs`：測試用的假 OpenAI、GitHub，Apps Script 跑的是真正的 `gas/tracker.gs`

## 授權

MIT
