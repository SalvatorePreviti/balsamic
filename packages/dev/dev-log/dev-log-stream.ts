import util from "node:util";
import type { Chalk, TermColor } from "../colors";
import { colors as _colors, colors_disabled as _colors_disabled, getColor as _getColor } from "../colors";
import type { DevEnv } from "../dev-env";
import { devEnv, isCI } from "../dev-env";
import { numberFixedString } from "../utils/number-fixed";
import { TERM_CHARS } from "./term-chars";
import { bindProtoFunctions } from "../plain-objects";
import { devError } from "../dev-error";

export class DevLogStream {
  public readonly stream: NodeJS.WriteStream;

  public colors: Chalk;

  public maxHrWidth = 250;

  public CHARS = TERM_CHARS;

  public dev: (...args: unknown[]) => void;

  private _isTerm?: boolean | undefined;

  public constructor(stream: NodeJS.WriteStream, colors: Chalk | boolean) {
    this.stream = stream;
    this.colors = colors === true ? _colors : colors === false ? _colors_disabled : colors;
    bindProtoFunctions(this, {
      allowPrivate: false,
      enumerable: true,
      ignoreSet: new Set(["inspect", "inspectArgs", "colors"]),
    });

    /** Developer debug log. Appends the line where this function was called. */
    const dev = (...args: unknown[]): void => {
      const oldStackTraceLimit = Error.stackTraceLimit;
      const err: { stack?: string | undefined } = {};
      Error.stackTraceLimit = 1;
      try {
        Error.captureStackTrace(err, dev);
      } finally {
        Error.stackTraceLimit = oldStackTraceLimit;
      }
      let devLine = "";
      const stack = err.stack;
      if (typeof stack === "string") {
        for (const line of stack.split("\n")) {
          if (line.startsWith("    at")) {
            devLine = line.trim();
            break;
          }
        }
      }
      this.writeln(
        this.colors.blueBright(this.inspectArgs(args.length > 0 ? args : [""], `${this.colors.underline("DEV")}: `)) +
          (devLine ? `\n     ${this.colors.blackBright(devLine)}` : ""),
      );
    };

    this.dev = dev;

    this._isTerm = this.isTerm;
  }

  public get isTerm(): boolean {
    return this._isTerm ?? (this.colors.level >= 2 && !isCI() && this.stream.isTTY);
  }

  public set isTerm(value: boolean | undefined) {
    this._isTerm = value;
  }

  public getColor(color: TermColor | null | undefined): _colors.Chalk {
    return this.colors.level > 0 ? _getColor(color) : _colors_disabled;
  }

  /** Clears the screen */
  public clearScreen(dir: "down" | "full" | boolean | undefined): void {
    if (this.isTerm) {
      if (dir === "down") {
        this.stream.clearScreenDown();
      } else {
        this.stream.write(dir === true || dir === "full" ? "\x1b[2J" : "\x1b[0f");
      }
    } else {
      this.writeln();
    }
  }

  /** Clears the current line in direction identified by `direction`. */
  public clearLine(direction: -1 | 0 | 1): void {
    if (this.isTerm) {
      this.stream.clearLine(direction);
    }
  }

  public log(...args: unknown[]): void {
    this.writeln(this.inspectArgs(args, ""));
  }

  public logBlack(...args: unknown[]): void {
    this.writeln(this.colors.black(this.inspectArgs(args, "")));
  }

  public logRed(...args: unknown[]): void {
    this.writeln(this.colors.red(this.inspectArgs(args, "")));
  }

  public logGreen(...args: unknown[]): void {
    this.writeln(this.colors.green(this.inspectArgs(args, "")));
  }

  public logYellow(...args: unknown[]): void {
    this.writeln(this.colors.yellow(this.inspectArgs(args, "")));
  }

  public logBlue(...args: unknown[]): void {
    this.writeln(this.colors.blue(this.inspectArgs(args, "")));
  }

  public logMagenta(...args: unknown[]): void {
    this.writeln(this.colors.magenta(this.inspectArgs(args, "")));
  }

  public logCyan(...args: unknown[]): void {
    this.writeln(this.colors.cyan(this.inspectArgs(args, "")));
  }

  public logWhite(...args: unknown[]): void {
    this.writeln(this.colors.white(this.inspectArgs(args, "")));
  }

  public logBlackBright(...args: unknown[]): void {
    this.writeln(this.colors.blackBright(this.inspectArgs(args, "")));
  }

  public logRedBright(...args: unknown[]): void {
    this.writeln(this.colors.redBright(this.inspectArgs(args, "")));
  }

  public logGreenBright(...args: unknown[]): void {
    this.writeln(this.colors.greenBright(this.inspectArgs(args, "")));
  }

  public logYellowBright(...args: unknown[]): void {
    this.writeln(this.colors.yellowBright(this.inspectArgs(args, "")));
  }

  public logBlueBright(...args: unknown[]): void {
    this.writeln(this.colors.blueBright(this.inspectArgs(args, "")));
  }

  public logMagentaBright(...args: unknown[]): void {
    this.writeln(this.colors.magentaBright(this.inspectArgs(args, "")));
  }

  public logCyanBright(...args: unknown[]): void {
    this.writeln(this.colors.cyanBright(this.inspectArgs(args, "")));
  }

  public logWhiteBright(...args: unknown[]): void {
    this.writeln(this.colors.whiteBright(this.inspectArgs(args, "")));
  }

  public logColor(color: TermColor, ...args: unknown[]): void {
    this.writeln(this.getColor(color)(this.inspectArgs(args, "")));
  }

  /** Prints an horizontal line */
  public hr(color?: TermColor | undefined, char?: string | undefined): void;

  public hr(options: { color?: TermColor | undefined; char?: string | undefined; width?: number | undefined }): void;

  public hr(
    options?:
      | { color?: TermColor | undefined; char?: string | undefined; width?: number | undefined }
      | TermColor
      | undefined,
    char?: string | undefined,
  ): void {
    if (!this.isTerm) {
      this.writeln("-".repeat(10));
      return;
    }

    let width: number | undefined;
    let color: TermColor | undefined;

    if (typeof options === "object" && options !== null) {
      color = options.color;
      char = options.char;
      width = options.width;
    } else {
      color = options;
    }

    if (char === undefined) {
      char = "─";
    }
    if (width === undefined || width > this.maxHrWidth) {
      width = this.maxHrWidth;
    }

    let columns = this.stream.columns;
    if (columns < 10) {
      columns = 10;
    } else if (columns > width) {
      columns = width;
    }

    this.writeln(this.getColor(color)(char.repeat(columns)));
  }

  public capacityBar({
    value,
    min = 0,
    max = 1,
    width = 80,
    label = "",
  }: {
    value: number;
    min?: number | undefined;
    max?: number | undefined;
    width?: number | undefined;
    label?: string | false | undefined;
  }): void {
    label = label ? `${label} ` : "";
    const columns = this.isTerm ? this.stream.columns : 0;
    let s = label ? this.getColor("info")(label) : "";

    s += this.colors.blueBright(`[`);

    let nv = (value - min) / max;
    if (!nv) {
      nv = 0;
    }

    const svalue = numberFixedString(nv * 100, { decimalDigits: 1, padStart: 7, postix: "%" });

    const barWidth = Math.min(Math.max(5, Math.min(columns, width) - svalue.length - 3 - label.length), 200);

    for (let i = 0; i < barWidth; ++i) {
      const kv = i / (barWidth - 1);
      s += this._rgbColorFromValue(kv)(kv <= nv ? "▰" : "𑁉");
    }

    s += `${this.colors.blueBright("] ")}`;
    s += this._rgbColorFromValue(nv)(svalue);
    this.writeln(s);
  }

  public greetings(title: string = "GREETINGS PROFESSOR FALKEN."): void {
    this.hr(this.colors.rgb(115, 100, 255));
    this.writeln(this.colors.rgb(80, 220, 255).bold(title));
    this.hr(this.colors.rgb(115, 100, 255));
    this.writeln();
  }

  public write(text: string): void {
    if (text.length !== 0) {
      try {
        this.stream.write(text);
      } catch {}
    }
  }

  public writeln(text: string = ""): void {
    this.write(`${text}\n`);
  }

  private _rgbColorFromValue(value: number): _colors.Chalk {
    const g = Math.max(0, Math.min(190, 245 - Math.floor(value * 255) + 40));
    const r = Math.max(0, Math.min(255, Math.round(value * 255 + 110)));
    return this.colors.rgb(r, g, 35);
  }

  public inspectArgs(args: unknown[], prefix: string = ""): string {
    if (args.length === 0) {
      return "";
    }
    let result = prefix;
    for (let i = 0, len = args.length; i < len; ++i) {
      if (i !== 0) {
        result += " ";
      }
      const what = args[i];
      if (typeof what === "string") {
        if (i === 0 && prefix) {
          const newLines = what.match(/^\n+/g);
          if (newLines) {
            const nl = newLines[0] || "";
            result = nl + prefix + what.slice(nl.length);
          } else {
            result += what;
          }
        } else {
          result += what;
        }
      } else {
        result += this.inspect(what);
      }
    }
    return result;
  }

  public inspect(what: unknown): string {
    if (what instanceof Error) {
      if (what.showStack === false) {
        return `${what}`;
      }
      what = devError(what, this.inspect);
    }
    return util.inspect(what, this.getInspectOptions());
  }

  public getInspectOptions(): DevEnv.InspectOptions {
    return { ...devEnv.inspectOptions, colors: this.colors.level > 0 };
  }
}
