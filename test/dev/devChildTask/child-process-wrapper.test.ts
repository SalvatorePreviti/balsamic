import type { ChildProcess } from "node:child_process";
import child_process from "node:child_process";
import { describe, it, expect } from "vitest";
import { AbortError, abortSignals, ChildProcessWrapper } from "@balsamic/dev";

const options: ChildProcessWrapper.Options = {
  title: "my title",
  timed: false,
  logError: false,
};

describe("ChildProcessWrapper", () => {
  it("has the correct state for an already terminated process", async () => {
    const process = await processToPromise(() => child_process.spawn("node", ["-e", "console.log(1)"]));
    const wrapper = new ChildProcessWrapper(process, options);

    await wrapper.terminationPromise();

    expect(wrapper.status).equal("succeeded");
    expect(wrapper.isRunning).equal(false);
    expect(wrapper.isRejected).equal(false);
    expect(wrapper.isSettled).equal(true);
    expect(wrapper.isSucceeded).equal(true);

    expect(wrapper.error).equal(null);
    expect(wrapper.exitCode).equal(0);

    expect(process.listeners("close").length).equal(0);
    expect(process.listeners("exit").length).equal(0);
    expect(process.listeners("error").length).equal(0);
  });

  it("Creates a child process wrapper from an error", async () => {
    const error = new Error("my error");
    const wrapper = new ChildProcessWrapper(error, options);

    await wrapper.terminationPromise();

    expect(wrapper.status).equal("rejected");
    expect(wrapper.isRunning).equal(false);
    expect(wrapper.isRejected).equal(true);
    expect(wrapper.isSettled).equal(true);
    expect(wrapper.isSucceeded).equal(false);

    expect(wrapper.error).equal(error);
    expect(wrapper.exitCode).equal(-1);

    expect(wrapper.childProcess.listeners("close").length).equal(0);
    expect(wrapper.childProcess.listeners("exit").length).equal(0);
    expect(wrapper.childProcess.listeners("error").length).equal(0);
  });

  it("has the correct state for an already aborted process", async () => {
    const process = await processToPromise(() => {
      const abortController = new AbortController();
      abortController.abort();
      const ret = child_process.spawn("node", ["-e", "process.exit(1)"], { signal: abortController.signal });
      return ret;
    });

    const wrapper = new ChildProcessWrapper(process, options);

    await wrapper.terminationPromise();

    expect(wrapper.status).equal("rejected");
    expect(wrapper.isRunning).equal(false);
    expect(wrapper.isRejected).equal(true);
    expect(wrapper.isSettled).equal(true);
    expect(wrapper.isSucceeded).equal(false);

    expect(wrapper.error?.message).include("failed");
    expect(wrapper.exitCode).equal("SIGTERM");

    expect(process.listeners("close").length).equal(0);
    expect(process.listeners("exit").length).equal(0);
    expect(process.listeners("error").length).equal(0);
  });

  it("supports killing a process via abortSignal", async () => {
    const process = child_process.spawn("node", ["-e", "setTimeout(()=>{},20000)"], {});

    const abortController = new AbortController();

    const wrapper = new ChildProcessWrapper(process, options, abortController.signal);

    setTimeout(() => abortSignals.abort(abortController), 100);

    await wrapper.terminationPromise();

    expect(wrapper.exitCode === "SIGTERM").equal(true);
    expect(wrapper.error?.message).equal("The operation was aborted");
    expect(AbortError.isAbortError(wrapper.error)).equal(true);
    expect(wrapper.isRejected).equal(true);
    expect(wrapper.killed).equal(true);
  });
});

function processToPromise(fn: () => ChildProcess) {
  return new Promise<ChildProcess>((resolve) => {
    const process = fn();

    process.once("close", onClose);
    process.once("error", onClose);

    function onClose() {
      process.off("close", onClose);
      process.off("error", onClose);
      resolve(process);
    }
  });
}
