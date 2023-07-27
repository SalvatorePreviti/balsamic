import Module from "module";

const { tsn } = Module.createRequire(import.meta.url)("./index.js");

export { tsn };

export * from "ts-node/esm.mjs";
