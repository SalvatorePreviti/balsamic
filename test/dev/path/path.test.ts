import { expect, it, describe } from "vitest";
import * as pathStar from "@balsamic/dev/path";
import { isGlob, looksLikeFileURL } from "@balsamic/dev/path";

describe("test/dev/path", () => {
  describe("exports", () => {
    it("exports the same members as posix", () => {
      for (const k of Object.keys(pathStar.posix)) {
        expect(typeof (pathStar as any)[k]).equal(typeof (pathStar.posix as any)[k], `key "${k}"`);
      }
    });

    it("exports the same members as win32", () => {
      for (const k of Object.keys(pathStar.win32)) {
        expect(typeof (pathStar as any)[k]).equal(typeof (pathStar.win32 as any)[k], `key "${k}"`);
      }
    });
  });

  describe("looksLikeFileURL", () => {
    it("is false for empty string", () => expect(looksLikeFileURL("")).equal(false));
    it("is false for normal path", () => expect(looksLikeFileURL("hello/xxxx")).equal(false));
    it("is true for file://", () => expect(looksLikeFileURL("file://")).equal(true));
    it("is true for file:// case insensitive", () => expect(looksLikeFileURL("fILe://")).equal(true));
    it("is true for file:///xxx/yyy", () => expect(looksLikeFileURL("file:///xxx/yyy")).equal(true));
    it("is true for file:///xxx/yyy case insensitive", () => expect(looksLikeFileURL("fILe:///xxx/yyy")).equal(true));
  });

  describe("isGlob", () => {
    it("should be true if valid glob pattern", () => {
      expect(isGlob("!foo.js")).equal(true);
      expect(isGlob("*.js")).equal(true);
      expect(isGlob("f?o.js")).equal(true);
      expect(isGlob("!*.js")).equal(true);
      expect(isGlob("!foo")).equal(true);
      expect(isGlob("!foo.js")).equal(true);
      expect(isGlob("**/abc.js")).equal(true);
      expect(isGlob("abc/*.js")).equal(true);
      expect(isGlob("@.(?:abc)")).equal(true);
      expect(isGlob("@.(?!abc)")).equal(true);
    });

    it("Should be true if path has regex capture group", () => {
      expect(isGlob("abc/(?!foo).js")).equal(true);
      expect(isGlob("abc/(?:foo).js")).equal(true);
      expect(isGlob("abc/(?=foo).js")).equal(true);
      expect(isGlob("abc/(a|b).js")).equal(true);
      expect(isGlob("abc/(a|b|c).js")).equal(true);
      expect(isGlob("abc/(foo bar)/*.js")).equal(true);
    });

    it("should be false if invalid glob pattern", () => {
      expect(isGlob("")).equal(false);
      expect(isGlob("~/abc")).equal(false);
      expect(isGlob("~/abc")).equal(false);
      expect(isGlob("~/(abc)")).equal(false);
      expect(isGlob("+~(abc)")).equal(false);
      expect(isGlob(".")).equal(false);
      expect(isGlob("@.(abc)")).equal(false);
      expect(isGlob("aa")).equal(false);
      expect(isGlob("abc!/def/!ghi.js")).equal(false);
      expect(isGlob("abc.js")).equal(false);
      expect(isGlob("abc/def/!ghi.js")).equal(false);
      expect(isGlob("abc/def/ghi.js")).equal(false);
    });

    it("should be false if the path has parens but is not a valid capture group", () => {
      expect(isGlob("abc/(a b c).js")).equal(false);
      expect(isGlob("abc/(ab).js")).equal(false);
      expect(isGlob("abc/(abc).js")).equal(false);
      expect(isGlob("abc/(foo bar).js")).equal(false);
    });

    it("should be false if the capture group is imbalanced", () => {
      expect(isGlob("abc/(ab.js")).equal(false);
      expect(isGlob("abc/(a|b.js")).equal(false);
      expect(isGlob("abc/(a|b|c.js")).equal(false);
    });

    it("should be true if the path has a regex character class", () => {
      expect(isGlob("abc/[abc].js")).equal(true);
      expect(isGlob("abc/[^abc].js")).equal(true);
      expect(isGlob("abc/[1-3].js")).equal(true);
    });

    it("should be false if the character class is not balanced", () => {
      expect(isGlob("abc/[abc.js")).equal(false);
      expect(isGlob("abc/[^abc.js")).equal(false);
      expect(isGlob("abc/[1-3.js")).equal(false);
    });

    it("should be false if the character class is escaped", () => {
      expect(isGlob("abc/\\[abc].js")).equal(false);
      expect(isGlob("abc/\\[^abc].js")).equal(false);
      expect(isGlob("abc/\\[1-3].js")).equal(false);
    });

    it("should be true if the path has brace characters", () => {
      expect(isGlob("abc/{a,b}.js")).equal(true);
      expect(isGlob("abc/{a..z}.js")).equal(true);
      expect(isGlob("abc/{a..z..2}.js")).equal(true);
    });

    it("should be false if (basic) braces are not balanced", () => {
      expect(isGlob("abc/\\{a,b}.js")).equal(false);
      expect(isGlob("abc/\\{a..z}.js")).equal(false);
      expect(isGlob("abc/\\{a..z..2}.js")).equal(false);
    });

    it("should be true if the path has valid regex characters", () => {
      expect(isGlob("!&(abc)")).equal(true);
      expect(isGlob("!*.js")).equal(true);
      expect(isGlob("!foo")).equal(true);
      expect(isGlob("!foo.js")).equal(true);
      expect(isGlob("**/abc.js")).equal(true);
      expect(isGlob("*.js")).equal(true);
      expect(isGlob("*z(abc)")).equal(true);
      expect(isGlob("[1-10].js")).equal(true);
      expect(isGlob("[^abc].js")).equal(true);
      expect(isGlob("[a-j]*[^c]b/c")).equal(true);
      expect(isGlob("[abc].js")).equal(true);
      expect(isGlob("a/b/c/[a-z].js")).equal(true);
      expect(isGlob("abc/(aaa|bbb).js")).equal(true);
      expect(isGlob("abc/*.js")).equal(true);
      expect(isGlob("abc/{a,b}.js")).equal(true);
      expect(isGlob("abc/{a..z..2}.js")).equal(true);
      expect(isGlob("abc/{a..z}.js")).equal(true);
      expect(isGlob("$(abc)")).equal(false);
      expect(isGlob("&(abc)")).equal(false);
    });

    it("should be false if regex characters are escaped", () => {
      expect(isGlob("\\?.js")).equal(false);
      expect(isGlob("\\[1-10\\].js")).equal(false);
      expect(isGlob("\\[^abc\\].js")).equal(false);
      expect(isGlob("\\[a-j\\]\\*\\[^c\\]b/c")).equal(false);
      expect(isGlob("\\[abc\\].js")).equal(false);
      expect(isGlob("\\a/b/c/\\[a-z\\].js")).equal(false);
      expect(isGlob("abc/\\(aaa|bbb).js")).equal(false);
      expect(isGlob("abc/\\?.js")).equal(false);
    });
  });
});
