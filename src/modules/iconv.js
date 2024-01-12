import { createErqNodeJsModule } from "../create-erq-nodejs-module.js";

export default createErqNodeJsModule('iconv', async ({ defineFunction }) => {
  const { decode, encode } = await import("iconv-lite");

  defineFunction("decode", { deterministic: true }, function (buffer, encoding) {
    if (buffer == null) return null;
    if (encoding == null) return null;
    if (!Buffer.isBuffer(buffer)) throw new TypeError("iconv_decode(buffer,encoding) buffer must be a blob");
    if (typeof encoding !== "string") throw new TypeError("iconv_decode(buffer,encoding) encoding must be a string");
    return decode(buffer, encoding);
  })

  defineFunction("encode", { deterministic: true }, function (str, encoding) {
    if (str == null) return null;
    if (encoding == null) return null;
    if (typeof str !== "string") throw new TypeError("iconv_encode(str,encoding) str must be a string");
    if (typeof encoding !== "string") throw new TypeError("iconv_encode(str,encoding) encoding must be a string");
    return encode(str, encoding);
  })
});
