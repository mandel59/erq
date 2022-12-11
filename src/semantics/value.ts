import semantics from "./index"

export type Type = { value: unknown };
semantics.addAttribute("value", {
  stringLiteral_sql(arg0, arg1, arg2) {
    return arg1.sourceString.replace(/''/g, "'");
  },
  jsonStringLiteral(arg0, arg1, arg2) {
    const value = JSON.parse(this.sourceString);
    return value;
  },
});
