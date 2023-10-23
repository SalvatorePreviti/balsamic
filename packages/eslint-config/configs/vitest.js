"use strict";

const recommended = require("eslint-plugin-vitest").configs.recommended;

module.exports = {
  plugins: ["vitest"],
  rules: {
    ...Object.fromEntries(
      Object.entries(recommended.rules).map(([key, value]) => [key, value === "error" ? 1 : value]),
    ),
    "vitest/valid-expect": [1, { maxArgs: 2 }],
  },
  env: { ...recommended.env },
};
