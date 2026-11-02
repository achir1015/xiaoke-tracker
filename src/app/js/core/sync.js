// 雲端同步：把本機待送的紀錄和伺服器交換。伺服器用流水號當游標，不受各裝置時鐘差異影響
export class Sync {
  // transport(body) → Promise<{ ok, seq, changes }>
  constructor(store, transport, { getCursor, setCursor }) {
    this.store = store;
    this.transport = transport;
    this.getCursor = getCursor;
    this.setCursor = setCursor;
    this.running = null;
    this.again = false;
    this.state = { status: 'off', at: 0, error: '' };
    this.onState = null;
  }

  set(status, extra) {
    this.state = { ...this.state, status, ...extra };
    if (this.onState) this.onState(this.state);
  }

  // 同時間只跑一次；跑到一半又要同步就再補一次
  run() {
    if (this.running) { this.again = true; return this.running; }
    this.running = this.once().finally(() => {
      this.running = null;
      if (this.again) { this.again = false; this.run(); }
    });
    return this.running;
  }

  async once() {
    const sent = this.store.pending();
    this.set('syncing');
    try {
      const res = await this.transport({ action: 'sync', since: this.getCursor() || 0, changes: sent });
      if (!res || !res.ok) throw new Error((res && res.error) || '伺服器沒有回應');
      // 送出後又改過的紀錄（u 變了）留著下次再送
      for (const c of sent) {
        const rec = this.store.db[c.k === 'project' ? 'projects' : 'items'][c.id];
        if (rec && rec.u === c.u) delete this.store.dirty[c.k + ':' + c.id];
      }
      const n = this.store.applyRemote(res.changes || []);
      this.setCursor(res.seq);
      if (n) this.store.commit({ remote: n });
      else if (sent.length && this.store.onPersist) this.store.onPersist();
      this.set('ok', { at: Date.now(), error: '', applied: n, sent: sent.length });
      return { sent: sent.length, applied: n };
    } catch (e) {
      this.set('error', { error: String(e.message || e) });
      throw e;
    }
  }
}

// 設定碼：其他裝置貼上就能同步（網址＋同步金鑰）
export const encodePairing = (url, token) => 'XKT1.' + btoa(unescape(encodeURIComponent(JSON.stringify({ url, token }))));
export function decodePairing(code) {
  const m = /^XKT1\.(.+)$/.exec(String(code).trim());
  if (!m) return null;
  try { const o = JSON.parse(decodeURIComponent(escape(atob(m[1])))); return o.url && o.token ? o : null; } catch { return null; }
}
