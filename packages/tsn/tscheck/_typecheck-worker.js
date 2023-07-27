/* eslint-disable no-console */
// This runs in a worker thread, analysing a single ts project

const { workerData, parentPort } = require("worker_threads");

const ts = require("typescript");

const { appRootPath, projects } = workerData;

const formatHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => appRootPath,
  getNewLine: () => "\n",
};

let errors = 0;
let warnings = 0;

const typecheckProject = (project) => {
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

if (parentPort) {
  parentPort.postMessage({ errors, warnings });
}
