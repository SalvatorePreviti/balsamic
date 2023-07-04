if (typeof require !== "undefined") {
  require("../init-ts-node");
  require(process.env._BALSAMIC_TS_WORKER_FILENAME);
} else {
  import("../init-ts-node.js").then(() => {
    import(process.env._BALSAMIC_TS_WORKER_FILENAME);
  });
}
