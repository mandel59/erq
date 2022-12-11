import semantics from "./index";
import { sqlQuoteString } from "../sql";

export type Type = { sql?: string };
semantics.addAttribute("sql", {
  stringLiteral_sql(arg0, arg1, arg2) {
    return this.sourceString;
  },
  jsonStringLiteral(arg0, arg1, arg2) {
    return `(${sqlQuoteString(this.sourceString)}->>'$')`;
  },
});
