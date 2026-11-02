// 測試用假伺服器：OpenAI Responses API、Apps Script（跑真正的 gas/tracker.gs）、GitHub Release
import http from 'node:http';
import { loadGas } from '../test/gas-mock.mjs';

const body = (req) => new Promise((res) => { let s = ''; req.on('data', (d) => { s += d; }); req.on('end', () => res(s)); });
const listen = (srv) => new Promise((res) => srv.listen(0, '127.0.0.1', () => res(srv.address().port)));

export async function fakeOpenAI() {
  const state = { calls: [], script: [] };
  const srv = http.createServer(async (req, res) => {
    const json = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer sk-test-key') return json({ error: { message: 'bad key' } }, 401);
    if (req.url.endsWith('/models')) return json({ data: [{ id: 'gpt-6.1-terra' }, { id: 'gpt-6-astra' }, { id: 'whisper-1' }] });
    const b = JSON.parse(await body(req));
    state.calls.push(b);
    json(state.script.shift() || { id: 'r-end', output: [{ type: 'message', content: [{ type: 'output_text', text: '完成了！' }] }] });
  });
  const port = await listen(srv);
  return { state, base: `http://127.0.0.1:${port}/v1`, close: () => srv.close() };
}

export async function fakeGas(token) {
  const gas = loadGas(token);
  const srv = http.createServer(async (req, res) => {
    const contents = await body(req);
    let out;
    if (req.method === 'GET') out = gas.ctx.doGet().text;
    else out = gas.ctx.trackerPost_({ postData: { contents } }).text;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(out);
  });
  const port = await listen(srv);
  return { gas, url: `http://127.0.0.1:${port}/exec`, close: () => srv.close() };
}

export async function fakeRelease(version) {
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tag_name: `v${version}`, html_url: 'https://github.com/achir1015/xiaoke-tracker/releases', body: '測試版本說明', assets: [{ name: `XiaokeTracker-${version}-win-x64.exe`, browser_download_url: 'http://127.0.0.1:1/x.exe', size: 1 }] }));
  });
  const port = await listen(srv);
  return { url: `http://127.0.0.1:${port}/latest`, close: () => srv.close() };
}
