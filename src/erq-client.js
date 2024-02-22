import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";

export class ErqClient extends EventEmitter {
  /** @type {import("node:child_process").ChildProcess | undefined} */
  child;
  /** @type {number} */
  lastIpcCallId = 0;
  /** @type {Promise<void>} */
  ready;
  /**
   * 
   * @param {string[]} [args] 
   * @param {ErqClientOptions} [options]
   * @typedef {object} ErqClientOptions
   * @property {import("stream").Stream | 'pipe' | 'ignore' | 'inherit'} [stdin]
   * @property {import("stream").Stream | 'pipe' | 'ignore' | 'inherit'} [stdout]
   * @property {import("stream").Stream | 'pipe' | 'ignore' | 'inherit'} [stderr]
   */
  static connect(args, options) {
    const client = new ErqClient();
    client.connect(args, options);
    return client;
  }
  /**
   * 
   * @param {string[]} [args] 
   * @param {ErqClientOptions} [options]
   */
  connect(args = [], options = {}) {
    const stdin = options.stdin ?? "pipe";
    const stdout = options.stdout ?? "pipe";
    const stderr = options.stderr ?? "pipe";
    const child = this.child = fork(fileURLToPath(new URL("../bin/erq-cli.js", import.meta.url)), args, {
      stdio: [stdin, stdout, stderr, 'ipc']
    });
    child.on("exit", (code, signal) => {
      this.emit("exit", code, signal);
    });
    this.ready = new Promise((resolve) => {
      const callback = (message) => {
        if (message === "ready") {
          resolve();
          child.off("message", callback);
        }
      }
      child.on("message", callback);
    });
  }
  get pid() {
    return this.child.pid;
  }
  get stdin() {
    return this.child.stdin;
  }
  get stdout() {
    return this.child.stdout;
  }
  get stderr() {
    return this.child.stderr;
  }
  /**
   * @param {number | NodeJS.Signals} signal 
   */
  kill(signal) {
    return this.child.kill(signal);
  }
  /**
   * @param {number} code 
   */
  quit(code) {
    this.ipcSend("quit", [code], null);
  }
  /**
   * 
   * @param {string} method 
   * @param {any[]} params 
   * @returns 
   */
  ipcCall(method, params) {
    ++this.lastIpcCallId;
    const id = this.lastIpcCallId;
    return new Promise((resolve, reject) => {
      const callback = (message) => {
        if (message == null || typeof message !== "object") return;
        if (message.id !== id) return;
        if ("error" in message) {
          reject(message.error);
        } else {
          resolve(message.result);
        }
        this.child.off("message", callback);
      }
      this.child.on("message", callback);
      this.ipcSend(method, params, id);
    })
  }
  /**
   * 
   * @param {string} method 
   * @param {any[]} params 
   * @param {unknown} id 
   */
  ipcSend(method, params, id) {
    this.child.send({ method, params, id })
  }
  /**
   * Run Erq CLI command
   * @param {{ command: string, args: any[] }} param0 
   * @returns {Promise<boolean>}
   */
  runCLICommand({ command, args }) {
    return this.ipcCall("runCLICommand", [{ command, args }]);
  }
  /**
   * Run SQL statements
   * @param {any[]} statements 
   * @returns 
   */
  runSqls(statements) {
    return this.ipcCall("runSqls", [statements]);
  }
  /**
   * Evaluate an Erq script
   */
  runScript(erqScript) {
    return this.ipcCall("runScript", [erqScript]);
  }
  /**
   * Run an Erq script file
   * @param {string} filepath
   */
  runFile(filepath) {
    return this.ipcCall("runFile", [filepath]);
  }
  /**
   * Get Erq context
   * @returns {Promise<any>}
   */
  getErqContext() {
    return this.ipcCall("getErqContext", []);
  }
  /**
   * Set Erq context
   * @param {any} context
   */
  setErqContext(context) {
    return this.ipcCall("setErqContext", [context]);
  }
}
