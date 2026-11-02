// 全程式共用的狀態
import { Store } from './core/store.js';

export const store = new Store();
export const S = {
  page: 'home',       // home | project
  pid: null,
  vid: null,
  tab: 'view',        // view | insights | updates | settings
  itemId: null,
  selected: new Set(),
  settings: null,
  liveFilter: null,   // 打字中還沒存的篩選
  collapsed: new Set(),
  slice: {},          // 檢視 id → 切片值
  setTab: 'general',
};

export const me = () => (S.settings && S.settings.me) || '';
export const project = () => (S.pid ? store.project(S.pid) : null);
export function view() {
  const p = project();
  if (!p) return null;
  return p.views.find((v) => v.id === S.vid) || p.views[0];
}

// 畫面更新由 app.js 掛上，其他模組呼叫 refresh()，避免互相 import
export const hooks = { refresh: () => {}, open: () => {}, openItem: () => {} };
export const refresh = (...a) => hooks.refresh(...a);
export const openProject = (...a) => hooks.open(...a);
export const openItem = (...a) => hooks.openItem(...a);
