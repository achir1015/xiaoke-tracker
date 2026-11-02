import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/app/js/core/store.js';
import * as M from '../src/app/js/core/model.js';
import { tokenize, compileFilter, sortItems, groupsOf, sumOf } from '../src/app/js/core/query.js';
import { addDays, today } from '../src/app/js/core/defs.js';

const titles = (s, p, q, opt) => s.items(p.id, { archived: 'all' }).filter(compileFilter(s, p, q, opt)).map((i) => i.title);

function seed() {
  const s = new Store();
  const p = M.createProject(s, { template: 'dev' });
  for (const it of s.items(p.id)) M.deleteItems(s, [it]);
  const iter = M.fieldOf(p, 'iteration').iter.list;
  M.addItem(s, p, { title: '登入畫面', body: '要有忘記密碼', v: { status: 'doing', assignees: ['小明'], labels: ['l1'], priority: 'p0', estimate: 3, due: addDays(today(), 3), iteration: iter[0].id } });
  M.addItem(s, p, { title: '資料庫設計', v: { status: 'todo', assignees: ['小華'], labels: ['l2'], priority: 'p2', estimate: 8, due: addDays(today(), -2) } });
  M.addItem(s, p, { title: '首頁 改版', v: { status: 'todo', labels: ['l1', 'l3'], estimate: 1 } });
  const d = M.addItem(s, p, { title: '已完成事項', v: { status: 'done' } });
  const a = M.addItem(s, p, { title: '封存事項', v: { status: 'todo' } });
  M.archive(s, [a]);
  return { s, p, d };
}

test('tokenize：引號、減號、key', () => {
  assert.deepEqual(tokenize('status:待辦 -label:a "兩 個字" 客戶:"甲 乙"'), [
    { neg: false, key: 'status', value: '待辦' }, { neg: true, key: 'label', value: 'a' },
    { neg: false, key: null, value: '兩 個字' }, { neg: false, key: '客戶', value: '甲 乙' },
  ]);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('   '), []);
});

test('狀態、或、否定、別名', () => {
  const { s, p } = seed();
  assert.deepEqual(titles(s, p, 'status:進行中'), ['登入畫面']);
  assert.deepEqual(titles(s, p, '狀態:進行中,完成'), ['登入畫面', '已完成事項']);
  assert.deepEqual(titles(s, p, '-status:待辦'), ['登入畫面', '已完成事項']);
  assert.deepEqual(titles(s, p, 'label:前端 -label:設計'), ['登入畫面']);
});

test('人員 @me、no、has', () => {
  const { s, p } = seed();
  assert.deepEqual(titles(s, p, 'assignee:@me', { me: '小明' }), ['登入畫面']);
  assert.deepEqual(titles(s, p, 'no:assignee'), ['首頁 改版', '已完成事項']);
  assert.deepEqual(titles(s, p, 'has:due'), ['登入畫面', '資料庫設計']);
});

test('is 與封存：預設不含封存', () => {
  const { s, p } = seed();
  assert.equal(titles(s, p, '').length, 4);
  assert.deepEqual(titles(s, p, 'is:archived'), ['封存事項']);
  assert.deepEqual(titles(s, p, 'is:closed'), ['已完成事項']);
  assert.equal(titles(s, p, 'is:open').length, 3);
  assert.deepEqual(titles(s, p, 'is:overdue'), ['資料庫設計']);
});

test('數字與日期比較', () => {
  const { s, p } = seed();
  assert.deepEqual(titles(s, p, 'estimate:>=3'), ['登入畫面', '資料庫設計']);
  assert.deepEqual(titles(s, p, 'estimate:2..5'), ['登入畫面']);
  assert.deepEqual(titles(s, p, 'estimate:1'), ['首頁 改版']);
  assert.deepEqual(titles(s, p, 'due:<@today'), ['資料庫設計']);
  assert.deepEqual(titles(s, p, 'due:>=@today due:<=@today+7'), ['登入畫面']);
  assert.deepEqual(titles(s, p, `due:${addDays(today(), 3)}`), ['登入畫面']);
});

test('迭代 @current', () => {
  const { s, p } = seed();
  assert.deepEqual(titles(s, p, 'iteration:@current'), ['登入畫面']);
  assert.deepEqual(titles(s, p, 'iteration:@next'), []);
});

test('文字搜尋：標題、內文、編號、不認得的 key', () => {
  const { s, p } = seed();
  assert.deepEqual(titles(s, p, '忘記密碼'), ['登入畫面']);
  assert.deepEqual(titles(s, p, '"首頁 改版"'), ['首頁 改版']);
  assert.deepEqual(titles(s, p, 'title:登入*'), ['登入畫面']);
  assert.equal(titles(s, p, 'xyz:1').length, 0);
  assert.equal(titles(s, p, 'status:').length, 4);    // 打到一半不要整片消失
});

test('自訂欄位用名稱篩選', () => {
  const { s, p } = seed();
  const f = M.addField(s, p, { name: '客戶', type: 'text' });
  M.setValue(s, p, s.items(p.id)[0], f.id, '甲公司');
  assert.deepEqual(titles(s, p, '客戶:甲*'), ['登入畫面']);
});

test('排序：空白最後、單選依選項順序、多重排序', () => {
  const { s, p } = seed();
  const list = s.items(p.id);
  assert.deepEqual(sortItems(s, p, list, [{ f: 'priority', dir: 'asc' }]).map((i) => i.title).slice(0, 2), ['登入畫面', '資料庫設計']);
  const desc = sortItems(s, p, list, [{ f: 'estimate', dir: 'desc' }]);
  assert.equal(desc[0].title, '資料庫設計');
  assert.equal(desc.at(-1).title, '已完成事項');
  assert.deepEqual(sortItems(s, p, list, []), list);
});

test('分組：多選可出現在多組、沒有值另成一組、加總', () => {
  const { s, p } = seed();
  const list = s.items(p.id);
  const g = groupsOf(s, p, M.fieldOf(p, 'labels'), list);
  assert.equal(g.find((x) => x.name === '前端').items.length, 2);
  assert.equal(g.find((x) => x.name === '設計').items.length, 1);
  assert.equal(g.at(-1).name, '沒有標籤');
  assert.equal(g.at(-1).items.length, 1);
  const people = groupsOf(s, p, M.fieldOf(p, 'assignees'), list, { keepEmpty: false });
  assert.deepEqual(people.map((x) => x.name).sort(), ['小明', '小華', '沒有負責人'].sort());
  assert.equal(sumOf(list, 'estimate'), 12);
});
