Object.defineProperty(exports, "__esModule", { value: true, configurable: true });

let _fastGlob = module;

Object.defineProperty(exports, "glob", {
  get: () => {
    if (_fastGlob === module) {
      console.log("LOAD fast-glob");
      _fastGlob = require("fast-glob");
    }
    return _fastGlob;
  },
  set(v) {
    _fastGlob = v;
  },
  configurable: true,
  enumerable: true,
});

let _ajv = module;

Object.defineProperty(exports, "ajv", {
  get: () => {
    if (_ajv === module) {
      _ajv = require("ajv");
      Object.defineProperty(_ajv, "Ajv", {
        get() {
          return exports.ajv.default;
        },
        set(value) {
          exports.ajv.default = value;
        },
        configurable: true,
        enumerable: true,
      });
    }
    return _ajv;
  },
  set(v) {
    _ajv = v;
  },
  configurable: true,
  enumerable: true,
});

Object.defineProperty(exports, "Ajv", {
  get() {
    return exports.ajv.default;
  },
  set(value) {
    exports.ajv.default = value;
  },
  configurable: true,
  enumerable: true,
});

let _YAML = module;

Object.defineProperty(exports, "YAML", {
  get: () => {
    if (_YAML === module) {
      _YAML = require("./YAML");
    }
    return _YAML;
  },
  set(v) {
    _YAML = v;
  },
  configurable: true,
  enumerable: true,
});
