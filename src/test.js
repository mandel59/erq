import { readFileSync } from "node:fs";
import peggy from "peggy";

const syntax = readFileSync(new URL("erq.pegjs", import.meta.url).pathname, "utf-8")
const parser = peggy.generate(syntax);

try {
  console.log(parser.parse(`employees`));

  console.log(parser.parse(`employees{name}`));

  console.log(parser.parse(`employees{name, birth}`));

  console.log(parser.parse(`employees[birth < '2000-01-01']`));

  console.log(parser.parse(`employees[birth < '2000-01-01']{id, name, birth}`));

  console.log(parser.parse(`json_each('[1, 2, 3]'){key, value}`));

  console.log(parser.parse(`
e: employees
join s: salary on s.employee_id = e.id
[s.date between '2020-01-01' and '2022-12-31']
{e.id => e.name, total: sum(s.value) desc}
[total >= 100]
`));

  console.log(parser.parse(`
e: employees, j: (json_each('[1,2,3]', '$') {value})
`));

  console.log(parser.parse(`
employees [name in json_each('["Ryusei","Mike","Bob"]', '$'){value}]
`))

  console.log(parser.parse(`
e: employees { salary: select s: salary[s.employee_id = e.id]{value} }
`))

  console.log(parser.parse(`
e: employees [exists s: salary[s.employee_id = e.id]{value}]
`))

  console.log(parser.parse(`
{ x: 0, y: 1 }; {2, 3}; {4, 5}
`))

  console.log(parser.parse(`
(
  json_each('[1,2,3]', '$') {value asc, x: value + 1};
  json_each('[1,2,3]', '$') {value desc, -value * 10}
)
{ value => sum(x) asc }
`))

  console.log(parser.parse(`
t: ({x: 1, y: 2}; {2, 3}; {3, 4})
{ t.x, t.y, z: x + y }
{ z, w: x * y * z }
`))

  console.log(parser.parse(`
mji, mjsm
where mji.MJ文字図形名 = mjsm.MJ文字図形名
select mji.*, mjsm.*
limit 10
`))

  console.log(parser.parse(`
with t(x) as (values {1}; {2}; {3})
with u as (t{x, y: x*2})
u
[{x, y} in values {1, 2}; {3, 6} and {x, y} > select values {2, 2}]
`))

  console.log(parser.parse(`
{case when 1 then 1 else 2 end, case 1 when 1 then 1 else 2 end, if 1 then 2 else 3 end}
`))

  console.log(parser.parse(`
r group by r.a select x: max(r.b)
`))

} catch (error) {
  console.error(error.message);
  if (error && error.location) {
    console.error(error.location);
  }
}
