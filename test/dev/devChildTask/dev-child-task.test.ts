import path from "node:path";
import { ChildProcess } from "node:child_process";
import { expect, it, describe } from "vitest";
import { AbortError, ChildProcessPromise, ChildProcessWrapper, devChildTask } from "@balsamic/dev";

describe("devChildTask", () => {
  const cwd = path.resolve(__dirname, "package");

  describe("ChildProcessPromise.rejectProcessPromise", () => {
    it("returns a valid rejected promise", async () => {
      const promise = ChildProcessPromise.reject(new Error("xxx"));

      expect(promise.status).equal("rejected");
      expect(promise.isRunning).equal(false);
      expect(promise.isRejected).equal(true);
      expect(promise.isSettled).equal(true);
      expect(promise.isSucceeded).equal(false);

      expect(promise.childProcess).toBeInstanceOf(ChildProcess);

      let error: unknown;
      try {
        await promise;
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(Error);
      expect(promise.error).equal(error);
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

      expect(fnCalled).equal(false);

      let error: unknown;
      try {
        await promise;
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(Error);
      expect(AbortError.isAbortError(error)).toBe(true);
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

      expect(fnCalled).equal(false);

      await promise;
    });

    it("allows aborting", async () => {
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

      expect(error).toBeInstanceOf(Error);
      expect(error!.code).equal("ABORT_ERR");
    }, 10000);

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
      expect(result).equal(promise.childProcessWrapper);

      expect(result.killed).equal(true);
    });
  });

  it("can capture stdout text", async () => {
    const promise = devChildTask.spawn("node", ["-e", "console.log(1234)"], {
      title: "hey",
      printStarted: false,
      captureOutputText: true,
    });

    expect(promise.status).equal("pending");
    expect(promise.isRunning).equal(true);
    expect(promise.isRejected).equal(false);
    expect(promise.isSettled).equal(false);
    expect(promise.isSucceeded).equal(false);

    expect(promise.error).equal(null);
    expect(promise.exitCode).equal(null);

    expect(promise.title).equal("hey");

    const result = await promise;

    expect(promise.status).equal("succeeded");
    expect(promise.isRunning).equal(false);
    expect(promise.isRejected).equal(false);
    expect(promise.isSettled).equal(true);
    expect(promise.isSucceeded).equal(true);

    expect(promise.error).equal(null);
    expect(promise.exitCode).equal(0);

    expect(result).include({ exitCode: 0 });

    expect(result.stderrText).equal("");
    expect(result.stdoutText).equal("1234\n");
  });

  describe("npmRun", () => {
    it("executes an ok script", async () => {
      const promise = devChildTask.npmRun("ok", [], { printStarted: false, cwd });
      expect(promise.childProcess).toBeInstanceOf(ChildProcess);

      expect(promise.status).equal("pending");
      expect(promise.isRunning).equal(true);
      expect(promise.isRejected).equal(false);
      expect(promise.isSettled).equal(false);
      expect(promise.isSucceeded).equal(false);

      expect(promise.error).equal(null);
      expect(promise.exitCode).equal(null);

      expect(promise.title).include(" run ok");

      const result = await promise;

      expect(promise.status).equal("succeeded");
      expect(promise.isRunning).equal(false);
      expect(promise.isRejected).equal(false);
      expect(promise.isSettled).equal(true);
      expect(promise.isSucceeded).equal(true);

      expect(promise.error).equal(null);
      expect(promise.exitCode).equal(0);

      expect(result).include({ exitCode: 0 });
    });

    it("executes a script with error", async () => {
      const promise = devChildTask.npmRun("fail", [], { logError: false, timed: false, cwd });
      expect(promise.childProcess).toBeInstanceOf(ChildProcess);

      expect(promise.status).equal("pending");
      expect(promise.isRunning).equal(true);
      expect(promise.isRejected).equal(false);
      expect(promise.isSettled).equal(false);
      expect(promise.isSucceeded).equal(false);

      expect(promise.error).equal(null);
      expect(promise.exitCode).equal(null);

      expect(promise.title).include(" run fail");

      let error: unknown;
      try {
        await promise;
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(Error);

      expect(promise.status).equal("rejected");
      expect(promise.isRunning).equal(false);
      expect(promise.isRejected).equal(true);
      expect(promise.isSettled).equal(true);
      expect(promise.isSucceeded).equal(false);

      expect(promise.error).equal(error);
      expect(promise.exitCode).not.eq(0);
    });
  });
});
