/**
 * 
 * @param {string} moduleName 
 * @param {(context: ErqNodeJsModuleContext) => Promise<void>} moduleAsyncFunction 
 * @return {ErqModule}
 */
export function createErqNodeJsModule(moduleName, moduleAsyncFunction) {
  /** @type {Array<(options: ErqModule.LoadOptions) => void> | undefined} */
  let cachedLoaders = undefined;
  return {
    get moduleName() { return moduleName; },
    async load(options) {
      if (cachedLoaders == null) {
        const loaders = [];
        await moduleAsyncFunction({
          defineTable(name, options) {
            loaders.push(({ context, modulePrefix }) => {
              context.defineTable(`${modulePrefix}${name}`, options);
            });
          },
          defineFunction(name, options, func) {
            loaders.push(({ context, modulePrefix }) => {
              context.defineFunction(`${modulePrefix}${name}`, options, func);
            });
          },
          defineAggregate(name, options) {
            loaders.push(({ context, modulePrefix }) => {
              context.defineAggregate(`${modulePrefix}${name}`, options);
            });
          },
          registerModule(name, importModule) {
            loaders.push(({ context, modulePrefix }) => {
              context.registerModule(`${modulePrefix}${name}`, importModule);
            });
          }
        });
        for (const loader of loaders) {
          loader(options);
        }
        cachedLoaders = loaders;
      } else {
        for (const loader of cachedLoaders) {
          loader(options);
        }
      }
    }
  }
}
