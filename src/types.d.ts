interface ErqNodeJsModuleContext {
  defineTable(name: string, table: ErqNodeJsModuleContext.DefineTableOptions): void;
  defineFunction<X extends any[], Y>(name: string, options: ErqNodeJsModuleContext.DefineFunctionOptions, func: (...args: X) => Y): void;
  defineAggregate<X, Y, Z>(name: string, options: ErqNodeJsModuleContext.DefineAggregateOptions<X, Y, Z>): void;
  registerModule(name: string, importModule: () => Promise<{ default: ErqModule }>): void;
}

namespace ErqNodeJsModuleContext {
  type DefineTableOptions = Parameters<import("better-sqlite3").Database["table"]>[1];
  type DefineFunctionOptions = Parameters<import("better-sqlite3").Database["function"]>[1];
  type DefineAggregateOptions<X, Y, Z> = DefineFunctionOptions & {
    start?: Z | (() => Z);
    step: (total: Z, next: X) => void;
    inverse?: (total: Z, dropped: X) => void;
    result?: (total: Z) => Y;
  };
}

interface ErqModule {
  get moduleName(): string;
  load(options: ErqModule.LoadOptions): Promise<void>;
}

namespace ErqModule {
  interface LoadOptions {
    readonly context: ModuleContext;
    readonly modulePrefix: string;
  }
}
