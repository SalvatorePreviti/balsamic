export declare function getTsPatterns(args: {
  workspaceDirectories?: string[] | boolean
  input?: string[]
  cwd?: string
}): Promise<string[]>

export declare function getWorkspaceDirectories(cwd?: string): string[]

export declare function getTsFiles(params: { patterns: string[]; cwd?: string }): Promise<string[]>

export declare function compileDtsFiles(params: { files: string[]; cwd?: string }): Promise<boolean>

export declare function compileSourceFiles(params: {
  mjs?: boolean
  cjs?: boolean
  sourcemap?: boolean | 'inline' | 'external' | 'both'
  files: string[]
  cwd?: string
}): Promise<boolean>

export declare function esrunBuildMain(args?: string, cwd?: string): Promise<boolean>
