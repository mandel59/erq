export class JSRuntimeError extends Error {
  /** @type {string | undefined} */
  runtimeStack;
  get name() {
    return this.constructor.name;
  }
  constructor(message, errorName, options) {
    super(errorName ? `${errorName}: ${message}` : message || "Unknown error");
    if (options?.stack) {
      this.runtimeStack = options.stack;
    }
  }
}

/**
 * @param {import("quickjs-emscripten").QuickJSContext} context
 * @param {import("quickjs-emscripten").QuickJSHandle} handle
 * @returns {any}
 */
function dump(context, handle) {
  // @ts-ignore
  const ptr = context.ffi.QTS_GetArrayBuffer(context.ctx.value, handle.value)
  if (ptr) {
    return Buffer.copyBytesFrom(context.getArrayBuffer(handle).value)
  }
  return context.dump(handle)
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
  /**
   * @param {import("quickjs-emscripten").QuickJSContext} context 
   */
  _registerUtilFunctions(context) {
    const { error } = console
    context.newFunction("error", (...args) => {
      error(...args.map(handle => dump(context, handle)))
    }).consume(errorHandle => {
      context.newObject().consume(consoleHandle => {
        context.setProp(consoleHandle, "error", errorHandle)
        context.setProp(context.global, "console", consoleHandle)
      })
    })
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
      this._registerUtilFunctions(this.context)
      for (const [func, jsFunction] of this.funcs.entries()) {
        this._registerFunction(this.context, func, jsFunction);
      }
    }
    return this.context;
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

    const argHandles = [];
    const deferDispose = [];
    args.forEach((arg, i) => {
      switch (typeof arg) {
        case "string":
          argHandles.push(context.newString(arg));
          deferDispose.push(true);
          break;
        case "number":
          argHandles.push(context.newNumber(arg));
          deferDispose.push(true);
          break;
        case "boolean":
          if (arg) argHandles.push(context.true);
          else argHandles.push(context.false);
          deferDispose.push(false);
          break;
        case "object":
          if (arg == null) {
            argHandles.push(context.null);
            deferDispose.push(false);
            break;
          }
          if (Buffer.isBuffer(arg)) {
            argHandles.push(context.newArrayBuffer(arg));
            deferDispose.push(true);
            break;
          }
          throw new JSRuntimeError("Unsupported argument type");
        default:
          throw new JSRuntimeError("Unsupported argument type");
      }
    });

    const fnHandle = context.getProp(context.global, name);
    const evalResult = context.callFunction(fnHandle, context.global, ...argHandles);
    fnHandle.dispose();
    for (let i = 0; i < argHandles.length; i++) {
      if (deferDispose[i]) {
        argHandles[i].dispose();
      }
    }

    if (evalResult.error) {
      this._throwError(context, evalResult);
    }
    const value = context.unwrapResult(evalResult).consume(handle => {
      return dump(context, handle)
    });
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

    const argHandles = [];
    const deferDispose = [];
    args.forEach((arg, i) => {
      switch (typeof arg) {
        case "string":
          argHandles.push(context.newString(arg));
          deferDispose.push(true);
          break;
        case "number":
          argHandles.push(context.newNumber(arg));
          deferDispose.push(true);
          break;
        case "boolean":
          if (arg) argHandles.push(context.true);
          else argHandles.push(context.false);
          deferDispose.push(false);
          break;
        case "object":
          if (arg == null) {
            argHandles.push(context.null);
            deferDispose.push(false);
            break;
          }
          throw new JSRuntimeError("Unsupported argument type");
        default:
          throw new JSRuntimeError("Unsupported argument type");
      }
    });

    const fnHandle = context.getProp(context.global, name);
    const evalResult = context.callFunction(fnHandle, context.global, ...argHandles);
    fnHandle.dispose();
    for (let i = 0; i < argHandles.length; i++) {
      if (deferDispose[i]) {
        argHandles[i].dispose();
      }
    }

    if (evalResult.error) {
      this._throwError(context, evalResult);
    }
    const iterator = context.unwrapResult(evalResult);
    while (true) {
      const result = context.getProp(iterator, "next")
        .consume(next => context.callFunction(next, iterator));
      if (result.error) {
        iterator.dispose();
        this._throwError(context, result);
      }
      const resultObject = context.unwrapResult(result);
      const done = context.getProp(resultObject, "done").consume(context.dump);
      if (done) {
        resultObject.dispose();
        iterator.dispose();
        break;
      }
      const value = context.getProp(resultObject, "value").consume(handle => {
        return dump(context, handle)
      });
      yield value
      resultObject.dispose();
    }
  }
  _throwError(context, evalResult) {
    const error = evalResult.error.consume(context.dump);
    if (error != null && typeof error === "object" && "message" in error) {
      const stack = error?.stack;
      throw new JSRuntimeError(error.message, error.name, { stack });
    } else {
      throw new JSRuntimeError(String(error));
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
