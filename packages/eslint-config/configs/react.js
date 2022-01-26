"use strict";

module.exports = {
  extends: ["plugin:react/recommended", "plugin:react-hooks/recommended"],
  rules: {
    "react/jsx-filename-extension": [2, { extensions: [".tsx", ".jsx"] }],
    "react/react-in-jsx-scope": 0,
    "react/display-name": 0,
    "react/jsx-child-element-spacing": 0,
    "react/jsx-closing-bracket-location": 0,
    "react/jsx-closing-tag-location": 0,
    "react/jsx-curly-newline": 0,
    "react/jsx-curly-spacing": 0,
    "react/jsx-equals-spacing": 0,
    "react/jsx-first-prop-new-line": 0,
    "react/jsx-indent": 0,
    "react/jsx-indent-props": 0,
    "react/jsx-max-props-per-line": 0,
    "react/jsx-one-expression-per-line": 0,
    "react/jsx-props-no-multi-spaces": 0,
    "react/require-default-props": 0,
    "react/jsx-tag-spacing": 0,
    "react/jsx-wrap-multilines": 0,
    "react/forbid-foreign-prop-types": [1, { allowInPropTypes: true }],
    "react/jsx-pascal-case": [1, { allowAllCaps: true, ignore: [] }],
    "react/no-typos": 2,
    "react/style-prop-object": 1,
    "react-hooks/exhaustive-deps": 1,
    "react-hooks/rules-of-hooks": 2,
    "react/no-array-index-key": 0,
    "react/jsx-props-no-spreading": 0,
    "react/self-closing-comp": [1, { component: true, html: true }],
  },
  settings: {
    react: { version: _getReactVersion() },
  },
};

function _getReactVersion() {
  try {
    // eslint-disable-next-line global-require
    return require("react/package.json").version;
  } catch (_) {
    return "latest";
  }
}
