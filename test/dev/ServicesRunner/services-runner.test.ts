import { expect, describe, it } from "vitest";
import { runParallel, runSequential, ServicesRunner } from "@balsamic/dev";

describe("ServicesRunner", () => {
  it("allows running services and promises", async () => {
    const runner = new ServicesRunner({
      abortOnServiceTermination: false,
    });

    let counter = 0;
    let a = 0;
    let b = 0;
    let c = 0;
    let d = 0;
    let e = 0;
    let g = 0;
    let f = 0;

    await runner.run(async () => {
      runner.startService("a", () => {
        a = ++counter;
      });

      runner.startService("b", async () => {
        await runner.setTimeout(15);
        b = ++counter;
      });

      runner.startService("c", async () => {
        await runner.setTimeout(10);
        c = ++counter;
      });

      runner.startService("d", async () => {
        await runner.setTimeout(20);
        d = ++counter;
      });

      const p = (async () => {
        await runner.setTimeout(25);
        e = ++counter;
      })();

      runner.startService("e", p);

      await runParallel([
        async () => {
          await runSequential([
            async () => {
              await runner.setTimeout(10);
              f = ++counter;
            },
            () => {
              f += 100;
            },
          ]);
        },
      ]);
    });
    g = ++counter;

    console.log("run end");

    const sequence = {
      a,
      b,
      c,
      d,
      e,
      f,
      g,
    };

    expect(sequence).toEqual({
      a: 1,
      b: 4,
      c: 2,
      d: 5,
      e: 6,
      f: 103,
      g: 7,
    });
  });
});
