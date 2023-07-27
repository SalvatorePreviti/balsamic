import { devEnv } from "./dev-env";

import type { UnsafeAny } from "./types";

const tsn = (global as UnsafeAny)[Symbol.for("@balsamic/tsn")];

import type Chalk from "chalk";

export let colors: Chalk;

export type colors = Chalk.Chalk;

if (tsn) {
  colors = tsn.colors;
  Object.defineProperty(exports, "colors_disabled", {
    get: () => tsn.colors_disabled,
    configurable: true,
    enumerable: true,
  });
}

if (!colors!) {
  colors = require("chalk");
  colors.level = devEnv.colorsLevel;
  let _colors_disabled: Chalk.Chalk | undefined;
  Object.defineProperty(exports, "colors_disabled", {
    get: () => _colors_disabled || (_colors_disabled = new colors.Instance({ level: 0 })),
    configurable: true,
    enumerable: true,
  });
}

/** An instance of colors that is always disabled. */
export declare const colors_disabled: Chalk.Chalk;

export type TermBasicColor =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "blackBright"
  | "redBright"
  | "greenBright"
  | "yellowBright"
  | "blueBright"
  | "magentaBright"
  | "cyanBright"
  | "whiteBright";

export type TermColor = Chalk | TermBasicColor | "error" | "warning" | "info" | "debug" | "verbose" | "notice" | "box";

export type Chalk = Chalk.Chalk;

export function getColor(color: TermColor | null | undefined): Chalk {
  if (typeof color === "string") {
    switch (color) {
      case "error":
        return colors.redBright;
      case "warning":
        return colors.yellow;
      case "info":
        return colors.cyan;
      case "debug":
        return colors.blueBright;
      case "verbose":
        return colors.magenta;
      case "notice":
        return colors.rgb(120, 190, 255);
      case "box":
        return colors.rgb(50, 100, 200);
      default:
        color = colors[color];
    }
  }
  return typeof color === "function" ? color : colors_disabled;
}

let _strip_ansi_regex: RegExp | undefined;

/** Strips all the ANSI sequences from a string */
export function stripColors(text: string): string {
  return text.replace(
    _strip_ansi_regex ||
      (_strip_ansi_regex =
        /** Based on https://github.com/chalk/ansi-regex */
        /[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g),
    "",
  );
}
