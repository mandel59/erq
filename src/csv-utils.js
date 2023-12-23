export const escapeCsvValue = (/** @type {any} */ value) => {
  if (value == null) {
    return "";
  } else if (Buffer.isBuffer(value)) {
    // output as base64 string
    return `"${value.toString("base64")}"`;
  } else {
    return `"${String(value).replace(/"/g, '""')}"`;
  }
}
