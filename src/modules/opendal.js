import { createErqNodeJsModule } from "../create-erq-nodejs-module.js";

export default createErqNodeJsModule('opendal', async ({ defineFunction, defineTable }) => {
  const { Operator } = await import("opendal");

  /**
   * @param {string} url
   * @returns {Buffer}
   */
  function read(url) {
    const u = new URL(url);
    switch (u.protocol) {
      case "http:": case "https:": {
        const op = new Operator("http", {
          endpoint: u.origin,
          username: u.username || undefined,
          password: u.password || undefined,
        });
        return op.readSync(decodeURI(u.pathname));
      }
      case "s3:": {
        const op = new Operator("s3", { bucket: u.hostname });
        return op.readSync(decodeURI(u.pathname));
      }
      default: {
        throw new RangeError('unsupported protocol');
      }
    }
  }

  /**
   * @param {string} url
   * @param {Buffer | string} content
   * @returns {BigInt}
   */
  function write(url, content) {
    const u = new URL(url);
    switch (u.protocol) {
      case "http:": case "https:": {
        const op = new Operator("webdav", {
          endpoint: u.origin,
          username: u.username || undefined,
          password: u.password || undefined,
        });
        op.writeSync(decodeURI(u.pathname), content);
        return 1n;
      }
      case "s3:": {
        const op = new Operator("s3", { bucket: u.hostname });
        op.writeSync(decodeURI(u.pathname), content);
        return 1n;
      }
      default: {
        throw new RangeError('unsupported protocol');
      }
    }
  }

  /**
   * @param {string} url
   * @param {object} _options
   * @returns {Generator<[string]>}
   */
  function* list(url, _options) {
    if (url == null) return null;
    if (typeof url !== "string") throw new TypeError("write(url,content) url must be a string");
    const u = new URL(url);
    switch (u.protocol) {
      case "http:": case "https:": {
        const op = new Operator("webdav", {
          endpoint: u.origin,
          username: u.username || undefined,
          password: u.password || undefined,
        });
        const entries = op.listSync(decodeURI(u.pathname));
        for (const entry of entries) {
          yield [entry.path()]
        }
        return;
      }
      case "s3:": {
        const op = new Operator("s3", { bucket: u.hostname });
        const entries = op.listSync(decodeURI(u.pathname));
        for (const entry of entries) {
          yield [entry.path()]
        }
        return;
      }
      default: {
        throw new RangeError('unsupported protocol');
      }
    }
  }

  defineFunction("read", { deterministic: false }, function (url) {
    if (url == null) return null;
    if (typeof url !== "string") throw new TypeError("read(url) url must be a string");
    return read(url);
  });
  defineFunction("write", { deterministic: false, directOnly: true }, function (url, content) {
    if (url == null) return null;
    if (content == null) return null;
    if (typeof url !== "string") throw new TypeError("write(url,content) url must be a string");
    if (!Buffer.isBuffer(content)) throw new TypeError("write(url,content) content must be a blob");
    return write(url, content);
  });
  defineTable("list", {
    parameters: ["_url", "_options"],
    columns: ["path"],
    *rows(_url, _options) {
      if (_url == null) return;
      if (typeof _url !== "string") return;
      yield* list(_url);
    }
  })
});
