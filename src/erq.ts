import grammar from "./erq.ohm-bundle"
import semantics from "./semantics"

console.log(semantics(grammar.match("'hello, world'", "stringLiteral")).sql)
console.log(semantics(grammar.match(String.raw`"\ud867\ude3d"`, "stringLiteral")).sql)
console.log(semantics(grammar.match(String.raw`"\ud867"`, "stringLiteral")).sql)
console.log(semantics(grammar.match(String.raw`"\ud867\ude3d"`, "Value")).evaluate!())
console.log(semantics(grammar.match(String.raw`e'\ud867\ude3d'`, "Value")).evaluate!())
