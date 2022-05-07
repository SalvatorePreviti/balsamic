import { devEnv } from "../dev-env";

import colors from "chalk";

const n = devEnv.hasColors();
if (n > colors.level) {
  colors.level = n;
}

/** An instance of colors that is always disabled. */
const colors_disabled = new colors.Instance({ level: 0 });

export { colors, colors_disabled };

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

export type TermColor = Chalk | TermBasicColor | "error" | "warning" | "info" | "debug" | "verbose";

export type Chalk = colors.Chalk;

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
    }
    color = colors[color];
  }
  return typeof color === "function" ? color : colors_disabled;
}
