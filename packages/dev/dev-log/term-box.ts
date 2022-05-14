import type { TermColor } from "../colors";
import { stripColors } from "../colors";
import { devLog } from "./dev-log";
import type { DevLogStream } from "./dev-log-stream";

export namespace TermBox {
  export interface Options {
    minWidth?: number | undefined;
    maxWidth?: number | undefined;
    indent?: number;
    output?: DevLogStream | undefined;
    boxColor?: TermColor | undefined;
    padding?: number;
    style?: "single" | "double" | "rounded" | undefined;
  }
}

const hrSym = Symbol("hr");
const hr2Sym = Symbol("hr2");

export class TermBox {
  public options: TermBox.Options;
  public output: DevLogStream;
  private _rows: (string | symbol)[] = [];

  public get colors() {
    return this.output.colors;
  }

  public constructor(options: TermBox.Options | undefined = {}) {
    this.options = options;
    this.output = options.output || devLog;
  }

  public writeln(text: string | undefined = "") {
    this._rows.push(...`${text}`.split("\n"));
    return this;
  }

  public hr() {
    this._rows.push(hrSym);
    return this;
  }

  public hr2() {
    this._rows.push(hr2Sym);
    return this;
  }

  public toString(): string {
    let innerLen = 0;
    const rowLengths: number[] = [];

    const rows = this._rows;

    for (const row of rows) {
      if (typeof row === "string") {
        const rowLen = stripColors(row).length;
        rowLengths.push(rowLen);
        if (rowLen > innerLen) {
          innerLen = rowLen;
        }
      } else {
        rowLengths.push(0);
      }
    }

    const padding = this.options.padding ?? 1;

    innerLen += padding * 2;

    if (this.options.minWidth && innerLen < this.options.minWidth) {
      innerLen = this.options.minWidth;
    }

    let maxWidth = (this.output.isTerm ? this.output.stream.columns || 80 : 80) - 2;
    if (maxWidth < 10) {
      maxWidth = 10;
    }
    if (innerLen > maxWidth) {
      innerLen = maxWidth;
    }

    const chars = this.output.CHARS.BOX_CHARS[this.options.style || "single"];

    const boxColor = this.output.getColor(this.options.boxColor || "box");

    const paddingStr = " ".repeat(padding);

    const leftLine = boxColor(chars.left);
    const rightLine = `${boxColor(chars.right)}\n`;
    let hr1Line: string | undefined;
    let hr2Line: string | undefined;

    let result = `${boxColor(`${chars.topleft}${chars.top.repeat(innerLen)}${chars.topright}`)}\n`;

    let hrPending = 0;

    for (let i = 0; i < rows.length; ++i) {
      const row = rows[i];
      const rowLen = rowLengths[i]!;
      if (typeof row === "string") {
        if (hrPending) {
          if (hrPending === 1) {
            if (hr1Line === undefined) {
              hr1Line = boxColor(`${chars.hrleft}${chars.hr.repeat(innerLen)}${chars.hrright}`);
              hr1Line += "\n";
            }
            result += hr1Line;
          } else {
            if (hr2Line === undefined) {
              hr2Line = boxColor(`${chars.hr2left}${chars.hr2.repeat(innerLen)}${chars.hr2right}`);
              hr2Line += "\n";
            }
            result += hr2Line;
          }
          hrPending = 0;
        }

        result += leftLine;
        result += paddingStr;
        result += row;
        if (rowLen < innerLen - padding) {
          result += " ".repeat(innerLen - padding - rowLen);
        }
        result += rightLine;
      } else if (row === hrSym) {
        hrPending = 1;
      } else if (row === hr2Sym) {
        hrPending = 2;
      }
    }

    result += `${boxColor(`${chars.bottomleft}${chars.bottom.repeat(innerLen)}${chars.bottomright}`)}\n`;

    return result;
  }

  public print(): void {
    devLog.write(this.toString());
  }

  public static begin(options?: TermBox.Options): TermBox {
    return new TermBox(options);
  }
}
