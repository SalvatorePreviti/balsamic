import path from "path";
import { expect } from "chai";
import { devChildTask, ProcessPromise } from "../../../packages/dev/src/dev-child-task";
import { ChildProcess } from "child_process";

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
