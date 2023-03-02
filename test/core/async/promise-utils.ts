import { expect } from "chai";
import { isPromise, isPromiseLike } from "@balsamic/core/async";

describe("isPromiseLike", () => {
  it("should return true for a promise-like", () => {
    expect(isPromiseLike({ then: () => {} })).eq(true);
  });

  it("should return true for a promise", () => {
    expect(isPromiseLike(Promise.resolve())).eq(true);
  });

  it("should return false for a non-promise", () => {
    expect(isPromiseLike({})).eq(false);
  });

  it("should return false for a non-promise-like", () => {
    expect(isPromiseLike(null)).eq(false);
  });

  it("should return false for a function with a then and catch", () => {
    function fn() {}

    fn.then = () => {};
    fn.catch = () => {};
    expect(isPromiseLike(fn)).eq(false);
  });
});

describe("isPromise", () => {
  it("should return true for a promise", () => {
    expect(isPromise(Promise.resolve())).eq(true);
  });

  it("should return false for a promise-like", () => {
    expect(isPromise({ then: () => {} })).eq(false);
  });

  it("should return false for a non-promise", () => {
    expect(isPromise({})).eq(false);
  });

  it("should return false for a function with a then and catch", () => {
    function fn() {}

    fn.then = () => {};
    fn.catch = () => {};
    expect(isPromise(fn)).eq(false);
  });
});
