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
    query: "select e.id, e.name, sum(s.value) as total from employees as e join salary as s on s.employee_id = e.id where (s.date between '2020-01-01' and '2022-12-31') group by (e.id) having (total >= 100) order by (sum(s.value)) desc"
  });
  t.deepEqual(parser.parse(`e: employees join j: (json_each('[1,2,3]', '$') {value})`), {
    type: 'select',
    query: "select * from employees as e join (select value from json_each('[1,2,3]', '$')) as j"
  });
  t.deepEqual(parser.parse(`employees [name in json_each('["Ryusei","Mike","Bob"]', '$'){value}]`), {
    type: 'select',
    query: `select * from employees where (name in (select value from json_each('["Ryusei","Mike","Bob"]', '$')))`
  });
  t.deepEqual(parser.parse(`e: employees { salary: select s: salary[s.employee_id = e.id]{value} }`), {
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
    [{x, y} in values {1, 2}; {3, 6} and {x, y} > select values {2, 2}]
  `), {
    type: 'select',
    query: 'with t(x) as (values (1), (2), (3)), u as (select x, x * 2 as y from t) select * from u where ((x, y) in (values (1, 2), (3, 6)) and (x, y) > (values (2, 2)))'
  });
  t.deepEqual(parser.parse(`{case when 1 then 1 else 2 end, case 1 when 1 then 1 else 2 end, if 1 then 2 else 3 end}`), {
    type: 'select',
    query: 'select case when 1 then 1 else 2 end, case 1 when 1 then 1 else 2 end, case when 1 then 2 else 3 end'
  });
  t.deepEqual(parser.parse(`r group by r.a select x: max(r.b)`), { type: 'select', query: 'select max(r.b) as x from r group by (r.a)' });
});
