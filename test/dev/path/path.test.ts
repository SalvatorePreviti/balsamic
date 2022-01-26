import { expect } from "chai";
import * as pathStar from "../../../packages/dev/src/path";
import { isGlob, looksLikeFileURL, parseNodePackageName } from "../../../packages/dev/src/path";

describe("test/dev/path", () => {
  describe("exports", () => {
    it("exports the same members as posix", () => {
      for (const k of Object.keys(pathStar.posix)) {
        expect(typeof (pathStar as any)[k]).to.equal(typeof (pathStar.posix as any)[k], `key "${k}"`);
      }
    });

    it("exports the same members as win32", () => {
      for (const k of Object.keys(pathStar.win32)) {
        expect(typeof (pathStar as any)[k]).to.equal(typeof (pathStar.win32 as any)[k], `key "${k}"`);
      }
    });
  });

  describe("looksLikeFileURL", () => {
    it("is false for empty string", () => expect(looksLikeFileURL("")).to.equal(false));
    it("is false for normal path", () => expect(looksLikeFileURL("hello/xxxx")).to.equal(false));
    it("is true for file://", () => expect(looksLikeFileURL("file://")).to.equal(true));
    it("is true for file:// case insensitive", () => expect(looksLikeFileURL("fILe://")).to.equal(true));
    it("is true for file:///xxx/yyy", () => expect(looksLikeFileURL("file:///xxx/yyy")).to.equal(true));
    it("is true for file:///xxx/yyy case insensitive", () =>
      expect(looksLikeFileURL("fILe:///xxx/yyy")).to.equal(true));
  });

  describe("parseNodePackageName", () => {
    it("parses a simple package name", () => {
      expect(parseNodePackageName("hello")).to.eql({ packageScope: "", packageName: "hello", subpath: "." });
    });

    it("parses a simple package name with a subpath", () => {
      expect(parseNodePackageName("hello/xxx/yyy/\\zzz/.././www/./")).to.eql({
        packageScope: "",
        packageName: "hello",
        subpath: "xxx/yyy/www/",
      });
    });

    it("parses a scoped package name", () => {
      expect(parseNodePackageName("@hello/mmm")).to.eql({
        packageScope: "@hello",
        packageName: "@hello/mmm",
        subpath: ".",
      });
    });

    it("parses a scoped package name with a subpath", () => {
      expect(parseNodePackageName("@hello/mmm/xxx/yyy/\\zzz/.././www/./")).to.eql({
        packageScope: "@hello",
        packageName: "@hello/mmm",
        subpath: "xxx/yyy/www/",
      });
    });
  });

  describe("isGlob", () => {
    it("should be true if valid glob pattern", () => {
      expect(isGlob("!foo.js")).to.equal(true);
      expect(isGlob("*.js")).to.equal(true);
      expect(isGlob("f?o.js")).to.equal(true);
      expect(isGlob("!*.js")).to.equal(true);
      expect(isGlob("!foo")).to.equal(true);
      expect(isGlob("!foo.js")).to.equal(true);
      expect(isGlob("**/abc.js")).to.equal(true);
      expect(isGlob("abc/*.js")).to.equal(true);
      expect(isGlob("@.(?:abc)")).to.equal(true);
      expect(isGlob("@.(?!abc)")).to.equal(true);
    });

    it("Should be true if path has regex capture group", () => {
      expect(isGlob("abc/(?!foo).js")).to.equal(true);
      expect(isGlob("abc/(?:foo).js")).to.equal(true);
      expect(isGlob("abc/(?=foo).js")).to.equal(true);
      expect(isGlob("abc/(a|b).js")).to.equal(true);
      expect(isGlob("abc/(a|b|c).js")).to.equal(true);
      expect(isGlob("abc/(foo bar)/*.js")).to.equal(true);
    });

    it("should be false if invalid glob pattern", () => {
      expect(isGlob("")).to.equal(false);
      expect(isGlob("~/abc")).to.equal(false);
      expect(isGlob("~/abc")).to.equal(false);
      expect(isGlob("~/(abc)")).to.equal(false);
      expect(isGlob("+~(abc)")).to.equal(false);
      expect(isGlob(".")).to.equal(false);
      expect(isGlob("@.(abc)")).to.equal(false);
      expect(isGlob("aa")).to.equal(false);
      expect(isGlob("abc!/def/!ghi.js")).to.equal(false);
      expect(isGlob("abc.js")).to.equal(false);
      expect(isGlob("abc/def/!ghi.js")).to.equal(false);
      expect(isGlob("abc/def/ghi.js")).to.equal(false);
    });

    it("should be false if the path has parens but is not a valid capture group", () => {
      expect(isGlob("abc/(a b c).js")).to.equal(false);
      expect(isGlob("abc/(ab).js")).to.equal(false);
      expect(isGlob("abc/(abc).js")).to.equal(false);
      expect(isGlob("abc/(foo bar).js")).to.equal(false);
    });

    it("should be false if the capture group is imbalanced", () => {
      expect(isGlob("abc/(ab.js")).to.equal(false);
      expect(isGlob("abc/(a|b.js")).to.equal(false);
      expect(isGlob("abc/(a|b|c.js")).to.equal(false);
    });

    it("should be true if the path has a regex character class", () => {
      expect(isGlob("abc/[abc].js")).to.equal(true);
      expect(isGlob("abc/[^abc].js")).to.equal(true);
      expect(isGlob("abc/[1-3].js")).to.equal(true);
    });

    it("should be false if the character class is not balanced", () => {
      expect(isGlob("abc/[abc.js")).to.equal(false);
      expect(isGlob("abc/[^abc.js")).to.equal(false);
      expect(isGlob("abc/[1-3.js")).to.equal(false);
    });

    it("should be false if the character class is escaped", () => {
      expect(isGlob("abc/\\[abc].js")).to.equal(false);
      expect(isGlob("abc/\\[^abc].js")).to.equal(false);
      expect(isGlob("abc/\\[1-3].js")).to.equal(false);
    });

    it("should be true if the path has brace characters", () => {
      expect(isGlob("abc/{a,b}.js")).to.equal(true);
      expect(isGlob("abc/{a..z}.js")).to.equal(true);
      expect(isGlob("abc/{a..z..2}.js")).to.equal(true);
    });

    it("should be false if (basic) braces are not balanced", () => {
      expect(isGlob("abc/\\{a,b}.js")).to.equal(false);
      expect(isGlob("abc/\\{a..z}.js")).to.equal(false);
      expect(isGlob("abc/\\{a..z..2}.js")).to.equal(false);
    });

    it("should be true if the path has valid regex characters", () => {
      expect(isGlob("!&(abc)")).to.equal(true);
      expect(isGlob("!*.js")).to.equal(true);
      expect(isGlob("!foo")).to.equal(true);
      expect(isGlob("!foo.js")).to.equal(true);
      expect(isGlob("**/abc.js")).to.equal(true);
      expect(isGlob("*.js")).to.equal(true);
      expect(isGlob("*z(abc)")).to.equal(true);
      expect(isGlob("[1-10].js")).to.equal(true);
      expect(isGlob("[^abc].js")).to.equal(true);
      expect(isGlob("[a-j]*[^c]b/c")).to.equal(true);
      expect(isGlob("[abc].js")).to.equal(true);
      expect(isGlob("a/b/c/[a-z].js")).to.equal(true);
      expect(isGlob("abc/(aaa|bbb).js")).to.equal(true);
      expect(isGlob("abc/*.js")).to.equal(true);
      expect(isGlob("abc/{a,b}.js")).to.equal(true);
      expect(isGlob("abc/{a..z..2}.js")).to.equal(true);
      expect(isGlob("abc/{a..z}.js")).to.equal(true);
      expect(isGlob("$(abc)")).to.equal(false);
      expect(isGlob("&(abc)")).to.equal(false);
    });

    it("should be false if regex characters are escaped", () => {
      expect(isGlob("\\?.js")).to.equal(false);
      expect(isGlob("\\[1-10\\].js")).to.equal(false);
      expect(isGlob("\\[^abc\\].js")).to.equal(false);
      expect(isGlob("\\[a-j\\]\\*\\[^c\\]b/c")).to.equal(false);
      expect(isGlob("\\[abc\\].js")).to.equal(false);
      expect(isGlob("\\a/b/c/\\[a-z\\].js")).to.equal(false);
      expect(isGlob("abc/\\(aaa|bbb).js")).to.equal(false);
      expect(isGlob("abc/\\?.js")).to.equal(false);
    });
  });
});
