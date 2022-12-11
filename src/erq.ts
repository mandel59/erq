import grammar from "./erq.ohm-bundle"
import semantics from "./semantics"

console.log(semantics(grammar.match("'hello, world'", "stringLiteral")).sql)
console.log(semantics(grammar.match(String.raw`"\ud867\ude3d"`, "stringLiteral")).sql)
console.log(semantics(grammar.match(String.raw`"\ud867"`, "stringLiteral")).sql)
console.log(semantics(grammar.match(String.raw`"\ud867\ude3d"`, "Value")).value)
console.log(semantics(grammar.match(String.raw`\u{29e3d}`, "escapedStringComponent")).formatPartOfEscapedStringComponent)
console.log(semantics(grammar.match(String.raw`e'\u{29e3d}'`, "escapedStringLiteral")).sql)
console.log(semantics(grammar.match(String.raw`e'\u{29e3d}\%02X(15)'`, "escapedStringLiteral")).sql)
console.log(semantics(grammar.match(String.raw`x'123abc'`, "blobLiteral")).sql)
