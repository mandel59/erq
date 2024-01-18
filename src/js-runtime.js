export class JSRuntimeError extends Error {
  get name() {
    return this.constructor.name;
  }
  constructor(message, errorName) {
    super(errorName ? `${errorName}: ${message}` : message);
  }
}

export class JSRuntime {
  /** @type {import("quickjs-emscripten").QuickJSWASMModule | undefined} */
  QuickJS;
  /** @type {import("quickjs-emscripten").QuickJSRuntime | undefined} */
  runtime;
  /** @type {import("quickjs-emscripten").QuickJSContext | undefined} */
  context;
  /** @type {Map<string, string>} */
  funcs = new Map();
  async initialize() {
    if (this.QuickJS == null) {
      const { getQuickJS } = await import('quickjs-emscripten');
      const QuickJS = this.QuickJS = await getQuickJS();
      const runtime = this.runtime = QuickJS.newRuntime();
      runtime.setMemoryLimit(1024 * 640);
      runtime.setMaxStackSize(1024 * 320);
    }
  }
  /**
   * 
   * @param {string} name 
   * @param {string[]} params 
   * @param {string} body 
   */
  setFunction(name, params, body) {
    const context = this.getContext();
    const jsFunction = `(function (${params.join(",")}) {\n${body}\n})`;
    this._registerFunction(context, name, jsFunction);
  }
  /**
   * 
   * @param {string} name 
   * @param {string[]} params 
   * @param {string} body 
   */
  setGeneratorFunction(name, params, body) {
    const context = this.getContext();
    const jsFunction = `(function *(${params.join(",")}) {\n${body}\n})`;
    this._registerFunction(context, name, jsFunction);
  }
  /**
   * 
   * @param {string} name 
   */
  removeFunction(name) {
    const context = this.getContext();
    this._unregisterFunction(context, name);
  }
  _registerFunction(context, name, jsFunction) {
    if (this.funcs.has(name)) {
      this._unregisterFunction(context, name);
    }
    if (context.unwrapResult(context.evalCode(`(${JSON.stringify(name)} in globalThis)`)).consume(context.dump)) {
      throw new JSRuntimeError(`Object ${JSON.stringify(name)} already exists`);
    }
    const evalResult = context.evalCode(`globalThis[${JSON.stringify(name)}] = ${jsFunction};`);
    if (evalResult.error) {
      this._throwError(context, evalResult);
    }
    context.unwrapResult(evalResult).dispose();
    this.funcs.set(name, jsFunction);
  }
  _unregisterFunction(context, name) {
    if (!this.funcs.has(name)) {
      throw new JSRuntimeError(`Function ${JSON.stringify(name)} does not exist`);
    }
    if (context.unwrapResult(context.evalCode(`(${JSON.stringify(name)} in globalThis)`)).consume(context.dump)) {
      const evalResult = context.evalCode(`delete globalThis[${JSON.stringify(name)}];`);
      if (evalResult.error) {
        this._throwError(context, evalResult);
      }
      context.unwrapResult(evalResult).dispose();
    }
    this.funcs.delete(name);
  }
  getContext() {
    if (!this.context) {
      if (!this.runtime) {
        throw new Error("Runtime not initialized");
      }
      this.context = this.runtime.newContext();
      for (const [func, jsFunction] of this.funcs.entries()) {
        this._registerFunction(this.context, func, jsFunction);
      }
    }
    return this.context;
  }
  resetContext() {
    if (this.context) {
      this.context.dispose();
      this.context = undefined;
    }
  }
  /**
   * 
   * @param {string} name 
   * @param {any[]} args 
   * @returns 
   */
  callFunction(name, ...args) {
    if (!this.runtime) {
      throw new JSRuntimeError("Runtime not initialized");
    }

    const context = this.getContext();

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
          throw new JSRuntimeError("Unsupported argument type");
        default:
          throw new JSRuntimeError("Unsupported argument type");
      }
    })
    context.setProp(context.global, "args", argsHandle);
    argsHandle.dispose();

    const evalResult = context.evalCode(`globalThis[${JSON.stringify(name)}].apply(null, globalThis.args);`);
    if (evalResult.error) {
      this._throwError(context, evalResult);
    }
    const value = context.unwrapResult(evalResult).consume(context.dump);
    return value;
  }
  /**
   * 
   * @param {string} name 
   * @param {any[]} args 
   * @returns 
   */
  *callGeneratorFunction(name, ...args) {
    if (!this.runtime) {
      throw new JSRuntimeError("Runtime not initialized");
    }

    const context = this.getContext();

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
          throw new JSRuntimeError("Unsupported argument type");
        default:
          throw new JSRuntimeError("Unsupported argument type");
      }
    })
    context.setProp(context.global, "args", argsHandle);
    argsHandle.dispose();

    const evalResult = context.evalCode(`globalThis[${JSON.stringify(name)}].apply(null, globalThis.args);`);
    if (evalResult.error) {
      this._throwError(context, evalResult);
    }
    const iterator = context.unwrapResult(evalResult);
    const next = context.getProp(iterator, "next");
    try {
      while (true) {
        const result = context.callFunction(next, iterator);
        if (result.error) {
          this._throwError(context, result);
        }
        const resultObject = context.unwrapResult(result);
        const done = context.getProp(resultObject, "done").consume(context.dump);
        if (done) {
          break;
        }
        yield context.getProp(resultObject, "value").consume(context.dump);
      }
    } finally {
      next.dispose();
      iterator.dispose();
    }
  }
  _throwError(context, evalResult) {
    const error = evalResult.error.consume(context.dump);
    this.resetContext();
    if (typeof error === "string") {
      throw new JSRuntimeError(error);
    } else if ("message" in error) {
      if ("name" in error) {
        throw new JSRuntimeError(`${error.name}: ${error.message}`);
      }
      throw new JSRuntimeError(error.message);
    }
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
