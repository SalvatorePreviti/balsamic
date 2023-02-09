Object.defineProperty(exports, "__esModule", { value: true, configurable: true });

let _fastGlob = module;

Object.defineProperty(exports, "glob", {
  get() {
    if (_fastGlob === module) {
      _fastGlob = require("fast-glob");
    }
    return _fastGlob;
  },
  configurable: true,
  enumerable: true,
});

let _ajv = module;

Object.defineProperty(exports, "ajv", {
  get() {
    if (_ajv === module) {
      _ajv = require("ajv");
      Object.defineProperty(_ajv, "Ajv", {
        get() {
          return exports.ajv.default;
        },
        configurable: true,
        enumerable: true,
      });
    }
    return _ajv;
  },
  configurable: true,
  enumerable: true,
});

Object.defineProperty(exports, "Ajv", {
  get() {
    return exports.ajv.default;
  },
  configurable: true,
  enumerable: true,
});

let _YAML = module;

Object.defineProperty(exports, "YAML", {
  get() {
    if (_YAML === module) {
      _YAML = require("./YAML");
    }
    return _YAML;
  },
  configurable: true,
  enumerable: true,
});
