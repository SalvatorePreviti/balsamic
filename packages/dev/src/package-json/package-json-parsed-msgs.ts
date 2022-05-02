import util from "node:util";
import { devLog } from "../dev-log";

const util_inspect_custom = util.inspect.custom;

export namespace PackageJsonParseMessage {
  export type Severity = "error" | "warning" | "info";
}

export class PackageJsonParseMessage {
  public constructor(
    public severity: PackageJsonParseMessage.Severity,
    public message: string,
    public field?: string | undefined,
  ) {}

  public toString(): string {
    const { severity, message, field } = this;
    return `${severity}: ${field ? `[${field}] ${message}` : message}`;
  }

  public toFormattedString(colors: boolean = false): string {
    const { severity, message, field } = this;
    if (colors) {
      return `${devLog.getColor(severity).underline(severity)}: ${
        field ? devLog.colors.cyan(`[${field}] `) : ""
      }${message}`;
    }
    return `${severity}: ${field ? `[${field}] ` : ""}${message}`;
  }

  public [util_inspect_custom](_depth?: unknown, inspectOptions?: util.InspectOptions): string {
    return this.toFormattedString(inspectOptions?.colors);
  }
}

export class PackageJsonParseMessages {
  public errors: PackageJsonParseMessage[] = [];
  public warnings: PackageJsonParseMessage[] = [];
  public informations: PackageJsonParseMessage[] = [];
  public fieldsWithErrors = new Set<string>();

  public get hasErrors(): boolean {
    return this.errors.length > 0;
  }

  public get hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  public get hasWarningsOrErrors(): boolean {
    return this.hasErrors || this.hasWarnings;
  }

  public get maxSeverity(): PackageJsonParseMessage.Severity | null {
    return this.hasErrors ? "error" : this.hasWarnings ? "warning" : this.informations.length > 0 ? "info" : null;
  }

  public add(err: undefined | null): void;

  public add(err: PackageJsonParseMessage | Error | string | undefined, field?: string): void;

  public add(severity: PackageJsonParseMessage.Severity, message: string, field?: string | undefined): void;

  public add(
    err: PackageJsonParseMessage.Severity | PackageJsonParseMessage | Error | string | undefined | null,
    message?: string,
    field?: string | undefined | null,
  ): void {
    if (err instanceof Error) {
      message = err.message || "Invalid package.json";
      err = "error";
    }
    let severity: PackageJsonParseMessage.Severity = "error";
    if (!(err instanceof PackageJsonParseMessage)) {
      if (err === undefined || err === null) {
        return;
      }
      if (err === "error" || err === "warning" || err === "info") {
        severity = err;
      } else if (typeof err === "string") {
        field = message;
        message = err;
      }
      err = new PackageJsonParseMessage(severity, message || "Invalid package.json", field || undefined);
    }
    if (err.field) {
      if (this.fieldsWithErrors.has(err.field)) {
        return;
      }
      if (err.severity === "error" && !err.field.endsWith("ependencies") && err.field !== "workspaces") {
        this.fieldsWithErrors.add(err.field);
      }
    } else if (err.message === "Invalid package.json" && this.errors.length !== 0) {
      return;
    }
    if (err.field || err.message) {
      const errField = err.field;
      const errMsg = err.message;
      const hasErr = (e: PackageJsonParseMessage) => e.field === errField && e.message === errMsg;
      const found = this.errors.find(hasErr) || this.warnings.find(hasErr) || this.informations.find(hasErr);
      if (found) {
        if (found.severity === err.severity) {
          return;
        }
        switch (found.severity) {
          case "info":
            this.informations.splice(this.informations.indexOf(found), 1);
            break;
          case "warning":
            if (err.severity === "info") {
              return;
            }
            this.warnings.splice(this.informations.indexOf(found), 1);
            break;
          case "error":
            return;
        }
        found.severity = err.severity;
      }
      switch (err.severity) {
        case "info":
          this.informations.push(err);
          break;
        case "warning":
          this.warnings.push(err);
          break;
        default:
          this.errors.push(err);
          break;
      }
    }
  }

  public clear() {
    this.errors.length = 0;
    this.warnings.length = 0;
    this.informations.length = 0;
    this.fieldsWithErrors.clear();
  }

  public getMessages(severity: PackageJsonParseMessage.Severity): PackageJsonParseMessage[] {
    switch (severity) {
      case "error":
        return [...this.errors];
      case "info":
        return [...this.errors, ...this.warnings, ...this.informations];
    }
    return [...this.errors, ...this.warnings];
  }

  public toFormattedString({
    colors = false,
    severity = "warning",
    indent = "",
  }: {
    colors?: boolean | undefined;
    severity?: PackageJsonParseMessage.Severity | undefined;
    indent?: string | undefined;
  } = {}): string {
    let result = "";
    for (const msg of this.getMessages(severity)) {
      result += `${indent}${msg.toFormattedString(colors)}\n`;
    }
    return result;
  }

  public [util_inspect_custom](_depth?: unknown, inspectOptions?: util.InspectOptions): string {
    return this.toFormattedString({ colors: inspectOptions?.colors });
  }
}