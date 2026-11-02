// 洞察：圖表卡片、自訂圖表、用 SVG 自己畫
import { h, fill, esc } from './util.js';
import { modal, row, menu, confirmBox } from './ui.js';
import { store, me } from './state.js';
import * as M from './core/model.js';
import { chartData } from './core/insights.js';

const W = 560, H = 280;
const LAYOUTS = [['column', '直條圖'], ['bar', '橫條圖'], ['line', '折線圖'], ['area', '面積圖'], ['pie', '圓餅圖']];
const fallback = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#14b8a6', '#ec4899', '#eab308', '#6366f1'];
// 座標軸上限：四等分都是整數，項目數才不會出現 1.5
const niceMax = (v) => { const step = Math.max(1, Math.ceil(v / 4)); const e = 10 ** Math.max(0, Math.floor(Math.log10(step))); return Math.ceil(step / e) * e * 4; };

function colorOf(s, i, j) { return (s.colors && s.colors[j]) || s.color || fallback[(s.colors ? j : i) % fallback.length]; }

export function svgChart(data, layout) {
  const { labels, series } = data;
  if (!labels.length || !series.length) return '<div class="empty">目前沒有資料</div>';
  if (layout === 'pie') return pie(labels, series[0]);
  const stacks = labels.map((_, j) => series.reduce((a, s) => a + (s.data[j] || 0), 0));
  const stacked = series.length > 1 && (layout === 'column' || layout === 'bar');
  const max = niceMax(Math.max(...(stacked ? stacks : series.flatMap((s) => s.data)), 1));
  const tip = (t) => `<title>${esc(t)}</title>`;
  if (layout === 'bar') {
    const L = 96, R = 30, T = 8, rowH = Math.min(34, (H - T - 8) / labels.length), bh = rowH * 0.66;
    let o = '';
    labels.forEach((lab, j) => {
      const y = T + j * rowH;
      o += `<text x="${L - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" class="ax">${esc(lab.slice(0, 7))}</text>`;
      let x = L;
      series.forEach((s, i) => {
        const w = ((s.data[j] || 0) / max) * (W - L - R);
        if (w > 0) o += `<rect x="${x}" y="${y + (rowH - bh) / 2}" width="${w}" height="${bh}" rx="3" fill="${colorOf(s, i, j)}">${tip(`${lab} ${s.name}：${s.data[j]}`)}</rect>`;
        x += w;
      });
      o += `<text x="${x + 6}" y="${y + rowH / 2 + 4}" class="ax b">${stacks[j]}</text>`;
    });
    return wrap(o, series);
  }
  const L = 36, R = 12, T = 22, B = 34, PW = W - L - R, PH = H - T - B;
  let o = '';
  for (let i = 0; i <= 4; i++) {
    const y = T + PH - (i / 4) * PH;
    o += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="gl"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" class="ax">${Math.round((max * i) / 4 * 10) / 10}</text>`;
  }
  const n = labels.length;
  const step = Math.ceil(n / 8);
  if (layout === 'column') {
    const slot = PW / n, bw = Math.min(46, slot * 0.66);
    labels.forEach((lab, j) => {
      const cx = L + slot * j + slot / 2;
      let y = T + PH;
      series.forEach((s, i) => {
        const ht = ((s.data[j] || 0) / max) * PH;
        y -= ht;
        if (ht > 0) o += `<rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="${ht}" rx="3" fill="${colorOf(s, i, j)}">${tip(`${lab} ${s.name}：${s.data[j]}`)}</rect>`;
      });
      o += `<text x="${cx}" y="${y - 5}" text-anchor="middle" class="ax b">${stacks[j]}</text>`;
      if (j % step === 0) o += `<text x="${cx}" y="${H - 14}" text-anchor="middle" class="ax">${esc(lab.slice(0, 6))}</text>`;
    });
    return wrap(o, series);
  }
  const X = (j) => L + (n === 1 ? PW / 2 : (j / (n - 1)) * PW);
  const Y = (v) => T + PH - (v / max) * PH;
  series.forEach((s, i) => {
    const pts = s.data.map((v, j) => `${X(j)},${Y(v)}`).join(' ');
    const c = colorOf(s, i, 0);
    if (layout === 'area') o += `<polygon points="${X(0)},${T + PH} ${pts} ${X(n - 1)},${T + PH}" fill="${c}" opacity=".18"/>`;
    o += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/>`;
    s.data.forEach((v, j) => { o += `<circle cx="${X(j)}" cy="${Y(v)}" r="${n > 20 ? 6 : 3}" fill="${n > 20 ? 'transparent' : c}">${tip(`${labels[j]} ${s.name}：${v}`)}</circle>`; });
  });
  labels.forEach((lab, j) => { if (j % step === 0) o += `<text x="${X(j)}" y="${H - 14}" text-anchor="middle" class="ax">${esc(lab)}</text>`; });
  return wrap(o, series);
}

function wrap(body, series) {
  const legend = series.length > 1 ? `<div class="legend">${series.map((s, i) => `<span><i style="background:${colorOf(s, i, 0)}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${body}</svg>${legend}`;
}

function pie(labels, s) {
  const total = s.data.reduce((a, b) => a + b, 0) || 1;
  const cx = 150, cy = 140, r = 112, ri = 62;
  let a = -Math.PI / 2, o = '', leg = '';
  s.data.forEach((v, j) => {
    const c = colorOf(s, 0, j);
    const b = a + (v / total) * Math.PI * 2;
    const big = b - a > Math.PI ? 1 : 0;
    const pt = (R, t) => `${cx + R * Math.cos(t)} ${cy + R * Math.sin(t)}`;
    if (v > 0) {
      o += v === total
        ? `<circle cx="${cx}" cy="${cy}" r="${(r + ri) / 2}" fill="none" stroke="${c}" stroke-width="${r - ri}"><title>${esc(labels[j])}：${v}</title></circle>`
        : `<path d="M${pt(r, a)} A${r} ${r} 0 ${big} 1 ${pt(r, b)} L${pt(ri, b)} A${ri} ${ri} 0 ${big} 0 ${pt(ri, a)}Z" fill="${c}"><title>${esc(labels[j])}：${v}</title></path>`;
    }
    a = b;
    if (j < 10) leg += `<g transform="translate(300 ${28 + j * 24})"><rect width="13" height="13" rx="3" fill="${c}"/><text x="20" y="11" class="ax big">${esc(labels[j].slice(0, 12))}　${v}（${Math.round((v / total) * 100)}%）</text></g>`;
  });
  o += `<text x="${cx}" y="${cy + 8}" text-anchor="middle" class="pie-total">${s.data.reduce((x, y) => x + y, 0)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${o}${leg}</svg>`;
}

export function renderInsights(p, host) {
  const charts = p.charts || [];
  fill(host, h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h3', {}, '📈 洞察'), h('span', { class: 'sp' }), h('button', { class: 'btn primary', id: 'btnNewChart', onclick: () => chartDialog(p) }, '＋ 新增圖表')),
    h('div', { class: 'chart-grid' }, charts.map((c) => h('section', { class: 'chart-card' },
      h('div', { class: 'cc-head' }, h('b', {}, c.name), h('span', { class: 'sp' }), h('button', { class: 'icon-btn small', title: '圖表選項', 'aria-label': `${c.name} 選項`, onclick: (e) => menu(e.currentTarget, [
        { icon: '✏️', label: '編輯', onClick: () => chartDialog(p, c) },
        { icon: '🗑️', label: '刪除', danger: true, onClick: async () => { if (await confirmBox(`要刪除圖表「${c.name}」嗎？`, { ok: '刪除', danger: true })) store.tx('刪除圖表', () => { store.touch('project', p); p.charts = p.charts.filter((x) => x.id !== c.id); }); } },
      ], { width: 130, align: 'right' }) }, '⋯')),
      h('div', { class: 'cc-body', html: svgChart(chartData(store, p, c, { me: me() }), c.layout) }))))));
}

function chartDialog(p, c) {
  const isNew = !c;
  const cur = c ? { ...c } : { id: M.uid('c_'), name: '新圖表', layout: 'column', x: 'status', group: '', y: 'count', filter: '', days: 30 };
  const opt = (v, t, sel) => h('option', { value: v, selected: sel === v }, t);
  const xf = p.fields.filter((f) => ['select', 'multi', 'people', 'iteration'].includes(f.type));
  const name = h('input', { type: 'text', value: cur.name });
  const layout = h('select', {}, LAYOUTS.map(([v, t]) => opt(v, t, cur.layout)));
  const x = h('select', {}, opt('@time', '時間（累積趨勢）', cur.x), xf.map((f) => opt(f.id, f.name, cur.x)));
  const group = h('select', {}, opt('', '不分組', cur.group), xf.map((f) => opt(f.id, f.name, cur.group)));
  const y = h('select', {}, opt('count', '項目數', cur.y), p.fields.filter((f) => f.type === 'number').map((f) => opt(f.id, `${f.name}（加總）`, cur.y)));
  const filter = h('input', { type: 'text', value: cur.filter || '', placeholder: '例如 is:open' });
  const days = h('select', {}, [14, 30, 60, 90, 180].map((d) => opt(String(d), `最近 ${d} 天`, String(cur.days || 30))));
  const preview = h('div', { class: 'cc-body' });
  const read = () => ({ ...cur, name: name.value.trim() || '圖表', layout: layout.value, x: x.value, group: group.value, y: y.value, filter: filter.value, days: Number(days.value) });
  const paint = () => { const k = read(); preview.innerHTML = svgChart(chartData(store, p, k, { me: me() }), k.layout); days.parentElement.style.display = k.x === '@time' ? '' : 'none'; };
  const form = h('div', { class: 'form-grid', onchange: paint }, h('div', { class: 'span2' }, row('名稱', name)), row('圖表樣式', layout), row('橫軸', x), row('分組', group), row('數值', y), row('篩選', filter), row('時間範圍', days));
  modal({
    title: isNew ? '新增圖表' : '編輯圖表', wide: true, body: h('div', { class: 'chart-edit' }, form, preview),
    buttons: [{ label: '取消' }, {
      label: '儲存', primary: true, onClick: (close) => {
        store.tx('儲存圖表', () => {
          store.touch('project', p);
          p.charts ||= [];
          const i = p.charts.findIndex((q) => q.id === cur.id);
          if (i >= 0) p.charts[i] = read(); else p.charts.push(read());
        });
        close();
      },
    }],
  });
  paint();
}
