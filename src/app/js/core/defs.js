// 共用常數：顏色、小圖案、欄位類型、專案範本（畫面、AI 助手、測試都用這一份）

export const COLORS = [
  { n: '石板灰', c: '#64748b' }, { n: '天空藍', c: '#0ea5e9' }, { n: '藍', c: '#3b82f6' }, { n: '靛', c: '#6366f1' },
  { n: '紫', c: '#a855f7' }, { n: '粉', c: '#ec4899' }, { n: '紅', c: '#ef4444' }, { n: '橘', c: '#f97316' },
  { n: '金黃', c: '#eab308' }, { n: '萊姆', c: '#84cc16' }, { n: '綠', c: '#22c55e' }, { n: '青', c: '#14b8a6' },
];

export const EMOJI = {
  專案: ['📋', '🗂️', '📁', '🚀', '🎯', '🏁', '🧭', '🗺️', '📌', '📍', '🏗️', '🧱', '🏢', '🏠', '🏥', '🏫'],
  開發: ['🤖', '💻', '📱', '🖥️', '🧩', '🔧', '🛠️', '⚙️', '🔌', '🧪', '🧬', '🐞', '🐛', '🔒', '🌐', '☁️'],
  狀態: ['⬜', '🔵', '🟡', '🟢', '🔴', '🟣', '🟠', '⚪', '✅', '❌', '⏳', '⏸️', '🚧', '🔥', '⚠️', '💤'],
  工作: ['📝', '📄', '📊', '📈', '📉', '🗓️', '⏰', '📣', '💬', '📧', '📞', '🤝', '👥', '🧑‍💻', '💡', '🔍'],
  生活: ['🎨', '🎬', '🎵', '📷', '📚', '✏️', '🍱', '☕', '🌱', '🌟', '⭐', '❤️', '🎉', '🎁', '🏆', '💰'],
};

export const FIELD_TYPES = {
  text: { name: '文字', icon: '🔤', desc: '備註、代號等簡短文字' },
  number: { name: '數字', icon: '🔢', desc: '工時、金額、點數，可以加總' },
  date: { name: '日期', icon: '🗓️', desc: '開始日、目標日，可用在路線圖' },
  select: { name: '單選', icon: '🔘', desc: '從選項中選一個，每個選項有顏色和小圖案' },
  multi: { name: '多選', icon: '🏷️', desc: '可以選好幾個，像標籤' },
  iteration: { name: '迭代', icon: '🔁', desc: '固定週期的工作時段，例如每兩週一個衝刺' },
  people: { name: '人員', icon: '👤', desc: '專案成員' },
};

// 日期計算一律用本地日期字串 YYYY-MM-DD
export const pad2 = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const diffDays = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 864e5);
export const today = () => ymd(new Date());

const o = (id, name, color, icon, extra) => ({ id, name, color, icon, ...extra });

export const DEFAULT_STATUS = [
  o('todo', '待辦', '#64748b', '⬜', { desc: '還沒開始' }),
  o('doing', '進行中', '#3b82f6', '🔵', { desc: '正在處理' }),
  o('review', '審查中', '#eab308', '🟡', { desc: '等待確認' }),
  o('done', '完成', '#22c55e', '✅', { done: true, desc: '已經完成' }),
];

export const DEFAULT_KINDS = [
  o('task', '任務', '#3b82f6', '📝'), o('feature', '功能', '#a855f7', '🌟'), o('bug', '錯誤', '#ef4444', '🐞'),
  o('idea', '想法', '#eab308', '💡'), o('doc', '文件', '#14b8a6', '📄'),
];

export const DEFAULT_PRIORITY = [
  o('p0', '緊急', '#ef4444', '🔥'), o('p1', '高', '#f97316', '🟠'), o('p2', '中', '#eab308', '🟡'), o('p3', '低', '#22c55e', '🟢'),
];

export const DEFAULT_LABELS = [
  o('l1', '前端', '#0ea5e9', '🎨'), o('l2', '後端', '#6366f1', '⚙️'), o('l3', '設計', '#ec4899', '✏️'), o('l4', '測試', '#14b8a6', '🧪'),
];

// 內建欄位：sys 不能刪除；hide 預設不顯示在表格
export function baseFields() {
  return [
    { id: 'title', name: '標題', type: 'title', sys: true },
    { id: 'status', name: '狀態', type: 'select', sys: true, options: DEFAULT_STATUS.map((x) => ({ ...x })) },
    { id: 'assignees', name: '負責人', type: 'people', sys: true },
    { id: 'priority', name: '優先度', type: 'select', options: DEFAULT_PRIORITY.map((x) => ({ ...x })) },
    { id: 'kind', name: '類型', type: 'select', sys: true, options: DEFAULT_KINDS.map((x) => ({ ...x })) },
    { id: 'labels', name: '標籤', type: 'multi', sys: true, options: DEFAULT_LABELS.map((x) => ({ ...x })) },
    { id: 'estimate', name: '預估工時', type: 'number' },
    { id: 'start', name: '開始日', type: 'date', sys: true },
    { id: 'due', name: '目標日', type: 'date', sys: true },
    { id: 'iteration', name: '迭代', type: 'iteration', iter: { days: 14, list: [] } },
    { id: 'milestone', name: '里程碑', type: 'select', options: [] },
    { id: 'progress', name: '子項目進度', type: 'progress', sys: true },
    { id: 'parent', name: '父項目', type: 'parent', sys: true },
    { id: 'links', name: '連結', type: 'link', sys: true },
    { id: 'updated', name: '更新時間', type: 'updated', sys: true },
  ];
}

export const NEVER_SHOWN_FIRST = ['estimate', 'iteration', 'milestone', 'parent', 'links', 'updated', 'start'];

export const WORKFLOWS = [
  { id: 'added', name: '新增項目時', desc: '新項目的狀態自動設為所選狀態', arg: 'status', def: { on: true, status: 'todo' } },
  { id: 'closed', name: '項目關閉時', desc: '項目勾選完成時，狀態自動設為所選狀態', arg: 'status', def: { on: true, status: 'done' } },
  { id: 'reopened', name: '項目重新開啟時', desc: '項目重新開啟時，狀態自動設為所選狀態', arg: 'status', def: { on: true, status: 'doing' } },
  { id: 'doneClose', name: '狀態改為完成時', desc: '狀態改成標記為「完成」的選項時，自動關閉項目', def: { on: true } },
  { id: 'assigned', name: '指定負責人時', desc: '待辦的項目一指定負責人，就自動改為所選狀態', arg: 'status', def: { on: false, status: 'doing' } },
  { id: 'subDone', name: '子項目全部完成時', desc: '所有子項目都關閉時，自動關閉父項目', def: { on: true } },
  { id: 'autoArchive', name: '自動封存', desc: '符合條件的項目自動封存，留下乾淨的畫面', arg: 'filter', def: { on: false, filter: 'is:closed updated:<@today-14' } },
];

export const STATUS_HEALTH = [
  { id: 'none', name: '尚未設定', color: '#64748b', icon: '⚪' },
  { id: 'ontrack', name: '進度順利', color: '#22c55e', icon: '🟢' },
  { id: 'atrisk', name: '有風險', color: '#eab308', icon: '🟡' },
  { id: 'offtrack', name: '進度落後', color: '#ef4444', icon: '🔴' },
  { id: 'hold', name: '暫停中', color: '#a855f7', icon: '⏸️' },
  { id: 'done', name: '已完成', color: '#3b82f6', icon: '🏁' },
];

// 新專案的預設檢視
export function defaultViews() {
  return [
    { id: 'v_board', name: '看板', icon: '🗂️', layout: 'board', filter: '', sort: [], group: '', slice: '', hidden: [], column: 'status', limits: {} },
    { id: 'v_table', name: '表格', icon: '📊', layout: 'table', filter: '', sort: [], group: '', slice: '', hidden: NEVER_SHOWN_FIRST.slice(), widths: {} },
    { id: 'v_road', name: '路線圖', icon: '🗺️', layout: 'roadmap', filter: '', sort: [], group: '', slice: '', hidden: [], road: { start: 'start', end: 'due', zoom: 'quarter' } },
  ];
}

export const defaultCharts = () => [
  { id: 'c_status', name: '狀態分布', layout: 'column', x: 'status', group: '', y: 'count', filter: '' },
  { id: 'c_people', name: '每人工作量', layout: 'bar', x: 'assignees', group: 'status', y: 'count', filter: 'is:open' },
  { id: 'c_burn', name: '累積完成趨勢', layout: 'area', x: '@time', group: '', y: 'count', filter: '', days: 30 },
];

// 專案範本：items 用 [標題, 狀態, 類型, 優先度] 簡寫
export const TEMPLATES = [
  { id: 'blank', name: '空白專案', icon: '📋', color: '#3b82f6', desc: '從零開始，欄位與檢視都可以自己調整', items: [] },
  { id: 'kanban', name: '看板', icon: '🗂️', color: '#14b8a6', desc: '待辦、進行中、完成，最簡單的工作流程', items: [['在這裡寫下第一件事', 'todo', 'task', 'p2']] },
  { id: 'dev', name: '軟體開發', icon: '🤖', color: '#6366f1', desc: '功能與錯誤追蹤、優先度、兩週迭代', iter: true, items: [['整理需求與畫面草圖', 'done', 'doc', 'p1'], ['建立專案架構', 'doing', 'feature', 'p1'], ['實作登入功能', 'todo', 'feature', 'p2'], ['修正首頁跑版', 'todo', 'bug', 'p1']] },
  { id: 'plan', name: '產品路線圖', icon: '🗺️', color: '#a855f7', desc: '用開始日與目標日排出每季時程', startView: 'v_road', items: [['市場調查', 'done', 'doc', 'p2'], ['第一版規格', 'doing', 'feature', 'p1'], ['上線準備', 'todo', 'task', 'p1']] },
  { id: 'bug', name: '問題回報', icon: '🐞', color: '#ef4444', desc: '收集問題、分級處理、確認修復', status: [o('new', '新回報', '#ef4444', '🆕'), o('triage', '確認中', '#eab308', '🔍'), o('fixing', '修復中', '#3b82f6', '🛠️'), o('verify', '驗證中', '#a855f7', '🧪'), o('closed', '已解決', '#22c55e', '✅', { done: true })], items: [] },
  { id: 'event', name: '活動籌備', icon: '🎉', color: '#ec4899', desc: '場地、人員、宣傳，逐項打勾', status: [o('todo', '要做', '#64748b', '📝'), o('doing', '處理中', '#3b82f6', '⏳'), o('done', '搞定', '#22c55e', '🎉', { done: true })], items: [['確認日期與場地', 'todo', 'task', 'p1'], ['邀請名單', 'todo', 'task', 'p2'], ['宣傳文宣', 'todo', 'task', 'p3']] },
  { id: 'personal', name: '個人待辦', icon: '🌱', color: '#22c55e', desc: '自己的事情一目瞭然', status: [o('todo', '想做', '#64748b', '💭'), o('doing', '做著', '#3b82f6', '🏃'), o('done', '做完', '#22c55e', '✅', { done: true })], items: [] },
];
