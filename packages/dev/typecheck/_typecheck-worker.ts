// This runs in a worker thread, analysing a single ts project

import type { CompilerOptions } from "typescript";
import ts from "typescript";
import { workerData, parentPort } from "worker_threads";

export interface Project {
  tsconfigPath: string;
  options: CompilerOptions;
  files: string[];
}

export interface Input {
  appRootPath: string;
  projects: Project[];
}

export interface Output {
  errors: number;
  warnings: number;
}

const { appRootPath, projects } = workerData as Input;

const formatHost = {
  getCanonicalFileName: (fileName: string): string => fileName,
  getCurrentDirectory: (): string => appRootPath,
  getNewLine: (): string => "\n",
};

let errors = 0;
let warnings = 0;

const typecheckProject = (project: Project): void => {
  const files = Array.from(project.files);
  const program = ts.createProgram(files, project.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost);
  if (message) {
    console.log(message);
  }

  for (const diagnostic of diagnostics) {
    if (diagnostic.category === ts.DiagnosticCategory.Error) {
      ++errors;
    } else if (diagnostic.category === ts.DiagnosticCategory.Warning) {
      ++warnings;
    }
  }
};

for (const project of projects) {
  typecheckProject(project);
}

parentPort?.postMessage({ errors, warnings } satisfies Output);
