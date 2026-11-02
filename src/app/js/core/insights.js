// 洞察圖表的資料計算：把項目依欄位統計成 { labels, series: [{ name, color, data }] }
import { addDays, today, ymd } from './defs.js';
import { groupsOf, compileFilter, sumOf } from './query.js';

const PALETTE = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#14b8a6', '#ec4899', '#eab308', '#6366f1', '#ef4444', '#64748b'];

export function chartData(store, p, chart, { me = '' } = {}) {
  const items = store.items(p.id).filter(compileFilter(store, p, chart.filter || '', { me }));
  if (chart.x === '@time') return timeSeries(store, p, chart);
  const fx = p.fields.find((f) => f.id === chart.x);
  if (!fx) return { labels: [], series: [] };
  const groups = groupsOf(store, p, fx, items, { keepEmpty: false });
  const value = (list) => (chart.y === 'count' || !chart.y ? list.length : sumOf(list, chart.y));
  const labels = groups.map((g) => g.name);
  const fg = chart.group && p.fields.find((f) => f.id === chart.group);
  if (!fg) {
    return { labels, series: [{ name: chart.y === 'count' ? '項目數' : p.fields.find((f) => f.id === chart.y)?.name || '', data: groups.map((g) => value(g.items)), colors: groups.map((g) => g.color) }] };
  }
  const sub = groupsOf(store, p, fg, items, { keepEmpty: false });
  const series = sub.map((s, i) => {
    const ids = new Set(s.items.map((x) => x.id));
    return { name: s.name, color: s.color || PALETTE[i % PALETTE.length], data: groups.map((g) => value(g.items.filter((x) => ids.has(x.id)))) };
  });
  return { labels, series };
}

// 依建立時間與關閉時間還原每天的累積數量（不需要另外存快照）
function timeSeries(store, p, chart) {
  const days = chart.days || 30;
  const end = today();
  const labels = [];
  const dayEnd = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(end, -i);
    labels.push(d.slice(5).replace('-', '/'));
    dayEnd.push(d);
  }
  const all = store.items(p.id, { archived: 'all' });
  const on = (ms) => ymd(new Date(ms));
  const created = dayEnd.map((d) => all.filter((it) => on(it.createdAt) <= d).length);
  const closed = dayEnd.map((d) => all.filter((it) => it.closedAt && on(it.closedAt) <= d).length);
  return { labels, series: [{ name: '累積完成', color: '#22c55e', data: closed }, { name: '累積建立', color: '#3b82f6', data: created }] };
}
