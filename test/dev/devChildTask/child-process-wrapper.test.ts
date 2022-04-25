import { expect } from "chai";
import child_process, { ChildProcess } from "child_process";
import { AbortError } from "../../../packages/dev/src";
import { ChildProcessWrapper } from "../../../packages/dev/src/processes/child-process-wrapper";

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

    expect(wrapper.status).to.equal("succeeded");
    expect(wrapper.isRunning).to.equal(false);
    expect(wrapper.isRejected).to.equal(false);
    expect(wrapper.isSettled).to.equal(true);
    expect(wrapper.isSucceeded).to.equal(true);

    expect(wrapper.error).to.equal(null);
    expect(wrapper.exitCode).to.equal(0);

    expect(process.listeners("close").length).to.equal(0);
    expect(process.listeners("exit").length).to.equal(0);
    expect(process.listeners("error").length).to.equal(0);
  });

  it("Creates a child process wrapper from an error", async () => {
    const error = new Error("my error");
    const wrapper = new ChildProcessWrapper(error, options);

    await wrapper.terminationPromise();

    expect(wrapper.status).to.equal("rejected");
    expect(wrapper.isRunning).to.equal(false);
    expect(wrapper.isRejected).to.equal(true);
    expect(wrapper.isSettled).to.equal(true);
    expect(wrapper.isSucceeded).to.equal(false);

    expect(wrapper.error).to.equal(error);
    expect(wrapper.exitCode).to.equal(-1);

    expect(wrapper.childProcess.listeners("close").length).to.equal(0);
    expect(wrapper.childProcess.listeners("exit").length).to.equal(0);
    expect(wrapper.childProcess.listeners("error").length).to.equal(0);
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

    expect(wrapper.status).to.equal("rejected");
    expect(wrapper.isRunning).to.equal(false);
    expect(wrapper.isRejected).to.equal(true);
    expect(wrapper.isSettled).to.equal(true);
    expect(wrapper.isSucceeded).to.equal(false);

    expect(wrapper.error?.message).to.include("failed");
    expect(wrapper.exitCode).to.equal("SIGTERM");

    expect(process.listeners("close").length).to.equal(0);
    expect(process.listeners("exit").length).to.equal(0);
    expect(process.listeners("error").length).to.equal(0);
  });

  it("supports killing a process via abortSignal", async () => {
    const process = child_process.spawn("node", ["-e", "setTimeout(()=>{},20000)"], {});

    const abortController = new AbortController();

    const wrapper = new ChildProcessWrapper(process, options, abortController.signal);

    setTimeout(() => abortController.abort(), 100);

    await wrapper.terminationPromise();

    expect(wrapper.exitCode === "SIGTERM");
    expect(wrapper.error?.message).to.equal("The operation was aborted");
    expect(AbortError.isAbortError(wrapper.error)).to.equal(true);
    expect(wrapper.isRejected).to.equal(true);
    expect(wrapper.killed).to.equal(true);
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
