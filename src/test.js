import test from "ava";
import { readFileSync } from "node:fs";
import peggy from "peggy";

const syntax = readFileSync(new URL("erq.pegjs", import.meta.url).pathname, "utf-8")
const parser = peggy.generate(syntax);

test('select table', t => {
  t.deepEqual(parser.parse(`employees`), { type: 'select', query: 'select * from employees' });
  t.deepEqual(parser.parse(`employees{name}`), { type: 'select', query: 'select name from employees' });
  t.deepEqual(parser.parse(`employees{name, birth}`), { type: 'select', query: 'select name, birth from employees' });
  t.deepEqual(parser.parse(`employees[birth < '2000-01-01']`), {
    type: 'select',
    query: "select * from employees where (birth < '2000-01-01')"
  });
  t.deepEqual(parser.parse(`employees[birth < '2000-01-01']{id, name, birth}`), {
    type: 'select',
    query: "select id, name, birth from employees where (birth < '2000-01-01')"
  });
  t.deepEqual(parser.parse(`json_each('[1, 2, 3]'){key, value}`), {
    type: 'select',
    query: "select `key`, value from json_each('[1, 2, 3]')"
  });
  t.deepEqual(parser.parse(`
    e: employees
    join s: salary on s.employee_id = e.id
    [s.date between '2020-01-01' and '2022-12-31']
    {e.id => e.name, total: sum(s.value) desc}
    [total >= 100]
  `), {
    type: 'select',
    query: "select e.id, e.name, sum(s.value) as total from employees as e join salary as s on s.employee_id = e.id where (s.date between '2020-01-01' and '2022-12-31') group by (e.id) having (total >= 100) order by total desc"
  });
  t.deepEqual(parser.parse(`e: employees join j: (json_each('[1,2,3]', '$') {value})`), {
    type: 'select',
    query: "select * from employees as e join (select value from json_each('[1,2,3]', '$')) as j"
  });
  t.deepEqual(parser.parse(`employees [name in json_each('["Ryusei","Mike","Bob"]', '$'){value}]`), {
    type: 'select',
    query: `select * from employees where (name in (select value from json_each('["Ryusei","Mike","Bob"]', '$')))`
  });
  t.deepEqual(parser.parse(`e: employees { salary: from s: salary[s.employee_id = e.id]{value} }`), {
    type: 'select',
    query: 'select (select value from salary as s where (s.employee_id = e.id)) as salary from employees as e'
  });
  t.deepEqual(parser.parse(`e: employees [exists s: salary[s.employee_id = e.id]{value}]`), {
    type: 'select',
    query: 'select * from employees as e where (exists (select value from salary as s where (s.employee_id = e.id)))'
  });
  t.deepEqual(parser.parse(`{ x: 0, y: 1 }; {2, 3}; {4, 5}`), {
    type: 'select',
    query: 'select 0 as x, 1 as y union all select 2, 3 union all select 4, 5'
  });
  t.deepEqual(parser.parse(`
    (
      json_each('[1,2,3]', '$') {value asc, x: value + 1};
      json_each('[1,2,3]', '$') {value desc, -value * 10}
    )
    { value => sum(x) asc }
  `), {
    type: 'select',
    query: "select value, sum(x) from (select * from (select value, value + 1 as x from json_each('[1,2,3]', '$') order by (value) asc) union all select * from (select value, - value * 10 from json_each('[1,2,3]', '$') order by (value) desc)) group by (value) order by (sum(x)) asc"
  });
  t.deepEqual(parser.parse(`
    t: ({x: 1, y: 2}; {2, 3}; {3, 4})
    { t.x, t.y, z: x + y }
    { z, w: x * y * z }
  `), {
    type: 'select',
    query: 'select z, x * y * z as w from (select t.x, t.y, x + y as z from (select 1 as x, 2 as y union all select 2, 3 union all select 3, 4) as t) as t'
  });
  t.deepEqual(parser.parse(`
    mji join mjsm
    where mji.MJ文字図形名 = mjsm.MJ文字図形名
    select mji.*, mjsm.*
    limit 10
  `), {
    type: 'select',
    query: 'select mji.*, mjsm.* from mji join mjsm where (mji.MJ文字図形名 = mjsm.MJ文字図形名) limit 10'
  });
  t.deepEqual(parser.parse(`
    with t(x) as (values {1}; {2}; {3})
    with u as (t{x, y: x*2})
    u
    [{x, y} in values {1, 2}; {3, 6} and {x, y} > values {2, 2}]
  `), {
    type: 'select',
    query: 'with t(x) as (values (1), (2), (3)), u as (select x, x * 2 as y from t) select * from u where ((x, y) in (values (1, 2), (3, 6)) and (x, y) > (values (2, 2)))'
  });
  t.deepEqual(parser.parse(`{case when 1 then 1 else 2 end, case 1 when 1 then 1 else 2 end, if 1 then 2 else 3 end}`), {
    type: 'select',
    query: 'select case when 1 then 1 else 2 end, case 1 when 1 then 1 else 2 end, case when 1 then 2 else 3 end'
  });
  t.deepEqual(parser.parse(`r group by r.a select x: max(r.b)`), { type: 'select', query: 'select max(r.b) as x from r group by (r.a)' });
  t.deepEqual(parser.parse(`{x and exists t and y}`), { type: 'select', query: 'select x and exists (select * from t) and y' });
  t.deepEqual(parser.parse(`{x and not exists t[p] and y}`), { type: 'select', query: 'select x and not exists (select * from t where (p)) and y' });
  t.deepEqual(parser.parse(`explain query plan t`), { type: 'select', query: 'explain query plan select * from t' });
  t.deepEqual(parser.parse(`explain t`), { type: 'select', query: 'explain select * from t' });
  t.deepEqual(parser.parse(`t: {x: 'a b c'} join string_split(x, ' ')`), { type: 'select', query: `select * from (select 'a b c' as x) as t join string_split(x, ' ')` });
  t.deepEqual(parser.parse(`from mji limit 10`), { type: 'select', query: `select * from mji limit 10` });
  t.deepEqual(parser.parse(`from mji_reading [MJ文字図形名 = from mji [対応するUCS = '𩸽'] {MJ文字図形名}]`), { type: 'select', query: `select * from mji_reading where (MJ文字図形名 = (select MJ文字図形名 from mji where (対応するUCS = '𩸽')))` });
  t.deepEqual(parser.parse(`mji_reading [MJ文字図形名 in mji[対応するUCS = '𩸽']{MJ文字図形名}]`), { type: 'select', query: `select * from mji_reading where (MJ文字図形名 in (select MJ文字図形名 from mji where (対応するUCS = '𩸽')))` });
  t.deepEqual(parser.parse(`{from_1}`), { type: 'select', query: `select from_1` });
  t.deepEqual(parser.parse(`{'a' in ['a', 'b', 'c']}`), { type: 'select', query: `select 'a' in ('a', 'b', 'c')` });
  t.deepEqual(parser.parse(`{{'a'} in [{'a'}, {'b'}, {'c'}]}`), { type: 'select', query: `select ('a') in (('a'), ('b'), ('c'))` });
  t.deepEqual(parser.parse(`values ['a', 'b', 'c']`), { type: 'select', query: `values ('a'), ('b'), ('c')` });
  t.deepEqual(parser.parse(`values [{'a'}, {'b'}, {'c'}]`), { type: 'select', query: `values ('a'), ('b'), ('c')` });
  t.deepEqual(
    parser.parse(`p {pname => max_weight: max(weight)} window w as (order by max_weight desc) {pname, rank: over w rank()}`),
    { type: 'select', query: `select pname, rank() over w as rank from (select pname, max(weight) as max_weight from p group by (pname)) window w as (order by max_weight desc)` }
  );
});

test('create table', t => {
  t.deepEqual(parser.parse(`table temp.t = {42}`), { type: 'create', query: `create table \`temp\`.t as with t as (select 42) select * from t` });
})

test('create view', t => {
  t.deepEqual(parser.parse(`view temp.t = {42}`), { type: 'create', query: `create view \`temp\`.t as with t as (select 42) select * from t` });
})

test('create index', t => {
  t.deepEqual(parser.parse(`create index if not exists i on t (x collate nocase asc, y desc)`), { type: 'create', query: `create index if not exists i on t (x collate nocase asc, y desc)` });
})

test('load table', t => {
  t.deepEqual(parser.parse(`load table p from \`\`\`csv\nx,y\n1,2\n3,4\n,6\n7,\n\`\`\``), {
    command: 'meta-load',
    type: 'command',
    args: {
      columns: null,
      content: `x,y\n1,2\n3,4\n,6\n7,\n`,
      contentType: 'csv',
      def: null,
      options: {},
      table: 'p',
    },
  });
  t.deepEqual(parser.parse(`load table p(x integer, y integer, z as (x + y)) from \`\`\`csv\nx,y\n1,2\n3,4\n,6\n7,\n\`\`\` header`), {
    command: 'meta-load',
    type: 'command',
    args: {
      columns: ['x', 'y'],
      content: `x,y\n1,2\n3,4\n,6\n7,\n`,
      contentType: 'csv',
      def: 'x integer, y integer, z as (x + y)',
      options: { header: true },
      table: 'p',
    },
  });
})
