/**
 * @param {string} quote 
 * @param {string} escape 
 */
export const getEscapeCsvValue = (quote = '"', escape = quote, nullValue = "") => {
  const escaped = `${escape || quote}${quote}`
  if (quote) {
    if (nullValue.includes(quote) || nullValue.includes('\n')) {
      nullValue = `${quote}${nullValue.replaceAll(quote, escaped)}${quote}`;
    }
    return (/** @type {any} */ value) => {
      if (value == null) {
        return nullValue;
      } else if (Buffer.isBuffer(value)) {
        // output as base64 string
        return `${quote}${value.toString("base64")}${quote}`;
      } else {
        return `${quote}${String(value).replaceAll(quote, escaped)}${quote}`;
      }
    }
  } else {
    return (/** @type {any} */ value) => {
      if (value == null) {
        return nullValue;
      } else if (Buffer.isBuffer(value)) {
        // output as base64 string
        return value.toString("base64");
      } else {
        return String(value);
      }
    }
  }
}
