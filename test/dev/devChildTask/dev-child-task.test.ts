import path from "node:path";
import { ChildProcess } from "node:child_process";
import { expect } from "chai";
import { AbortError, ChildProcessPromise, ChildProcessWrapper, devChildTask } from "@balsamic/dev";

describe("devChildTask", () => {
  let originalFolder: string;

  before(() => {
    originalFolder = process.cwd();
    process.chdir(path.resolve(__dirname, "package"));
  });

  after(() => {
    process.chdir(originalFolder);
  });

  describe("ChildProcessPromise.rejectProcessPromise", () => {
    it("returns a valid rejected promise", async () => {
      const promise = ChildProcessPromise.reject(new Error("xxx"));

      expect(promise.status).to.equal("rejected");
      expect(promise.isRunning).to.equal(false);
      expect(promise.isRejected).to.equal(true);
      expect(promise.isSettled).to.equal(true);
      expect(promise.isSucceeded).to.equal(false);

      expect(promise.childProcess).to.be.instanceOf(ChildProcess);

      let error: unknown;
      try {
        await promise;
      } catch (e) {
        error = e;
      }

      expect(error).to.be.instanceOf(Error);
      expect(promise.error).to.equal(error);
    });
  });

  describe("abort", () => {
    it("allows aborting before starting the child process", async () => {
      const controller = new AbortController();

      controller.abort();

      let fnCalled = false;
      const promise = new ChildProcessWrapper(
        () => {
          fnCalled = true;
          throw new Error("should not be called");
        },
        { timed: false, logError: false },
        controller.signal,
      ).promise();

      expect(fnCalled).to.equal(false);

      let error: unknown;
      try {
        await promise;
      } catch (e) {
        error = e;
      }

      expect(error).to.be.an.instanceOf(Error);
      expect(AbortError.isAbortError(error)).to.eq(true);
    });

    it("allows aborting without throwing", async () => {
      const controller = new AbortController();

      controller.abort();

      let fnCalled = false;
      const promise = new ChildProcessWrapper(
        () => {
          fnCalled = true;
          throw new Error("should not be called");
        },
        { timed: false, rejectOnAbort: false, logError: false },
        controller.signal,
      ).promise();

      expect(fnCalled).to.equal(false);

      await promise;
    });

    it("allows aborting", async function () {
      this.timeout(10000);

      const controller = new AbortController();

      const promise = devChildTask.fork(path.resolve(__dirname, "package/long-running.js"), [], {
        logError: false,
        timed: false,
        signal: controller.signal,
      });

      setTimeout(() => {
        controller.abort();
      }, 100).unref();

      let error: Error | undefined;
      try {
        await promise;
      } catch (e) {
        error = e as Error;
      }

      expect(error).to.be.instanceOf(Error);
      expect(error!.code).to.equal("ABORT_ERR");
    });

    it("allows aborting without raising errors", async () => {
      const controller = new AbortController();

      const promise = devChildTask.fork(path.resolve(__dirname, "package/long-running.js"), [], {
        logError: false,
        timed: false,
        signal: controller.signal,
        rejectOnAbort: false,
      });

      setTimeout(() => {
        controller.abort();
      }, 100).unref();

      const result = await promise;
      expect(result).to.equal(promise.childProcessWrapper);

      expect(result.killed).equal(true);
    });
  });

  it("can capture stdout text", async () => {
    const promise = devChildTask.spawn("node", ["-e", "console.log(1234)"], {
      title: "hey",
      printStarted: false,
      captureOutputText: true,
    });

    expect(promise.status).to.equal("pending");
    expect(promise.isRunning).to.equal(true);
    expect(promise.isRejected).to.equal(false);
    expect(promise.isSettled).to.equal(false);
    expect(promise.isSucceeded).to.equal(false);

    expect(promise.error).to.equal(null);
    expect(promise.exitCode).to.equal(null);

    expect(promise.title).to.equal("hey");

    const result = await promise;

    expect(promise.status).to.equal("succeeded");
    expect(promise.isRunning).to.equal(false);
    expect(promise.isRejected).to.equal(false);
    expect(promise.isSettled).to.equal(true);
    expect(promise.isSucceeded).to.equal(true);

    expect(promise.error).to.equal(null);
    expect(promise.exitCode).to.equal(0);

    expect(result).to.deep.include({ exitCode: 0 });

    expect(result.stderrText).to.equal("");
    expect(result.stdoutText).to.equal("1234\n");
  });

  describe("npmRun", () => {
    it("executes an ok script", async () => {
      const promise = devChildTask.npmRun("ok", [], { printStarted: false });
      expect(promise.childProcess).to.be.instanceOf(ChildProcess);

      expect(promise.status).to.equal("pending");
      expect(promise.isRunning).to.equal(true);
      expect(promise.isRejected).to.equal(false);
      expect(promise.isSettled).to.equal(false);
      expect(promise.isSucceeded).to.equal(false);

      expect(promise.error).to.equal(null);
      expect(promise.exitCode).to.equal(null);

      expect(promise.title).to.include(" run ok");

      const result = await promise;

      expect(promise.status).to.equal("succeeded");
      expect(promise.isRunning).to.equal(false);
      expect(promise.isRejected).to.equal(false);
      expect(promise.isSettled).to.equal(true);
      expect(promise.isSucceeded).to.equal(true);

      expect(promise.error).to.equal(null);
      expect(promise.exitCode).to.equal(0);

      expect(result).to.deep.include({ exitCode: 0 });
    });

    it("executes a script with error", async () => {
      const promise = devChildTask.npmRun("fail", [], { logError: false, timed: false });
      expect(promise.childProcess).to.be.instanceOf(ChildProcess);

      expect(promise.status).to.equal("pending");
      expect(promise.isRunning).to.equal(true);
      expect(promise.isRejected).to.equal(false);
      expect(promise.isSettled).to.equal(false);
      expect(promise.isSucceeded).to.equal(false);

      expect(promise.error).to.equal(null);
      expect(promise.exitCode).to.equal(null);

      expect(promise.title).to.include(" run fail");

      let error: unknown;
      try {
        await promise;
      } catch (e) {
        error = e;
      }

      expect(error).to.be.instanceOf(Error);

      expect(promise.status).to.equal("rejected");
      expect(promise.isRunning).to.equal(false);
      expect(promise.isRejected).to.equal(true);
      expect(promise.isSettled).to.equal(true);
      expect(promise.isSucceeded).to.equal(false);

      expect(promise.error).to.equal(error);
      expect(promise.exitCode).to.not.equal(0);
    });
  });
});
