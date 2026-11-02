// 使用說明：文字＋語音朗讀（進來就自動念、念完自動下一課）、示意圖、「指給我看」聚光燈
import { h, fill, $ } from './util.js';
import { modal } from './ui.js';
import { voice } from './voice.js';
import { S, project } from './state.js';

// 每一課：標題、內文（會被念出來）、示意圖要亮哪一塊、「指給我看」的目標、要先切到哪個畫面
export const LESSONS = [
  { t: '歡迎使用', hl: 'all', target: null,
    p: ['您好，我是小柯機器人！這個工具可以幫您把工作整理得清清楚楚：誰要做什麼、做到哪裡、什麼時候要完成，一眼就看得到。',
      '畫面分成三塊：最左邊是專案清單，中間是工作內容，點一個項目，右邊會打開詳細資料。接下來我一課一課帶您看。'] },
  { t: '建立專案', hl: 'side', target: '#btnSideNew',
    p: ['按左邊的「新增專案」，輸入名稱，再選一個範本。範本已經幫您準備好常用的欄位，例如「軟體開發」有優先度和迭代，「活動籌備」有簡單的三個步驟。',
      '左上角的圓形圖案可以點，換成您喜歡的小圖案和顏色。專案、狀態、標籤都可以有自己的顏色，一眼就分得出來。'] },
  { t: '新增項目', project: true, hl: 'body', target: '#btnNewItem',
    p: ['項目就是一件要做的事。按右上角的「新增項目」，或是在畫面最下面的輸入框打字，按 Enter 就建立了。',
      '點項目的標題會打開右邊的詳細面板，可以寫說明、留言、看修改紀錄。大工作可以拆成「子項目」，上層會自動算出完成進度。'] },
  { t: '看板', project: true, hl: 'body', target: '#main .vtabs', layout: 'board',
    m: ['看板把工作依狀態排成幾欄，左右滑動可以看其他欄。長按卡片一下再拖到另一欄，狀態就跟著改了。', '欄位標題旁邊的三個點可以設定這一欄最多幾張卡片，超過時會變紅色提醒您。'],
    p: ['看板把工作依狀態排成幾欄，例如待辦、進行中、完成。用滑鼠拖曳卡片到另一欄，狀態就跟著改了。',
      '欄位標題旁邊的三個點可以設定這一欄最多幾張卡片，超過時會變紅色提醒您，避免同時做太多事。'] },
  { t: '表格', project: true, hl: 'body', target: '#main .vtabs', layout: 'table',
    m: ['表格像 Excel 一樣，點任何一格就能修改，左右滑動可以看其他欄位。點欄位標題可以排序、分組或隱藏欄位。', '勾選最左邊的方塊可以一次處理很多項目，例如一起改狀態、封存或刪除。'],
    p: ['表格像 Excel 一樣，點任何一格就能修改。點欄位標題可以排序、分組或隱藏欄位，拖曳欄位右邊可以調整寬度。',
      '勾選最左邊的方塊可以一次處理很多項目，例如一起改狀態、封存或刪除。'] },
  { t: '路線圖', project: true, hl: 'body', target: '#main .vtabs', layout: 'roadmap',
    m: ['路線圖把工作排在時間軸上。長按色條再拖曳可以移動日期。', '還沒有日期的項目，在它那一列的空白處點一下就會排上去。紅線是今天。可以在「檢視設定」切換月、季、年。'],
    p: ['路線圖把工作排在時間軸上，適合看整體時程。拖曳色條可以移動日期，拖色條的兩端可以調整長短。',
      '還沒有日期的項目，在它那一列的空白處點一下就會排上去。紅線是今天。可以在「檢視設定」切換月、季、年。'] },
  { t: '檢視與篩選', project: true, hl: 'tools', target: '#filterInput',
    p: ['每個分頁都是一個「檢視」，篩選和排序都會記住。按分頁旁邊的加號可以新增檢視，例如「我的工作」、「本週到期」。',
      '篩選框可以輸入關鍵字，也可以用條件：status 冒號 進行中，就只看進行中的項目；assignee 冒號 at me 是指派給自己的；is 冒號 overdue 是已逾期的。按旁邊的問號可以看到完整說明，點一下就會加進去。'] },
  { t: '自訂欄位與顏色', project: true, hl: 'body', target: '#tab-settings',
    p: ['到「專案設定」的「欄位」可以新增自己需要的欄位：文字、數字、日期、單選、多選，還有「迭代」，用來規劃每兩週一次的工作時段。',
      '單選的每個選項都能選顏色和小圖案，看板和表格都會跟著變。'] },
  { t: '自動化工作流程', project: true, hl: 'body', target: '#tab-settings',
    p: ['在「專案設定」的「工作流程」，可以讓小柯自動做事：新項目自動設成待辦、狀態改成完成就自動關閉、子項目全部完成時父項目也跟著完成、舊項目自動封存。',
      '每一項都有開關，打開就生效。'] },
  { t: '洞察圖表與專案更新', project: true, hl: 'body', target: '#tab-insights',
    p: ['「洞察」用圖表呈現狀態分布、每個人的工作量、完成趨勢，也可以自己新增圖表。',
      '「專案更新」可以定期寫下專案現況，標示進度順利、有風險或落後，讓大家知道目前的情形。'] },
  { t: 'AI 助手', hl: 'side', target: '#btnAgent',
    p: ['左下角的「小柯助手」是 AI 幫手。您可以直接跟它說：幫我把這個功能拆成子項目、列出這週到期的工作、幫我寫專案週報。它會直接在專案裡動手做好。',
      '第一次使用要在「設定」貼上 OpenAI 的金鑰。金鑰會加密保存在這台電腦，費用由您的 OpenAI 帳戶計算。小柯要刪除項目之前一定會先問您，做錯了也可以按「復原」。'] },
  { t: '雲端同步', hl: 'side', target: '#syncState',
    p: ['資料會先存在這台裝置，沒有網路也能用。在「設定」的「雲端同步」填好資料以後，資料會自動存到您的 Google 雲端硬碟，電腦和手機就能看到同一份。',
      '換新裝置時，在舊裝置按「複製設定碼」，貼到新裝置就連上了，不用重新輸入。'] },
  { t: '復原與快速鍵', hl: 'all', target: null,
    m: ['改錯了不用怕：按最上面的彎箭頭就能復原。', '左上角的三條線可以打開專案清單，按手機的返回鍵會一層一層關閉畫面。'],
    p: ['改錯了不用怕：按 Ctrl 加 Z 可以復原，Ctrl 加 Y 重做。',
      '按 Ctrl 加 K 可以搜尋所有專案的項目；按 Esc 關閉面板。'] },
  { t: '版本更新', hl: 'side', target: '#btnUpdate',
    p: ['小柯每次開啟都會自動檢查新版本。有新版本時「檢查更新」會出現小紅點，按一下就會自動下載、安裝並重新開啟，資料不會受影響。',
      '有任何問題都可以再按「使用說明」來聽一次。祝您工作順利！'] },
];

function art(hl) {
  const on = (k) => (hl === k || hl === 'all' ? 'on' : '');
  return `<svg viewBox="0 0 320 180" class="guide-art">
  <rect x="2" y="2" width="316" height="176" rx="10" class="frame"/>
  <rect x="8" y="8" width="62" height="164" rx="6" class="blk ${on('side')}"/>
  ${[20, 34, 48, 62].map((y) => `<rect x="14" y="${y}" width="50" height="8" rx="3" class="ln"/>`).join('')}
  <rect x="14" y="150" width="50" height="12" rx="4" class="blk2"/>
  <rect x="76" y="8" width="236" height="26" rx="6" class="blk ${on('tools')}"/>
  <rect x="84" y="16" width="130" height="10" rx="4" class="blk2"/>
  <rect x="76" y="40" width="236" height="132" rx="6" class="blk ${on('body')}"/>
  ${[84, 158, 232].map((x, i) => `<rect x="${x}" y="48" width="66" height="116" rx="5" class="blk2"/>${[0, 1, 2].slice(0, 3 - i).map((k) => `<rect x="${x + 6}" y="${58 + k * 30}" width="54" height="24" rx="4" class="ln"/>`).join('')}`).join('')}
</svg>`;
}

let state = { i: 0, auto: true };

function lessons() {
  const mobile = window.xkNative && window.xkNative.mobile;
  return mobile ? LESSONS.map((l) => ({ ...l, p: l.m || l.p })) : LESSONS;
}

export function openGuide(start, nav) {
  const list0 = lessons();
  if (typeof start === 'number') state.i = start;
  let alive = true;
  let token = 0;
  const list = h('div', { class: 'g-list' });
  const pic = h('div', { class: 'g-art' });
  const title = h('h3');
  const text = h('div', { class: 'g-text' });
  const playBtn = h('button', { class: 'btn', id: 'guidePlay' });
  const autoChk = h('input', { type: 'checkbox', checked: state.auto, onchange: () => { state.auto = autoChk.checked; } });
  const showBtn = h('button', { class: 'btn', id: 'guideShow', onclick: () => pointAt() }, '👉 指給我看');
  const prev = h('button', { class: 'btn', onclick: () => goto(state.i - 1) }, '◀ 上一課');
  const next = h('button', { class: 'btn primary', id: 'guideNext' }, '下一課 ▶');
  const novoice = h('div', { class: 'hint g-novoice' });

  const renderList = () => fill(list, ...list0.map((l, i) => h('button', { class: `g-item ${i === state.i ? 'on' : ''}`, onclick: () => goto(i) }, h('span', { class: 'n' }, String(i + 1)), l.t)));
  const setPlaying = (p) => { playBtn.textContent = p ? '⏸ 停止朗讀' : '🔊 朗讀這一課'; playBtn.dataset.on = p ? '1' : ''; };

  async function speakLesson(force) {
    const my = ++token;
    setPlaying(true);
    const L = list0[state.i];
    const paras = [...text.children];
    for (let k = 0; k < L.p.length; k++) {
      if (!alive || my !== token) return;
      paras.forEach((p, j) => p.classList.toggle('reading', j === k));
      await voice.speak((k === 0 ? `第${state.i + 1}課，${L.t}。` : '') + L.p[k], { force });
    }
    if (!alive || my !== token) return;
    paras.forEach((p) => p.classList.remove('reading'));
    setPlaying(false);
    if (state.auto && state.i < list0.length - 1) { await new Promise((r) => setTimeout(r, 700)); if (alive && my === token) goto(state.i + 1); }
  }
  function stop() { token++; voice.stop(); setPlaying(false); for (const p of text.children) p.classList.remove('reading'); }
  playBtn.onclick = () => { if (playBtn.dataset.on) stop(); else speakLesson(true); };

  function goto(i, speak = true) {
    if (i < 0 || i >= list0.length) return;
    stop();
    state.i = i;
    const L = list0[i];
    renderList();
    pic.innerHTML = art(L.hl);
    title.textContent = `第 ${i + 1} 課　${L.t}`;
    fill(text, ...L.p.map((p) => h('p', {}, p)));
    prev.disabled = i === 0;
    next.textContent = i === list0.length - 1 ? '看完了 ✔' : '下一課 ▶';
    next.onclick = () => (i === list0.length - 1 ? m.close(true) : goto(i + 1));
    showBtn.style.visibility = L.target ? '' : 'hidden';
    if (speak && voice.enabled) speakLesson();
  }

  // 關掉說明視窗、把目標框起來；需要時先切到示範用的專案畫面
  async function pointAt() {
    const L = list0[state.i];
    stop();
    if (L.project && nav) await nav(L);
    const el = L.target && $(L.target);
    if (!el) return;
    if (el.closest('#side') && getComputedStyle($('#topbar')).display !== 'none') {
      document.body.classList.add('side-open');
      await new Promise((r) => setTimeout(r, 240));
    }
    m.card.parentElement.style.display = 'none';
    await spotlight(el, L.t, L.p[0]);
    m.card.parentElement.style.display = '';
  }

  const body = h('div', { class: 'guide' },
    list,
    h('div', { class: 'g-main' },
      h('div', { class: 'g-top' }, h('img', { src: 'img/logo64.png', width: 48, height: 48, alt: '' }), title),
      pic, text, novoice,
      h('div', { class: 'g-ctrl' }, playBtn, showBtn, h('label', { class: 'chk' }, autoChk, '念完自動下一課'), h('span', { class: 'sp' }), prev, next)));
  const m = modal({ title: '使用說明（小柯機器人語音導覽）', body, wide: true, cls: 'guide-modal', onClose: () => { alive = false; stop(); } });
  if (!voice.available) novoice.textContent = '※ 找不到中文語音，只能看文字。可在 Windows 設定 → 時間與語言 → 語音 新增「中文（台灣）」語音。';
  else if (!voice.enabled) novoice.textContent = '※ 語音朗讀已在設定中關閉，按「朗讀這一課」仍可播放。';
  goto(state.i, true);
  return m.done;
}

// 聚光燈：把某個元件以外的地方變暗，旁邊顯示說明泡泡
export function spotlight(el, title, text) {
  return new Promise((resolve) => {
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    const pad = 6;
    const hole = h('div', { class: 'spot-hole', style: { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' } });
    const tip = h('div', { class: 'spot-tip' }, h('img', { src: 'img/logo64.png', width: 40, height: 40, alt: '' }), h('div', {}, h('b', {}, title), h('p', {}, text), h('small', {}, '點一下任何地方回到說明')));
    const ov = h('div', { class: 'spot' }, hole, tip);
    document.body.append(ov);
    const below = r.bottom + 180 < innerHeight;
    tip.style.left = Math.max(12, Math.min(innerWidth - 380, r.left)) + 'px';
    tip.style.top = (below ? r.bottom + 16 : Math.max(12, r.top - 16 - tip.offsetHeight)) + 'px';
    voice.speak('在這裡。' + text);
    const end = () => { voice.stop(); ov.remove(); removeEventListener('keydown', key, true); resolve(); };
    const key = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); end(); } };
    ov.addEventListener('click', end);
    addEventListener('keydown', key, true);
  });
}

export { S, project };
