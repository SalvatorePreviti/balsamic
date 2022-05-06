import net from "node:net";
import { Deferred } from "../promises/deferred";
import { performance } from "perf_hooks";
import { Main } from "../main";

/** Returns true if the given network port can be used for listening */
export function netTcpPortIsAvailable(port: number | string | undefined | null): Promise<boolean> {
  return Main.ref.wrapPromise(
    new Deferred<boolean>((resolve) => {
      const server = net
        .createServer()
        .listen(+(port || ""), () => server.close())
        .on("close", () => {
          resolve(true);
        })
        .on("error", () => {
          resolve(false);
        });
    }).promise,
  );
}

export namespace netTcpTryConnect {
  export interface Options {
    host?: string | undefined;
    port?: string | number | undefined | null;
    timeout?: number | undefined;
  }

  export interface Result {
    elapsed: number;
    success: boolean;
    message: string;
  }
}

/**
 * Tries to connect to a given port.
 * Measure the elapsed time and return a success status.
 */
export function netTcpTryConnect({
  host = "localhost",
  port = 80,
  timeout = 5000,
}: netTcpTryConnect.Options = {}): Promise<netTcpTryConnect.Result> {
  const startTime = performance.now();
  return new Deferred<netTcpTryConnect.Result>((resolve) => {
    const socket = new net.Socket();
    socket
      .connect(+(port || ""), host, () => {
        resolve({ elapsed: performance.now() - startTime, success: true, message: "Connected." });
        socket.destroy();
      })
      .on("error", (e) => {
        resolve({ elapsed: performance.now() - startTime, success: false, message: e.message });
        socket.destroy();
      });
    if (timeout) {
      socket.setTimeout(timeout, () => {
        resolve({ elapsed: performance.now() - startTime, success: false, message: "Timed out" });
        socket.destroy();
      });
    }
  }).promise;
}
