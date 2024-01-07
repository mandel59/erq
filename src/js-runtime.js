export class JSRuntime {
  /** @type {import("quickjs-emscripten").QuickJSWASMModule | undefined} */
  QuickJS;
  /** @type {import("quickjs-emscripten").QuickJSRuntime | undefined} */
  runtime;
  /** @type {Map<string, string>} */
  funcs = new Map();
  async initialize() {
    if (this.QuickJS == null) {
      const { getQuickJS } = await import('quickjs-emscripten');
      const QuickJS = this.QuickJS = await getQuickJS();
      const runtime = this.runtime = QuickJS.newRuntime();
      runtime.setMemoryLimit(1024 * 640);
      runtime.setMaxStackSize(1024 * 320);
      runtime.setModuleLoader((name) => this.funcs.get(name));
    }
  }
  /**
   * 
   * @param {string} name 
   * @param {string[]} params 
   * @param {string} body 
   */
  setFunction(name, params, body) {
    this.funcs.set(name, `export default function(${params.join(",")}) {\n${body}\n};`);
  }
  /**
   * @param {string} name 
   */
  getFunction(name) {
    return this.funcs.get(name);
  }
  /**
   * 
   * @param {string} name 
   * @param {any[]} args 
   * @returns 
   */
  callFunction(name, ...args) {
    if (!this.runtime) {
      throw new Error("Runtime not initialized");
    }

    const context = this.runtime.newContext();

    const argsHandle = context.newArray();
    args.forEach((arg, i) => {
      switch (typeof arg) {
        case "string":
          {
            const handle = context.newString(arg);
            context.setProp(argsHandle, String(i), handle);
            handle.dispose();
          }
          break;
        case "number":
          {
            const handle = context.newNumber(arg);
            context.setProp(argsHandle, String(i), handle);
            handle.dispose();
          }
          break;
        case "boolean":
          if (arg)
            context.setProp(argsHandle, String(i), context.true);
          else
            context.setProp(argsHandle, String(i), context.false);
          break;
        case "object":
          if (arg == null) {
            context.setProp(argsHandle, String(i), context.null);
          }
          throw new Error("Unsupported argument type");
        default:
          throw new Error("Unsupported argument type");
      }
    })
    context.setProp(context.global, "args", argsHandle);
    argsHandle.dispose();

    const evalResult = context.evalCode(`import func from ${JSON.stringify(name)};`
      + `globalThis.result = func.apply(null, globalThis.args);`);
    if (evalResult.error) {
      const error = evalResult.error.consume(context.dump);
      context.dispose();
      throw new Error(error);
    }
    context.unwrapResult(evalResult).dispose();
    const value = context.getProp(context.global, "result").consume(context.dump);
    context.dispose();
    return value;
  }
}

/** @type {JSRuntime | undefined} */
let rt

export async function getJSRuntime() {
  if (rt == null) {
    rt = new JSRuntime();
    await rt.initialize();
  }
  return rt;
}
