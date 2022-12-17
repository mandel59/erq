import test from "ava";
import grammar from "../src/erq.ohm-bundle"
import semantics from "../src/semantics"

test("string literals", t => {
  t.deepEqual(semantics(grammar.match("'hello, world'", "stringLiteral")).sql, "'hello, world'");
  t.deepEqual(semantics(grammar.match(String.raw`"\ud867\ude3d"`, "stringLiteral")).sql, String.raw`('"\ud867\ude3d"'->>'$')`);
  t.deepEqual(semantics(grammar.match(String.raw`"\ud867"`, "stringLiteral")).sql, String.raw`('"\ud867"'->>'$')`);
  t.deepEqual(semantics(grammar.match(String.raw`"\ud867\ude3d"`, "Value")).value, "𩸽");
  t.deepEqual(semantics(grammar.match(String.raw`\u{29e3d}`, "escapedStringComponent")).formatPartOfEscapedStringComponent, ["%s", "char(0x29e3d)"]);
  t.deepEqual(semantics(grammar.match(String.raw`e'\u{29e3d}'`, "escapedStringLiteral")).sql, `printf('%s',char(0x29e3d))`);
  t.deepEqual(semantics(grammar.match(String.raw`e'\u{29e3d}\%02X(15)'`, "escapedStringLiteral")).sql, `printf('%s%02X',char(0x29e3d),15)`);
});

test("blob literals", t => {
  t.deepEqual(semantics(grammar.match(String.raw`x'123abc'`, "blobLiteral")).sql, `x'123abc'`);
  t.deepEqual(semantics(grammar.match(String.raw`X'123ABC'`, "blobLiteral")).sql, `X'123ABC'`);
});

test("numeric literals", t => {
  t.deepEqual(semantics(grammar.match(String.raw`12345`, "Literal")).sql, `12345`);
  t.deepEqual(semantics(grammar.match(String.raw`12.34`, "Literal")).sql, `12.34`);
  t.deepEqual(semantics(grammar.match(String.raw`12.`, "Literal")).sql, `12.`);
  t.deepEqual(semantics(grammar.match(String.raw`.12`, "Literal")).sql, `.12`);
  t.deepEqual(semantics(grammar.match(String.raw`.12e3`, "Literal")).sql, `.12e3`);
  t.deepEqual(semantics(grammar.match(String.raw`0.12E3`, "Literal")).sql, `0.12E3`);
  t.deepEqual(semantics(grammar.match(String.raw`001`, "Literal")).sql, `001`);
});

test("null literal", t => {
  t.deepEqual(semantics(grammar.match(String.raw`null`, "Literal")).sql, `null`);
});
