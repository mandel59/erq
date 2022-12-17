import semantics, { ExtendedNode } from "./index";
import { sqlQuoteString } from "../sql";

export type Type = {
  sql: string;
  formatPartOfEscapedStringComponent: readonly [string, ...string[]];
};

semantics.addAttribute("sql", {
  Literal_null(arg0) {
    return "null";
  },
  Literal_true(arg0) {
    return "true";
  },
  Literal_false(arg0) {
    return "false";
  },
  stringLiteral_sql(arg0, arg1, arg2) {
    return this.sourceString;
  },
  escapedStringLiteral(arg0, arg1, arg2, arg3) {
    let sFormat = ""
    let sArgs = ""
    for (const child of arg2.children) {
      const [format, ...args] = (child as ExtendedNode).formatPartOfEscapedStringComponent;
      sFormat += format;
      for (const arg of args) {
        sArgs += ",";
        sArgs += arg;
      }
    }
    return `printf('${sFormat}'${sArgs})`
  },
  jsonStringLiteral(arg0, arg1, arg2) {
    return `(${sqlQuoteString(this.sourceString)}->>'$')`;
  },
  numericLiteral(arg0) {
    return this.sourceString;
  },
  blobLiteral(arg0, arg1, arg2, arg3) {
    return this.sourceString;
  }
});

function formatPart(format: string, ...args: readonly string[]) {
  return [format, ...args] as const;
}

semantics.addAttribute("formatPartOfEscapedStringComponent", {
  escapedStringComponent_apos(arg0) {
    return formatPart("''");
  },
  escapedStringComponent_quot(arg0) {
    return formatPart('"');
  },
  escapedStringComponent_backslash(arg0) {
    return formatPart("\\");
  },
  escapedStringComponent_aposSql(arg0) {
    return formatPart("''");
  },
  escapedStringComponent_percent(arg0) {
    return formatPart("%%");
  },
  escapedStringComponent_slash(arg0) {
    return formatPart("/");
  },
  escapedStringComponent_bs(arg0) {
    return formatPart("%s", "char(8)");
  },
  escapedStringComponent_ff(arg0) {
    return formatPart("%s", "char(12)");
  },
  escapedStringComponent_lf(arg0) {
    return formatPart("%s", "char(10)");
  },
  escapedStringComponent_cr(arg0) {
    return formatPart("%s", "char(13)");
  },
  escapedStringComponent_ht(arg0) {
    return formatPart("%s", "char(9)");
  },
  escapedStringComponent_latin1(arg0, arg1) {
    return formatPart("%s", `char(0x${arg1.sourceString})`);
  },
  escapedStringComponent_unicode(arg0, arg1, arg2) {
    return formatPart("%s", `char(0x${arg1.sourceString})`);
  },
  escapedStringComponent_ucs2(arg0, arg1) {
    return formatPart("%s", `char(0x${arg1.sourceString})`);
  },
  escapedStringComponent_unicodeCalc(arg0, arg1, arg2) {
    return formatPart("%s", `char(${arg1.sql!})`);
  },
  escapedStringComponent_calc(arg0, arg1, arg2) {
    return formatPart("%s", arg1.sql!);
  },
  escapedStringComponent_formatCalc(arg0, arg1, arg2, arg3, arg4) {
    return formatPart(`%${arg1.sourceString}`, arg3.sql!);
  },
  escapedStringComponent_char(arg0) {
    return formatPart(arg0.sourceString);
  },
});
