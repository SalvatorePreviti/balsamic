/* eslint-disable no-console */

const ansis = require("ansis");
const manifest = require("../../package.json");

const _formatArg = (arg) => {
  if (arg instanceof Error && arg.showStack === false) {
    const name = arg.name || "Error";
    return name && name !== "Error"
      ? `${ansis.yellowBright.underline(name)}: ${ansis.yellow(arg.message)}`
      : ansis.yellow(arg.message);
  }
  return arg;
};

exports.log = console.log.bind(console);

exports.banner = (...args) => {
  console.log();
  exports.info(`${manifest.name} v${manifest.version}`, ...args);
  console.log();
};

exports.footer = (...args) => {
  console.log();
  exports.info(...args);
  console.log();
};

exports.error = (...args) => {
  console.error(ansis.redBright(`${ansis.underline("ERROR")}:`), ...args.map(_formatArg));
};

exports.warn = (...args) => {
  console.warn(ansis.yellowBright(`${ansis.underline("WARN")}:`), ...args.map(_formatArg));
};

exports.info = (...args) => {
  console.info(ansis.blueBright(`${ansis.underline("INFO")}:`), ...args.map(_formatArg));
};

exports.skip = (...args) => {
  console.info(
    ansis.yellow("-"),
    ...args.map((x) => {
      const s = _formatArg(x);
      return typeof s === "string" ? ansis.yellow(s) : s;
    }),
  );
};

exports.progress = (...args) => {
  console.info(
    ansis.cyanBright("+"),
    ...args.map((x) => {
      const s = _formatArg(x);
      return typeof s === "string" ? ansis.cyan(s) : s;
    }),
  );
};

exports.handleUncaughtError = (error) => {
  if (!process.exitCode) {
    process.exitCode = 1;
  }
  console.error();
  exports.error(error);
  console.error();
};

exports.askConfirmation = async function askConfirmation(message, defaultValue = true) {
  if (!process.stdin || !process.stdout || !process.stdout.isTTY) {
    return true;
  }
  return new Promise((resolve) => {
    const rl = require("readline").createInterface(process.stdin, process.stdout);
    const question = `${ansis.greenBright("?")} ${ansis.whiteBright(message)} ${ansis.gray(
      defaultValue ? "(Y/n)" : "(N/y)",
    )} `;
    rl.question(question, (answer) => {
      rl.close();
      answer = (answer || "").trim();
      const confirm = /^[yY]/.test(answer || (defaultValue ? "Y" : "N"));
      console.log(confirm ? ansis.greenBright("  Yes") : ansis.redBright("  No"));
      console.log();
      resolve(confirm);
    });
  });
};
