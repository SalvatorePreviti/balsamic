import path from "path";
import { expect } from "chai";
import { devChildTask, ProcessPromise } from "../../../packages/dev/src/dev-child-task";
import { ChildProcess } from "child_process";
import { AbortError } from "../../../packages/dev/src";

describe("devChildTask", () => {
  let originalFolder: string;

  before(() => {
    originalFolder = process.cwd();
    process.chdir(path.resolve(__dirname, "package"));
  });

  after(() => {
    process.chdir(originalFolder);
  });

  describe("ProcessPromise.rejectProcessPromise", () => {
    it("returns a valid rejected promise", async () => {
      const promise = ProcessPromise.rejectProcessPromise(new Error("xxx"));

      expect(promise.status).to.equal("rejected");
      expect(promise.isPending).to.equal(false);
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
      const promise = new ProcessPromise(
        () => {
          fnCalled = true;
          throw new Error("should not be called");
        },
        { signal: controller.signal, timed: false },
      );

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
      const promise = new ProcessPromise(
        () => {
          fnCalled = true;
          throw new Error("should not be called");
        },
        { signal: controller.signal, timed: false, rejectOnAbort: false },
      );

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

      expect(await promise).to.deep.equal({ exitCode: "SIGABRT" });
    });
  });

  describe("npmRun", () => {
    it("executes an ok script", async () => {
      const promise = devChildTask.npmRun("ok", [], {});
      expect(promise.childProcess).to.be.instanceOf(ChildProcess);

      expect(promise.status).to.equal("pending");
      expect(promise.isPending).to.equal(true);
      expect(promise.isRejected).to.equal(false);
      expect(promise.isSettled).to.equal(false);
      expect(promise.isSucceeded).to.equal(false);

      expect(promise.error).to.equal(null);
      expect(promise.exitCode).to.equal(null);

      expect(promise.title).to.equal("npm run ok");

      const result = await promise;

      expect(promise.status).to.equal("succeeded");
      expect(promise.isPending).to.equal(false);
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
      expect(promise.isPending).to.equal(true);
      expect(promise.isRejected).to.equal(false);
      expect(promise.isSettled).to.equal(false);
      expect(promise.isSucceeded).to.equal(false);

      expect(promise.error).to.equal(null);
      expect(promise.exitCode).to.equal(null);

      expect(promise.title).to.equal("npm run fail");

      let error: unknown;
      try {
        await promise;
      } catch (e) {
        error = e;
      }

      expect(error).to.be.instanceOf(Error);

      expect(promise.status).to.equal("rejected");
      expect(promise.isPending).to.equal(false);
      expect(promise.isRejected).to.equal(true);
      expect(promise.isSettled).to.equal(true);
      expect(promise.isSucceeded).to.equal(false);

      expect(promise.error).to.equal(error);
      expect(promise.exitCode).to.equal(123);
    });
  });
});