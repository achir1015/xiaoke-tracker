// 資料中心：所有修改都走 tx()，才能復原、存檔、標記要同步
// 資料放在 db.projects、db.items（id → 紀錄）；紀錄的 u 是最後修改時間，d 是刪除時間（留墓碑給同步用）

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

export class Store {
  constructor({ now } = {}) {
    this.now = now || (() => Date.now());
    this.db = { projects: {}, items: {}, meta: {} };
    this.dirty = {};          // 'project:id' → true，等待同步
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.onPersist = null;
    this.txn = null;
    this.lastU = 0;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(info) { for (const fn of this.listeners) fn(info); }

  load(data) {
    this.db = { projects: {}, items: {}, meta: {}, ...(data && data.db ? data.db : {}) };
    this.dirty = (data && data.dirty) || {};
  }
  dump() { return { v: 1, db: this.db, dirty: this.dirty }; }

  // ---- 讀取 ----
  project(id) { const p = this.db.projects[id]; return p && !p.d ? p : null; }
  projects() { return Object.values(this.db.projects).filter((p) => !p.d).sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)); }
  item(id) { const it = this.db.items[id]; return it && !it.d ? it : null; }
  items(pid, { archived = false } = {}) {
    return Object.values(this.db.items).filter((it) => it.pid === pid && !it.d && (archived === 'all' || !!it.archived === archived)).sort((a, b) => a.order - b.order);
  }
  children(id) { return Object.values(this.db.items).filter((it) => it.parent === id && !it.d).sort((a, b) => a.order - b.order); }

  // ---- 修改 ----
  // 同一毫秒連續修改也要有先後，同步時才分得出新舊
  stamp() { const t = Math.max(this.now(), this.lastU + 1); this.lastU = t; return t; }

  // 在 fn 裡修改紀錄之前先呼叫 touch（新增用 put）；fn 結束才存檔、通知畫面
  tx(label, fn) {
    if (this.txn) return fn(); // 巢狀時併入外層，一次復原
    this.txn = { label, pre: new Map() };
    let out;
    try {
      out = fn();
    } catch (e) {
      this.rollback(this.txn);
      this.txn = null;
      throw e;
    }
    const t = this.txn;
    this.txn = null;
    if (t.pre.size) {
      if (label) { this.undoStack.push(t); if (this.undoStack.length > 100) this.undoStack.shift(); this.redoStack = []; }
      this.commit({ label });
    }
    return out;
  }

  remember(kind, id) {
    if (!this.txn) throw new Error('修改資料要包在 tx 裡');
    const key = kind + ':' + id;
    if (!this.txn.pre.has(key)) this.txn.pre.set(key, clone(this.db[kind === 'project' ? 'projects' : 'items'][id]) ?? null);
  }

  touch(kind, rec) {
    this.remember(kind, rec.id);
    rec.u = this.stamp();
    this.dirty[kind + ':' + rec.id] = true;
    return rec;
  }

  put(kind, rec) {
    this.remember(kind, rec.id);
    rec.u = this.stamp();
    this.db[kind === 'project' ? 'projects' : 'items'][rec.id] = rec;
    this.dirty[kind + ':' + rec.id] = true;
    return rec;
  }

  // 刪除只留墓碑
  remove(kind, rec) {
    this.touch(kind, rec);
    rec.d = rec.u;
  }

  rollback(t) {
    for (const [key, val] of t.pre) {
      const [kind, id] = key.split(':');
      const box = this.db[kind === 'project' ? 'projects' : 'items'];
      if (val) box[id] = val; else delete box[id];
    }
  }

  // 把紀錄換回 pre，回傳換之前的內容（給重做用）；時間戳記要更新，其他裝置才會跟著改
  swap(t) {
    const back = new Map();
    for (const [key, val] of t.pre) {
      const [kind, id] = key.split(':');
      const box = this.db[kind === 'project' ? 'projects' : 'items'];
      back.set(key, clone(box[id]) ?? null);
      if (val) box[id] = { ...clone(val), u: this.stamp() };
      else if (box[id]) { box[id].u = this.stamp(); box[id].d = box[id].u; }
      this.dirty[key] = true;
    }
    return { label: t.label, pre: back };
  }

  undo() {
    const t = this.undoStack.pop();
    if (!t) return null;
    this.redoStack.push(this.swap(t));
    this.commit({ undo: t.label });
    return t.label;
  }
  redo() {
    const t = this.redoStack.pop();
    if (!t) return null;
    this.undoStack.push(this.swap(t));
    this.commit({ redo: t.label });
    return t.label;
  }

  commit(info) {
    if (this.onPersist) this.onPersist();
    this.emit(info || {});
  }

  // ---- 同步 ----
  pending() {
    const out = [];
    for (const key of Object.keys(this.dirty)) {
      const [kind, id] = key.split(':');
      const rec = this.db[kind === 'project' ? 'projects' : 'items'][id];
      if (rec) out.push({ k: kind, id, u: rec.u, r: rec });
      else delete this.dirty[key];
    }
    return out;
  }

  // 套用遠端紀錄：時間新的贏；本機還沒送出的修改若比較新就留著
  applyRemote(changes) {
    let n = 0;
    for (const c of changes) {
      const box = this.db[c.k === 'project' ? 'projects' : 'items'];
      const cur = box[c.id];
      if (cur && cur.u >= c.u) continue;
      box[c.id] = c.r;
      delete this.dirty[c.k + ':' + c.id];
      this.lastU = Math.max(this.lastU, c.u);
      n++;
    }
    return n;
  }
}
