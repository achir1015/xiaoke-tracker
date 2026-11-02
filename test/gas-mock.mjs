// 用記憶體模擬 Apps Script 的 DriveApp、LockService 等，直接載入真正的 gas/tracker.gs 來測試
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadGas(token = 'test-token') {
  const files = new Map();
  const makeFile = (name, content) => {
    const f = {
      name, content, trashed: false,
      getName: () => f.name,
      getBlob: () => ({ getDataAsString: () => f.content }),
      setContent: (c) => { f.content = c; },
      getParents: () => ({ next: () => folder }),
      makeCopy: (n) => { const c = makeFile(n, f.content); files.set(n, c); return c; },
      setTrashed: () => { files.delete(f.name); },
    };
    return f;
  };
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const folder = {
    getFilesByName: (n) => iter(files.has(n) ? [files.get(n)] : []),
    getFiles: () => iter([...files.values()]),
    createFile: (n, c) => { const f = makeFile(n, c); files.set(n, f); return f; },
  };
  let hasFolder = false;
  const props = token ? { TRACKER_TOKEN: token } : {};
  const ctx = {
    console,
    DriveApp: { getFoldersByName: () => iter(hasFolder ? [folder] : []), createFolder: () => { hasFolder = true; return folder; } },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ text: s, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate: (d) => d.toISOString().slice(0, 10).replace(/-/g, ''),
      getUuid: () => crypto.randomUUID(),
      Charset: { UTF_8: 'utf8' },
      base64Encode: (s) => Buffer.from(s, 'utf8').toString('base64'),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }) },
    Logger: { log() {} },
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(here, '..', 'gas', 'tracker.gs'), 'utf8');
  vm.runInContext(src, ctx);
  const post = (body) => JSON.parse(ctx.trackerPost_({ postData: { contents: JSON.stringify(body) } }).text);
  return { ctx, files, post };
}
