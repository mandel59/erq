/**
 * 
 * @param {[string, any][]} vars 
 * @returns {[string, string, string][]}
 */
export function serializeVars(vars) {
  /** @type {[string, string, string][]} */
  const serialized = [];
  for (const [k, v] of vars) {
    if (Buffer.isBuffer(v)) {
      serialized.push([k, v.toString("base64"), "buffer"]);
      continue;
    }
    const t = v == null ? "null" : typeof v;
    serialized.push([k, String(v), t]);
  }
  return serialized;
}

export function deserializeVars(serialized) {
  /** @type {[string, any][]} */
  const vars = [];
  for (const [k, v, t] of serialized) {
    if (t === "number") {
      vars.push([k, Number(v)]);
    } else if (t === "bigint") {
      vars.push([k, BigInt(v)]);
    } else if (t === "boolean") {
      vars.push([k, v === "true"]);
    } else if (t === "null") {
      vars.push([k, null]);
    } else if (t === "buffer") {
      vars.push([k, Buffer.from(v, "base64")]);
    } else {
      vars.push([k, v]);
    }
  }
  return vars;
}
