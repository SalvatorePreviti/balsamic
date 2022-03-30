import { expect } from "chai";
import _nodePath from "path";
import path from "../../../packages/dev/src/path";
import * as win32 from "../../../packages/dev/src/path/win32";
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
} from "../../../packages/dev/src/path/win32";

const nodeWin32 = _nodePath.win32;

describe("test/dev/path/win32", () => {
  describe("export default", () => {
    it("import default has all import *", () => {
      for (const k of Object.keys(win32.default)) {
        expect((win32 as any)[k]).to.equal((win32.default as any)[k], `key "${k}" / import *`);
      }
    });

    it("import * as all import default", () => {
      for (const k of Object.keys(win32)) {
        expect((win32.default as any)[k]).to.equal((win32 as any)[k], `key "${k}" / import default`);
      }
    });

    it("import * as all node path.win32", () => {
      for (const k of Object.keys(nodeWin32)) {
        if (k !== "win32" && k !== "posix" && k !== "_makeLong") {
          expect((win32 as any)[k]).to.equal((nodeWin32 as any)[k], `key "${k}" in node:win32 / import *`);
        }
      }
    });

    it("import default as all node path.win32", () => {
      for (const k of Object.keys(nodeWin32)) {
        if (k !== "win32" && k !== "posix" && k !== "_makeLong") {
          expect((win32.default as any)[k]).to.equal(
            (nodeWin32 as any)[k],
            `key "${k}" in node:win32 / import default`,
          );
        }
      }
    });

    it("is the same of path.win32", () => {
      expect(path.win32).to.equal(win32);
    });
  });

  it("has valid constants", () => {
    expect(win32.isPosix).to.equal(false);
    expect(win32.isWin32).to.equal(true);
    expect(win32.sep).to.equal(nodeWin32.sep);
    expect(win32.delimiter).to.equal(nodeWin32.delimiter);
  });

  describe("fixSlashes", () => {
    it("does nothing with an empty string", () => expect(fixSlashes("")).to.equal(""));
    it("does nothing with a string without slashes", () => expect(fixSlashes("xxx")).to.equal("xxx"));
    it("does nothing with valid slashes", () => expect(fixSlashes("a\\b\\c\\d")).to.equal("a\\b\\c\\d"));
    it('replaces "/" with "\\"', () => expect(fixSlashes("/")).to.equal("\\"));
    it('replaces "///" with "\\"', () => expect(fixSlashes("///")).to.equal("\\"));
    it('replaces "/aa/b////c\\d/e///" with "\\aa\\b\\c\\d\\e\\"', () =>
      expect(fixSlashes("/aa/b////c\\d/e///")).to.equal("\\aa\\b\\c\\d\\e\\"));
  });

  describe("isRelative", () => {
    it("is true for empty string", () => expect(isRelative("")).to.equal(true));
    it("is true for a word", () => expect(isRelative("hello world")).to.equal(true));
    it('is true for "."', () => expect(isRelative(".")).to.equal(true));
    it('is true for ".."', () => expect(isRelative(".")).to.equal(true));
    it('is true for "./"', () => expect(isRelative("./")).to.equal(true));
    it('is true for "../"', () => expect(isRelative("../")).to.equal(true));
    it('is true for "./xx"', () => expect(isRelative("./xx")).to.equal(true));
    it('is true for "../xx/"', () => expect(isRelative("../xx/")).to.equal(true));
    it('is false for "/"', () => expect(isRelative("/")).to.equal(false));
    it('is false for "/xxx/x"', () => expect(isRelative("/xxx/x")).to.equal(false));
    it('is true for ".\\"', () => expect(isRelative("./")).to.equal(true));
    it('is true for "..\\"', () => expect(isRelative("../")).to.equal(true));
    it('is true for ".\\xx"', () => expect(isRelative("./xx")).to.equal(true));
    it('is true for "..\\xx\\"', () => expect(isRelative("../xx/")).to.equal(true));
    it('is false for "\\"', () => expect(isRelative("/")).to.equal(false));
    it('is false for "\\xxx\\x"', () => expect(isRelative("/xxx/x")).to.equal(false));
  });

  describe("isSep", () => {
    it("returns false for empty string", () => expect(isSep("")).to.equal(false));
    it("returns false for a string", () => expect(isSep("x")).to.equal(false));
    it("returns false for a string", () => expect(isSep("xxx")).to.equal(false));
    it('returns false for "/x"', () => expect(isSep("/x")).to.equal(false));
    it("returns false for 0", () => expect(isSep(0)).to.equal(false));
    it('returns true for "/"', () => expect(isSep("/")).to.equal(true));
    it('returns true for "/" charcode', () => expect(isSep("/".charCodeAt(0))).to.equal(true));
    it('returns true for "\\"', () => expect(isSep("\\")).to.equal(true));
    it('returns true for "\\" charcode', () => expect(isSep("\\".charCodeAt(0))).to.equal(true));
  });

  describe("splitSlashes", () => {
    it("handles empty strings", () => expect(splitSlashes("")).to.eql([""]));
    it("returns one item for a simple string", () => expect(splitSlashes("xxx")).to.eql(["xxx"]));
    it("splits a string with slashes", () => expect(splitSlashes("a/bb\\ccc")).to.eql(["a", "bb", "ccc"]));
    it("splits a string with repeated slashes", () =>
      expect(splitSlashes("/a\\\\bb//ccc/\\")).to.eql(["", "a", "bb", "ccc", ""]));
  });

  describe("startsWithSlash", () => {
    it("returns false for an empty string", () => expect(startsWithSlash("")).to.equal(false));
    it("returns false for a string", () => expect(startsWithSlash("xxx")).to.equal(false));
    it('returns true for "\\"', () => expect(startsWithSlash("\\")).to.equal(true));
    it('returns true for "/"', () => expect(startsWithSlash("/")).to.equal(true));
    it('returns true for a string starting with "\\"', () => expect(startsWithSlash("\\xxxx")).to.equal(true));
    it('returns true for a string starting with "/"', () => expect(startsWithSlash("/xxx")).to.equal(true));
  });

  describe("endsWithSlash", () => {
    it("returns false for an empty string", () => expect(endsWithSlash("")).to.equal(false));
    it("returns false for a string", () => expect(endsWithSlash("xxx")).to.equal(false));
    it('returns true for "\\"', () => expect(endsWithSlash("\\")).to.equal(true));
    it('returns true for "/"', () => expect(endsWithSlash("/")).to.equal(true));
    it('returns true for a string ending with "\\"', () => expect(endsWithSlash("xxxx\\")).to.equal(true));
    it('returns true for a string ending with "/"', () => expect(endsWithSlash("xxx/")).to.equal(true));
  });

  describe("removeTrailingSlash", () => {
    it("does nothing for an empty string", () => expect(removeTrailingSlash("")).to.equal(""));
    it('does nothing for "/"', () => expect(removeTrailingSlash("/")).to.equal("/"));
    it('does nothing for "\\"', () => expect(removeTrailingSlash("\\")).to.equal("\\"));
    it('does nothing for a string not ending with "/"', () => expect(removeTrailingSlash("/a//bb")).to.equal("/a//bb"));
    it('removes / for "./"', () => expect(removeTrailingSlash("./")).to.equal("."));
    it('removes / for "../"', () => expect(removeTrailingSlash("../")).to.equal(".."));
    it('removes / for "/xx/yy/"', () => expect(removeTrailingSlash("/xx/yy/")).to.equal("/xx/yy"));
    it("removes multiple ending slashes", () => expect(removeTrailingSlash("/xx/////")).to.equal("/xx"));
    it('removes \\ for ".\\"', () => expect(removeTrailingSlash(".\\")).to.equal("."));
    it('removes \\ for "..\\"', () => expect(removeTrailingSlash("..\\")).to.equal(".."));
    it('removes \\ for "\\xx\\yy\\"', () => expect(removeTrailingSlash("\\xx\\yy\\")).to.equal("\\xx\\yy"));
    it("removes multiple ending slashes", () => expect(removeTrailingSlash("xx\\\\\\\\")).to.equal("xx"));
  });

  describe("appendTrailingSlash", () => {
    it("does nothing to an empty string", () => expect(appendTrailingSlash("")).to.equal(""));
    it("does nothing for \\", () => expect(appendTrailingSlash("\\")).to.equal("\\"));
    it("fixes double slashes", () => expect(appendTrailingSlash("\\.\\\\")).to.equal("\\"));
    it("fixes double posix slashes", () => expect(appendTrailingSlash("\\//./\\")).to.equal("/"));
    it("does nothing for xx\\", () => expect(appendTrailingSlash("xx\\")).to.equal("xx\\"));
    it("appends \\ to a path", () => expect(appendTrailingSlash("\\x\\y\\z")).to.equal("\\x\\y\\z\\"));
    it("treats / as \\", () => expect(appendTrailingSlash("a/b/")).to.equal("a/b/"));
    it("treats properly ./", () => expect(appendTrailingSlash("./")).to.equal("./"));
    it("treats properly .\\", () => expect(appendTrailingSlash(".\\")).to.equal(".\\"));
    it("treats properly ../", () => expect(appendTrailingSlash("../")).to.equal("../"));
    it("treats properly ..\\", () => expect(appendTrailingSlash("..\\")).to.equal("..\\"));
    it("treats properly .", () => expect(appendTrailingSlash(".")).to.equal(".\\"));
    it("treats properly ..", () => expect(appendTrailingSlash("..")).to.equal("..\\"));
    it("treats properly ./.", () => expect(appendTrailingSlash("./.")).to.equal("./"));
    it("treats properly ../.", () => expect(appendTrailingSlash("../.")).to.equal("../"));
    it("treats properly .\\.", () => expect(appendTrailingSlash(".\\.")).to.equal(".\\"));
    it("treats properly ..\\.", () => expect(appendTrailingSlash("..\\.")).to.equal("..\\"));
  });

  describe("isPathInside", () => {
    describe("with posix slashes", () => {
      it("returns true if a path is inside another", () => {
        expect(isPathInside("../a", "/")).to.equal(true);
        expect(isPathInside("../a/", "/")).to.equal(true);
        expect(isPathInside("/a", "/")).to.equal(true);
        expect(isPathInside("/a/", "/")).to.equal(true);
        expect(isPathInside("/a/b", "/a")).to.equal(true);
        expect(isPathInside("/a/b", "/a/")).to.equal(true);
        expect(isPathInside("/a/b/", "/a")).to.equal(true);
        expect(isPathInside("/a/b/", "/a/")).to.equal(true);
        expect(isPathInside("/a/b/c", "/")).to.equal(true);
        expect(isPathInside("/a/b/c/", "/")).to.equal(true);
        expect(isPathInside("/a/b/c", "/a/b")).to.equal(true);
        expect(isPathInside("/a/b/c", "/a/b/")).to.equal(true);
        expect(isPathInside("/a/b/c/", "/a/b")).to.equal(true);
        expect(isPathInside("/a/b/c/", "/a/b/")).to.equal(true);
        expect(isPathInside("a", "/")).to.equal(true);
        expect(isPathInside("a", ".")).to.equal(true);
        expect(isPathInside("a", "./")).to.equal(true);
        expect(isPathInside("a", "..")).to.equal(true);
        expect(isPathInside("a", "../")).to.equal(true);
        expect(isPathInside("a/", "/")).to.equal(true);
        expect(isPathInside("a/", ".")).to.equal(true);
        expect(isPathInside("a/", "./")).to.equal(true);
        expect(isPathInside("a/", "..")).to.equal(true);
        expect(isPathInside("a/", "../")).to.equal(true);
        expect(isPathInside("a/b", "a")).to.equal(true);
        expect(isPathInside("a/b", "a/")).to.equal(true);
        expect(isPathInside("a/b/", "a")).to.equal(true);
        expect(isPathInside("a/b/", "a/")).to.equal(true);
        expect(isPathInside("a/b/c", "a/b")).to.equal(true);
        expect(isPathInside("a/b/c", "a/b/")).to.equal(true);
        expect(isPathInside("a/b/c/", "a/b")).to.equal(true);
        expect(isPathInside("a/b/c/", "a/b/")).to.equal(true);
        expect(isPathInside("A/b", "A")).to.equal(true);
        expect(isPathInside("A/b", "a")).to.equal(true);
        expect(isPathInside("a/b", "A")).to.equal(true);
        expect(isPathInside("a/../b", ".")).to.equal(true);
      });

      it("returns false if a path is not inside another", () => {
        expect(isPathInside("..", ".")).to.equal(false);
        expect(isPathInside(".", ".")).to.equal(false);
        expect(isPathInside(".", "./")).to.equal(false);
        expect(isPathInside("./", ".")).to.equal(false);
        expect(isPathInside("./", "./")).to.equal(false);
        expect(isPathInside(".", "a")).to.equal(false);
        expect(isPathInside(".", "a/")).to.equal(false);
        expect(isPathInside("./", "a")).to.equal(false);
        expect(isPathInside("./", "a/")).to.equal(false);
        expect(isPathInside("a", "a")).to.equal(false);
        expect(isPathInside("a", "a/")).to.equal(false);
        expect(isPathInside("a/", "a")).to.equal(false);
        expect(isPathInside("a/", "a/")).to.equal(false);
        expect(isPathInside("/", "/")).to.equal(false);
        expect(isPathInside("/", "/a")).to.equal(false);
        expect(isPathInside("/", "/a/")).to.equal(false);
        expect(isPathInside("/a", "/a")).to.equal(false);
        expect(isPathInside("/a", "/a/")).to.equal(false);
        expect(isPathInside("/a/", "/a")).to.equal(false);
        expect(isPathInside("/a/", "/a/")).to.equal(false);
        expect(isPathInside("/a/b", "/a/b")).to.equal(false);
        expect(isPathInside("/a/bc/d", "/a/b")).to.equal(false);
        expect(isPathInside("a/../b", "a")).to.equal(false);
        expect(isPathInside("a/../b", "b")).to.equal(false);
      });
    });

    describe("windows slash", () => {
      it("returns true if path is inside", () => {
        expect(isPathInside("c:\\a\\b", "C:\\a")).to.equal(true);
        expect(isPathInside("c:\\a\\b\\c\\d", "C:\\a\\b\\c")).to.equal(true);
        expect(isPathInside("a", "\\")).to.equal(true);
        expect(isPathInside("a", ".")).to.equal(true);
        expect(isPathInside("a", ".\\")).to.equal(true);
        expect(isPathInside("a", "..")).to.equal(true);
        expect(isPathInside("a", "..\\")).to.equal(true);
        expect(isPathInside("a\\", "\\")).to.equal(true);
        expect(isPathInside("a\\", ".")).to.equal(true);
        expect(isPathInside("a\\", ".\\")).to.equal(true);
        expect(isPathInside("a\\", "..")).to.equal(true);
        expect(isPathInside("a\\", "..\\")).to.equal(true);
        expect(isPathInside("a\\b", "a")).to.equal(true);
        expect(isPathInside("a\\b", "a\\")).to.equal(true);
        expect(isPathInside("a\\b\\", "a")).to.equal(true);
        expect(isPathInside("a\\b\\", "a\\")).to.equal(true);
        expect(isPathInside("A\\b", "A")).to.equal(true);
        expect(isPathInside("A\\b", "a")).to.equal(true);
        expect(isPathInside("a\\b", "A")).to.equal(true);
        expect(isPathInside("a\\b\\c", "a\\b")).to.equal(true);
        expect(isPathInside("a\\b\\c", "a\\b\\")).to.equal(true);
        expect(isPathInside("a\\b\\c\\", "a\\b")).to.equal(true);
        expect(isPathInside("a\\b\\c\\", "a\\b\\")).to.equal(true);
        expect(isPathInside("A\\b\\c", "a\\b")).to.equal(true);
        expect(isPathInside("a\\..\\b", ".")).to.equal(true);
        expect(isPathInside("..\\a", "\\")).to.equal(true);
        expect(isPathInside("..\\a\\", "\\")).to.equal(true);
        expect(isPathInside("\\a", "\\")).to.equal(true);
        expect(isPathInside("\\a\\", "\\")).to.equal(true);
        expect(isPathInside("\\a\\b", "\\a")).to.equal(true);
        expect(isPathInside("\\a\\b", "\\a\\")).to.equal(true);
        expect(isPathInside("\\a\\b\\", "\\a")).to.equal(true);
        expect(isPathInside("\\a\\b\\", "\\a\\")).to.equal(true);
      });

      it("returns false if path is not inside", () => {
        expect(isPathInside("A\\b", "a\\b")).to.equal(false);
        expect(isPathInside("C:\\a\\b", "c:\\a\\b")).to.equal(false);
        expect(isPathInside("C:\\a\\b", "D:\\a")).to.equal(false);
        expect(isPathInside("a\\bc\\d", "a\\b")).to.equal(false);
        expect(isPathInside("a\\..\\b", "a")).to.equal(false);
        expect(isPathInside("a\\..\\b", "b")).to.equal(false);
        expect(isPathInside("..", ".")).to.equal(false);
        expect(isPathInside(".", ".")).to.equal(false);
        expect(isPathInside(".", ".\\")).to.equal(false);
        expect(isPathInside(".\\", ".")).to.equal(false);
        expect(isPathInside(".\\", ".\\")).to.equal(false);
        expect(isPathInside(".", "a")).to.equal(false);
        expect(isPathInside(".", "a\\")).to.equal(false);
        expect(isPathInside(".\\", "a")).to.equal(false);
        expect(isPathInside(".\\", "a\\")).to.equal(false);
        expect(isPathInside("a", "a")).to.equal(false);
        expect(isPathInside("a", "a\\")).to.equal(false);
        expect(isPathInside("a\\", "a")).to.equal(false);
        expect(isPathInside("a\\", "a\\")).to.equal(false);
        expect(isPathInside("\\", "\\")).to.equal(false);
        expect(isPathInside("\\", "\\a")).to.equal(false);
        expect(isPathInside("\\", "\\a\\")).to.equal(false);
        expect(isPathInside("\\a", "\\a")).to.equal(false);
        expect(isPathInside("\\a", "\\a\\")).to.equal(false);
        expect(isPathInside("\\a\\", "\\a")).to.equal(false);
        expect(isPathInside("\\a\\", "\\a\\")).to.equal(false);
        expect(isPathInside("\\a\\b", "\\a\\b")).to.equal(false);
        expect(isPathInside("\\a\\bc\\d", "\\a\\b")).to.equal(false);
        expect(isPathInside("C:\\a\\b\\c", "c:\\a\\b\\c")).to.equal(false);
      });
    });
  });

  describe("startsWithRelative", () => {
    it("returns false for empty string", () => expect(startsWithRelative("")).to.equal(false));
    it("returns false for /", () => expect(startsWithRelative("/")).to.equal(false));
    it("returns false for a", () => expect(startsWithRelative("a")).to.equal(false));
    it("returns false for a.", () => expect(startsWithRelative("a.")).to.equal(false));
    it("returns false for a./", () => expect(startsWithRelative("a./")).to.equal(false));
    it("returns false for a..", () => expect(startsWithRelative("a..")).to.equal(false));
    it("returns false for a../", () => expect(startsWithRelative("a../")).to.equal(false));
    it("returns false for a/b/c", () => expect(startsWithRelative("a/b/c")).to.equal(false));
    it('returns true for "."', () => expect(startsWithRelative(".")).to.equal(true));
    it('returns true for ".."', () => expect(startsWithRelative("..")).to.equal(true));
    it('returns true for "./"', () => expect(startsWithRelative("./")).to.equal(true));
    it('returns true for "../"', () => expect(startsWithRelative("../")).to.equal(true));
    it('returns true for "./x"', () => expect(startsWithRelative("./x")).to.equal(true));
    it('returns true for "../x"', () => expect(startsWithRelative("../x")).to.equal(true));
    it('returns false for ".x"', () => expect(startsWithRelative(".x")).to.equal(false));
    it('returns false for "..x"', () => expect(startsWithRelative("..x")).to.equal(false));
    it('returns false for "/.x"', () => expect(startsWithRelative("/.x")).to.equal(false));
  });

  describe("isRoot", () => {
    it("returns false for a non root", () => expect(isRootPath("/hello")).to.equal(false));
    it('returns true for "/"', () => expect(isRootPath("/")).to.equal(true));
    it('returns true for "/../xxx/.././"', () => expect(isRootPath("/../xxx/.././")).to.equal(true));
    it('returns false for "c:"', () => expect(isRootPath("c:")).to.equal(false));
    it('returns true for "c:\\"', () => expect(isRootPath("c:\\")).to.equal(true));
    it('returns true for "c:\\..\\xxx/..\\./"', () => expect(isRootPath("c:\\..\\xxx/..\\./")).to.equal(true));
  });

  describe("fileDir", () => {
    it("returns empty string for empty string", () => expect(fileDir("")).to.equal(""));
    it('returns "/" for "/"', () => expect(fileDir("/")).to.equal("/"));
    it('returns ".\\" for "."', () => expect(fileDir(".")).to.equal(".\\"));
    it('returns "../" for ".."', () => expect(fileDir("..")).to.equal("..\\"));
    it('returns "./" for "./"', () => expect(fileDir("./")).to.equal("./"));
    it('returns "../" for "../"', () => expect(fileDir("../")).to.equal("../"));
    it('returns "../.././" for "../../"', () => expect(fileDir("../.././")).to.equal("../../"));
    it('returns "../../" for "../../."', () => expect(fileDir("../../.")).to.equal("../../"));
    it('returns "../../../" for "../../.."', () => expect(fileDir("../../..")).to.equal("../../../"));
    it('returns "" for "a"', () => expect(fileDir("a")).to.equal(""));
    it('returns "/aa/bb/" for "/aa/bb/cc"', () => expect(fileDir("/aa/bb/cc")).to.equal("/aa/bb/"));
    it('returns "/aa/bb/cc/" for "/aa/bb/cc/"', () => expect(fileDir("/aa/bb/cc/")).to.equal("/aa/bb/cc/"));
    it('returns "/aa/bb/cc/" for "/aa/bb/cc////"', () => expect(fileDir("/aa/bb/cc////")).to.equal("/aa/bb/cc/"));

    it('returns ".\\" for ".\\"', () => expect(fileDir(".\\")).to.equal(".\\"));
    it('returns "..\\" for "..\\"', () => expect(fileDir("..\\")).to.equal("..\\"));
    it('returns "..\\..\\.\\" for "..\\..\\"', () => expect(fileDir("..\\..\\.\\")).to.equal("..\\..\\"));
    it('returns "..\\..\\" for "..\\..\\."', () => expect(fileDir("..\\..\\.")).to.equal("..\\..\\"));
    it('returns "..\\..\\..\\" for "..\\..\\.."', () => expect(fileDir("..\\..\\..")).to.equal("..\\..\\..\\"));

    it('returns "\\aa\\bb\\" for "\\aa\\bb\\cc"', () => expect(fileDir("\\aa\\bb\\cc")).to.equal("\\aa\\bb\\"));
    it('returns "\\aa\\bb\\cc\\" for "\\aa\\bb\\cc\\"', () =>
      expect(fileDir("\\aa\\bb\\cc\\")).to.equal("\\aa\\bb\\cc\\"));
    it('returns "\\aa\\bb\\cc\\" for "\\aa\\bb\\cc\\\\\\\\"', () =>
      expect(fileDir("\\aa\\bb\\cc\\\\\\\\")).to.equal("\\aa\\bb\\cc\\"));
  });

  describe("globNormalize", () => {
    it("normalizes", () => {
      expect(globNormalize("aaa\\//bbb\\./././c/.\\../d\\")).to.equal("aaa\\bbb\\d\\");
    });
    it("normalizes without eating **", () => {
      expect(globNormalize("aaa*\\**\\.\\//../xx\\/*/.\\*/..\\**/..")).to.equal("aaa*\\**\\..\\xx\\*\\**\\..");
    });
  });

  describe("globJoin", () => {
    it("joins globs", () => {
      expect(globJoin(["b*", "**", "."], "./\\/", "../", ["a", "x", "..", "/*\\./*/../**/.."])).to.equal(
        "b*\\**\\..\\a\\*\\**\\..",
      );
    });
  });

  describe("pathFromFileURL", () => {
    it("parses URL objects", () => {
      expect(pathFromFileURL(new URL("file:///home/foo")), "\\home\\foo");
    });
    it("parses URLLike objects", () => {
      expect(pathFromFileURL({ href: "file:///home/foo" }), "\\home\\foo");
    });
    it("parses files urls", () => {
      expect(pathFromFileURL("file:///")).to.equal("\\");
      expect(pathFromFileURL("file:///home/foo")).to.equal("\\home\\foo");
      expect(pathFromFileURL("file:///home/foo///")).to.equal("\\home\\foo\\");
      expect(pathFromFileURL("file:///home/foo%20bar")).to.equal("\\home\\foo bar");
      expect(pathFromFileURL("file:///%")).to.equal("\\%");
      expect(pathFromFileURL("file://127.0.0.1/foo/xx")).to.equal("\\\\127.0.0.1\\foo\\xx");
      expect(pathFromFileURL("file://127.0.0.1/foo")).to.equal("\\\\127.0.0.1\\foo");
      expect(pathFromFileURL("file://localhost/foo")).to.equal("\\foo");
      expect(pathFromFileURL("file:///C:")).to.equal("C:\\");
      expect(pathFromFileURL("file:///C:/")).to.equal("C:\\");
      expect(pathFromFileURL("file://localhost/C:/")).to.equal("C:\\");
      expect(pathFromFileURL("file:///C:/Users/")).to.equal("C:\\Users\\");
      expect(pathFromFileURL("file:///C:foo/bar")).to.equal("\\C:foo\\bar");
    });
  });

  describe("", () => {
    expect(absolutePathToFileURL("/home/foo").href).to.equal("file:///home/foo");
    expect(absolutePathToFileURL("/home/ ").href).to.equal("file:///home/%20");
    expect(absolutePathToFileURL("/home/%20").href).to.equal("file:///home/%2520");
    expect(absolutePathToFileURL("/home\\foo").href).to.equal("file:///home/foo");
    expect(absolutePathToFileURL("C:/").href).to.equal("file:///C:/");
    expect(absolutePathToFileURL("//localhost/home/foo").href).to.equal("file:///home/foo");
    expect(absolutePathToFileURL("//127.0.0.1/home/foo").href).to.equal("file://127.0.0.1/home/foo");
    expect(absolutePathToFileURL("//localhost/").href).to.equal("file:///");
    expect(absolutePathToFileURL("//127.0.0.1/").href).to.equal("file://127.0.0.1/");
    expect(absolutePathToFileURL("//:/home/foo").href).to.equal("file:///home/foo");
  });

  describe("resolveFileOrDirectory", () => {
    it("resolves without ending slash", () => {
      expect(resolveFileOrDirectory("c:\\xxxx\\yyy/../zzz/./www")).to.equal("c:\\xxxx\\zzz\\www");
    });

    it("resolves with ending slash", () => {
      expect(resolveFileOrDirectory("c:\\xxxx/yyy/../zzz/./www/")).to.equal("c:\\xxxx\\zzz\\www\\");
    });
  });
});
