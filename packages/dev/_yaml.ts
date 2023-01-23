/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  CreateNodeOptions,
  DocumentOptions,
  ParseOptions,
  SchemaOptions,
  ToJSOptions,
  ToStringOptions,
} from "yaml";

import { parse } from "yaml";

import fs from "fs";

export * from "yaml";

export { CreateNodeOptions, DocumentOptions, ParseOptions, SchemaOptions, ToJSOptions, ToStringOptions };

export type Reviver = (key: unknown, value: unknown) => unknown;

export type YamlParseOptions = ParseOptions & DocumentOptions & SchemaOptions & ToJSOptions;

export type YamlStringifyOptions = DocumentOptions & SchemaOptions & ParseOptions & CreateNodeOptions & ToStringOptions;

function stripBOM(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function readFile(filePath: string, reviver: Reviver, options?: YamlParseOptions): Promise<any>;

export function readFile(filePath: string, options?: YamlParseOptions): Promise<any>;

export async function readFile(filePath: string, reviver?: any, options?: any): Promise<any> {
  return parse(stripBOM(await fs.promises.readFile(filePath, "utf8")), reviver, options);
}

export function try_readFile(filePath: string, reviver: Reviver, options?: YamlParseOptions): Promise<any | undefined>;

export function try_readFile(filePath: string, options?: YamlParseOptions): Promise<any | undefined>;

export async function try_readFile(filePath: string, reviver?: any, options?: any): Promise<any | undefined> {
  try {
    return parse(stripBOM(await fs.promises.readFile(filePath, "utf8")), reviver, options);
  } catch (_) {
    return undefined;
  }
}

export function readFileSync(filePath: string, reviver: Reviver, options?: YamlParseOptions): any;

export function readFileSync(filePath: string, options?: YamlParseOptions): any;

export function readFileSync(filePath: string, reviver?: any, options?: any): any {
  return parse(stripBOM(fs.readFileSync(filePath, "utf8")), reviver, options);
}

export function try_readFileSync(filePath: string, reviver: Reviver, options?: YamlParseOptions): any;

export function try_readFileSync(filePath: string, options?: YamlParseOptions): any;

export function try_readFileSync(filePath: string, reviver?: any, options?: any): any {
  try {
    return parse(stripBOM(fs.readFileSync(filePath, "utf8")), reviver, options);
  } catch (_) {
    return undefined;
  }
}
