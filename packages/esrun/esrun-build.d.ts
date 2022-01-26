export declare function compileDtsFiles(params: { files: string[]; cwd?: string }): Promise<boolean>;

export declare function compileSourceFiles(params: {
  outbase?: string;
  outdir?: string;
  mjs?: boolean;
  cjs?: boolean;
  sourcemap?: boolean | "inline" | "external" | "both";
  baner_mjs?: string[];
  baner_cjs?: string[];
  files: string[];
  cwd?: string;
}): Promise<boolean>;

export declare function esrunBuildMain(args?: string, cwd?: string): Promise<boolean>;
