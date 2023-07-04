/**
 * In NodeJS, this is the same as `util.inspect.custom`, see https://nodejs.org/api/util.html#utilinspectcustom
 * In browser, this is a symbol that is not defined by default, so we define it here.
 */
export const customInspectSymbol = Symbol.for("nodejs.util.inspect.custom");
