import { expect, it, describe, test } from "vitest";
import _nodePath from "path";
import path from "@balsamic/dev/path";
import * as posix from "@balsamic/dev/path/posix";
import {
  absolutePathToFileURL,
  appendTrailingSlash,
  endsWithSlash,
  fileDir,
  fixSlashes,
  globJoin,
  globNormalize,
  isPathInside,
  isRelative,
  isRootPath,
  isSep,
  pathFromFileURL,
  removeTrailingSlash,
  resolveFileOrDirectory,
  splitSlashes,
  startsWithRelative,
  startsWithSlash,
} from "@balsamic/dev/path/posix";

const nodePosix = _nodePath.posix;

describe("test/dev/path/posix", () => {
  describe("export default", () => {
    it("import default has all import *", () => {
      for (const k of Object.keys(posix.default)) {
        expect((posix as any)[k]).equal((posix.default as any)[k], `key "${k}" / import *`);
      }
    });

    it("import * as all import default", () => {
      for (const k of Object.keys(posix)) {
        expect((posix.default as any)[k]).equal((posix as any)[k], `key "${k}" / import default`);
      }
    });

    it("import * as all node path.posix", () => {
      for (const k of Object.keys(nodePosix)) {
        if (k !== "win32" && k !== "posix" && k !== "_makeLong") {
          expect((posix as any)[k]).equal((posix as any)[k], `key "${k}" in node:win32 / import *`);
        }
      }
    });

    it("import default as all node path.posix", () => {
      for (const k of Object.keys(nodePosix)) {
        if (k !== "win32" && k !== "posix" && k !== "_makeLong") {
          expect((posix.default as any)[k]).equal((nodePosix as any)[k], `key "${k}" in node:win32 / import default`);
        }
      }
    });

    it("is the same of path.posix", () => {
      expect(path.posix).equal(posix);
    });
  });

  it("has valid constants", () => {
    expect(posix.isPosix).equal(true);
    expect(posix.isWin32).equal(false);
    expect(posix.sep).equal(nodePosix.sep);
    expect(posix.delimiter).equal(nodePosix.delimiter);
  });

  describe("fixSlashes", () => {
    it("does nothing with an empty string", () => expect(fixSlashes("")).equal(""));
    it("does nothing with a string without slashes", () => expect(fixSlashes("xxx")).equal("xxx"));
    it("does nothing with valid slashes", () => expect(fixSlashes("a/b/c/d")).equal("a/b/c/d"));
    it('replaces "\\" with "/"', () => expect(fixSlashes("\\")).equal("/"));
    it('replaces "\\\\\\" with "/"', () => expect(fixSlashes("\\\\\\")).equal("/"));
    it('replaces "\\aa\\b\\\\c/d//e///" with "/aa/b/c/d/e/"', () =>
      expect(fixSlashes("\\aa\\b\\\\c/d//e///")).equal("/aa/b/c/d/e/"));
  });

  describe("isRelative", () => {
    it("is true for empty string", () => expect(isRelative("")).equal(true));
    it("is true for a word", () => expect(isRelative("hello world")).equal(true));
    it('is true for "."', () => expect(isRelative(".")).equal(true));
    it('is true for ".."', () => expect(isRelative(".")).equal(true));
    it('is true for "./"', () => expect(isRelative("./")).equal(true));
    it('is true for "../"', () => expect(isRelative("../")).equal(true));
    it('is true for "./xx"', () => expect(isRelative("./xx")).equal(true));
    it('is true for "../xx/"', () => expect(isRelative("../xx/")).equal(true));
    it('is false for "/"', () => expect(isRelative("/")).equal(false));
    it('is false for "/xxx/x"', () => expect(isRelative("/xxx/x")).equal(false));
  });

  describe("isSep", () => {
    it("returns false for empty string", () => expect(isSep("")).equal(false));
    it("returns false for a string", () => expect(isSep("x")).equal(false));
    it("returns false for another string", () => expect(isSep("xxx")).equal(false));
    it('returns false for "/x"', () => expect(isSep("/x")).equal(false));
    it("returns false for 0", () => expect(isSep(0)).equal(false));
    it('returns true for "/"', () => expect(isSep("/")).equal(true));
    it('returns true for "/" charcode', () => expect(isSep("/".charCodeAt(0))).equal(true));
    it('returns false for "\\"', () => expect(isSep("\\")).equal(false));
    it('returns false for "\\" charcode', () => expect(isSep("\\".charCodeAt(0))).equal(false));
  });

  describe("splitSlashes", () => {
    it("handles empty strings", () => expect(splitSlashes("")).toEqual([""]));
    it("returns one item for a simple string", () => expect(splitSlashes("xxx \\ xxx")).toEqual(["xxx \\ xxx"]));
    it("splits a string with slashes", () => expect(splitSlashes("a/bb/ccc")).toEqual(["a", "bb", "ccc"]));
    it("splits a string with repeated slashes", () =>
      expect(splitSlashes("/a//.//bb//ccc//")).toEqual(["", "a", "bb", "ccc", ""]));
  });

  describe("startsWithSlash", () => {
    it("returns false for an empty string", () => expect(startsWithSlash("")).equal(false));
    it("returns false for a string", () => expect(startsWithSlash("xxx")).equal(false));
    it('returns false for "\\"', () => expect(startsWithSlash("\\")).equal(false));
    it('returns false for a string starting with "\\"', () => expect(startsWithSlash("\\xxxx")).equal(false));
    it('returns true for "/"', () => expect(startsWithSlash("/")).equal(true));
    it("returns true for a string starting with slash", () => expect(startsWithSlash("/xxx")).equal(true));
  });

  describe("endsWithSlash", () => {
    it("returns false for an empty string", () => expect(endsWithSlash("")).equal(false));
    it("returns false for a string", () => expect(endsWithSlash("xxx")).equal(false));
    it('returns false for "\\"', () => expect(endsWithSlash("\\")).equal(false));
    it('returns false for a string ending with "\\"', () => expect(endsWithSlash("xxxx\\")).equal(false));
    it('returns true for "/"', () => expect(endsWithSlash("/")).equal(true));
    it("returns true for a string ending with slash", () => expect(endsWithSlash("xxx/")).equal(true));
  });

  describe("removeTrailingSlash", () => {
    it("does nothing for an empty string", () => expect(removeTrailingSlash("")).equal(""));
    it('does nothing for "/"', () => expect(removeTrailingSlash("/")).equal("/"));
    it('does nothing for a string not ending with "/"', () =>
      expect(removeTrailingSlash("/a//bb\\")).equal("/a//bb\\"));
    it('removes / for "./"', () => expect(removeTrailingSlash("./")).equal("."));
    it('removes / for "../"', () => expect(removeTrailingSlash("../")).equal(".."));
    it('removes / for "/xx/yy/"', () => expect(removeTrailingSlash("/xx/yy/")).equal("/xx/yy"));
    it("removes multiple ending slashes", () => expect(removeTrailingSlash("/xx/////")).equal("/xx"));
  });

  describe("appendTrailingSlash", () => {
    it("does nothing to an empty string", () => expect(appendTrailingSlash("")).equal(""));
    it("does nothing for /", () => expect(appendTrailingSlash("/")).equal("/"));
    it("fixes double slashes", () => expect(appendTrailingSlash("xx/.//")).equal("xx/"));
    it("fixes double posix slashes", () => expect(appendTrailingSlash("xx//.//")).equal("xx/"));
    it("does nothing for xx/", () => expect(appendTrailingSlash("xx/")).equal("xx/"));
    it("appends / to a path", () => expect(appendTrailingSlash("/x/y/z")).equal("/x/y/z/"));
    it("treats properly ./", () => expect(appendTrailingSlash("./")).equal("./"));
    it("treats properly ../", () => expect(appendTrailingSlash("../")).equal("../"));
    it("treats properly .", () => expect(appendTrailingSlash(".")).equal("./"));
    it("treats properly ..", () => expect(appendTrailingSlash("..")).equal("../"));
    it("treats properly ./.", () => expect(appendTrailingSlash("./.")).equal("./"));
    it("treats properly ../.", () => expect(appendTrailingSlash("../.")).equal("../"));
  });

  describe("isPathInside", () => {
    it("returns true if a path is inside another", () => {
      expect(isPathInside("../a", "/")).equal(true);
      expect(isPathInside("../a/", "/")).equal(true);
      expect(isPathInside("/a", "/")).equal(true);
      expect(isPathInside("/a/", "/")).equal(true);
      expect(isPathInside("/a/b", "/a")).equal(true);
      expect(isPathInside("/a/b", "/a/")).equal(true);
      expect(isPathInside("/a/b/", "/a")).equal(true);
      expect(isPathInside("/a/b/", "/a/")).equal(true);
      expect(isPathInside("/a/b/c", "/")).equal(true);
      expect(isPathInside("/a/b/c/", "/")).equal(true);
      expect(isPathInside("/a/b/c", "/a/b")).equal(true);
      expect(isPathInside("/a/b/c", "/a/b/")).equal(true);
      expect(isPathInside("/a/b/c/", "/a/b")).equal(true);
      expect(isPathInside("/a/b/c/", "/a/b/")).equal(true);
      expect(isPathInside("a", "/")).equal(true);
      expect(isPathInside("a", ".")).equal(true);
      expect(isPathInside("a", "./")).equal(true);
      expect(isPathInside("a", "..")).equal(true);
      expect(isPathInside("a", "../")).equal(true);
      expect(isPathInside("a/", "/")).equal(true);
      expect(isPathInside("a/", ".")).equal(true);
      expect(isPathInside("a/", "./")).equal(true);
      expect(isPathInside("a/", "..")).equal(true);
      expect(isPathInside("a/", "../")).equal(true);
      expect(isPathInside("a/b", "a")).equal(true);
      expect(isPathInside("a/b", "a/")).equal(true);
      expect(isPathInside("a/b/", "a")).equal(true);
      expect(isPathInside("a/b/", "a/")).equal(true);
      expect(isPathInside("a/b/c", "a/b")).equal(true);
      expect(isPathInside("a/b/c", "a/b/")).equal(true);
      expect(isPathInside("a/b/c/", "a/b")).equal(true);
      expect(isPathInside("a/b/c/", "a/b/")).equal(true);
      expect(isPathInside("A/b", "A")).equal(true);
      expect(isPathInside("a/../b", ".")).equal(true);
    });

    it("returns false if a path is not inside another", () => {
      expect(isPathInside("..", ".")).equal(false);
      expect(isPathInside(".", ".")).equal(false);
      expect(isPathInside(".", "./")).equal(false);
      expect(isPathInside("./", ".")).equal(false);
      expect(isPathInside("./", "./")).equal(false);
      expect(isPathInside(".", "a")).equal(false);
      expect(isPathInside(".", "a/")).equal(false);
      expect(isPathInside("./", "a")).equal(false);
      expect(isPathInside("./", "a/")).equal(false);
      expect(isPathInside("a", "a")).equal(false);
      expect(isPathInside("a", "a/")).equal(false);
      expect(isPathInside("a/", "a")).equal(false);
      expect(isPathInside("a/", "a/")).equal(false);
      expect(isPathInside("A/b", "a")).equal(false);
      expect(isPathInside("a/b", "A")).equal(false);
      expect(isPathInside("/", "/")).equal(false);
      expect(isPathInside("/", "/a")).equal(false);
      expect(isPathInside("/", "/a/")).equal(false);
      expect(isPathInside("/a", "/a")).equal(false);
      expect(isPathInside("/a", "/a/")).equal(false);
      expect(isPathInside("/a/", "/a")).equal(false);
      expect(isPathInside("/a/", "/a/")).equal(false);
      expect(isPathInside("/a/b", "/a/b")).equal(false);
      expect(isPathInside("/a/bc/d", "/a/b")).equal(false);
      expect(isPathInside("a/../b", "a")).equal(false);
      expect(isPathInside("a/../b", "b")).equal(false);
    });
  });

  describe("startsWithRelative", () => {
    it("returns false for empty string", () => expect(startsWithRelative("")).equal(false));
    it("returns false for /", () => expect(startsWithRelative("/")).equal(false));
    it("returns false for a", () => expect(startsWithRelative("a")).equal(false));
    it("returns false for a.", () => expect(startsWithRelative("a.")).equal(false));
    it("returns false for a./", () => expect(startsWithRelative("a./")).equal(false));
    it("returns false for a..", () => expect(startsWithRelative("a..")).equal(false));
    it("returns false for a../", () => expect(startsWithRelative("a../")).equal(false));
    it("returns false for a/b/c", () => expect(startsWithRelative("a/b/c")).equal(false));
    it('returns true for "."', () => expect(startsWithRelative(".")).equal(true));
    it('returns true for ".."', () => expect(startsWithRelative("..")).equal(true));
    it('returns true for "./"', () => expect(startsWithRelative("./")).equal(true));
    it('returns true for "../"', () => expect(startsWithRelative("../")).equal(true));
    it('returns true for "./x"', () => expect(startsWithRelative("./x")).equal(true));
    it('returns true for "../x"', () => expect(startsWithRelative("../x")).equal(true));
    it('returns false for ".x"', () => expect(startsWithRelative(".x")).equal(false));
    it('returns false for "..x"', () => expect(startsWithRelative("..x")).equal(false));
    it('returns false for "/.x"', () => expect(startsWithRelative("/.x")).equal(false));
  });

  describe("isRoot", () => {
    it("returns false for a non root", () => expect(isRootPath("/hello")).equal(false));
    it('returns true for "/"', () => expect(isRootPath("/")).equal(true));
    it('returns true for "/../xxx/.././"', () => expect(isRootPath("/../xxx/.././")).equal(true));
  });

  describe("fileDir", () => {
    it("returns empty string for empty string", () => expect(fileDir("")).equal(""));
    it('returns "/" for "/"', () => expect(fileDir("/")).equal("/"));
    it('returns "./" for "."', () => expect(fileDir(".")).equal("./"));
    it('returns "../" for ".."', () => expect(fileDir("..")).equal("../"));
    it('returns "./" for "./"', () => expect(fileDir("./")).equal("./"));
    it('returns "../" for "../"', () => expect(fileDir("../")).equal("../"));
    it('returns "../.././" for "../../"', () => expect(fileDir("../.././")).equal("../../"));
    it('returns "../../" for "../../."', () => expect(fileDir("../../.")).equal("../../"));
    it('returns "../../../" for "../../.."', () => expect(fileDir("../../..")).equal("../../../"));
    it('returns "" for "a"', () => expect(fileDir("a")).equal(""));
    it('returns "/aa/bb/" for "/aa/bb/cc"', () => expect(fileDir("/aa/bb/cc")).equal("/aa/bb/"));
    it('returns "/aa/bb/cc/" for "/aa/bb/cc/"', () => expect(fileDir("/aa/bb/cc/")).equal("/aa/bb/cc/"));
    it('returns "/aa/bb/cc/" for "/aa/bb/cc////"', () => expect(fileDir("/aa/bb/cc////")).equal("/aa/bb/cc/"));
  });

  describe("globNormalize", () => {
    it("normalizes", () => {
      expect(globNormalize("aaa///bbb/./././c/./../d/")).equal("aaa/bbb/d/");
    });
    it("normalizes without eating **", () => {
      expect(globNormalize("aaa*/**/.///../xx//*/./*/../**/..")).equal("aaa*/**/../xx/*/**/..");
    });
  });

  describe("globJoin", () => {
    it("joins globs", () => {
      expect(globJoin(["aaa*", "**", "."], ".///", "../", ["xx", "/*/./*/../**/.."])).equal("aaa*/**/../xx/*/**/..");
    });
  });

  describe("pathFromFileURL", () => {
    it("parses URL objects", () => {
      expect(pathFromFileURL(new URL("file:///home/foo"))).equal("/home/foo");
    });
    it("parses URLLike objects", () => {
      expect(pathFromFileURL({ href: "file:///home/foo" })).equal("/home/foo");
    });
    it("parses files urls", () => {
      expect(pathFromFileURL("file:///")).equal("/");
      expect(pathFromFileURL("file:///home/foo")).equal("/home/foo");
      expect(pathFromFileURL("file:///home/foo%20bar")).equal("/home/foo bar");
      expect(pathFromFileURL("file:///%")).equal("/%");
      expect(pathFromFileURL("file://localhost/foo")).equal("/foo");
      expect(pathFromFileURL("file://localhost/foo/")).equal("/foo/");
      expect(pathFromFileURL("file://localhost/foo////")).equal("/foo/");
      expect(pathFromFileURL("file:///C:")).equal("/C:");
      expect(pathFromFileURL("file:///C:/")).equal("/C:/");
      expect(pathFromFileURL("file:///C:/Users/?xxxx=1#dddd")).equal("/C:/Users/");
      expect(pathFromFileURL("file:///C:foo/bar")).equal("/C:foo/bar");
    });
  });

  test("absolutePathToFileURL", () => {
    expect(absolutePathToFileURL("/home").href).equal("file:///home");
    expect(absolutePathToFileURL("/home/").href).equal("file:///home/");
    expect(absolutePathToFileURL("/home/foo").href).equal("file:///home/foo");
    expect(absolutePathToFileURL("/home/foo/").href).equal("file:///home/foo/");
    expect(absolutePathToFileURL("/home/ ").href).equal("file:///home/%20");
    expect(absolutePathToFileURL("/home/%20").href).equal("file:///home/%2520");
    expect(absolutePathToFileURL("/home\\foo").href).equal("file:///home%5Cfoo");
    expect(absolutePathToFileURL("//localhost/home/foo").href).equal("file:///localhost/home/foo");
    expect(absolutePathToFileURL("//localhost/").href).equal("file:///localhost/");
    expect(absolutePathToFileURL("//:/home/foo").href).equal("file:///:/home/foo");
  });

  describe("resolveFileOrDirectory", () => {
    it("works for root", () => {
      expect(resolveFileOrDirectory("/")).equal("/");
    });

    it("works for /./", () => {
      expect(resolveFileOrDirectory("/./")).equal("/");
    });

    it("works for /.", () => {
      expect(resolveFileOrDirectory("/.")).equal("/");
    });

    it("resolves without ending slash", () => {
      expect(resolveFileOrDirectory("/xxxx/yyy/../zzz/./www")).equal("/xxxx/zzz/www");
    });

    it("resolves with ending slash", () => {
      expect(resolveFileOrDirectory("/xxxx/yyy/../zzz/./www/")).equal("/xxxx/zzz/www/");
    });
  });
});
