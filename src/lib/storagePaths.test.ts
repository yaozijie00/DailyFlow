import { describe, expect, test } from "vitest";
import { validateStoragePaths } from "./storagePaths";

describe("validateStoragePaths", () => {
  test("空路径合法（用默认值）", () => {
    expect(validateStoragePaths({ dataDir: "", cacheDir: "", backupDir: "" })).toEqual({});
  });
  test("Windows 绝对路径合法", () => {
    expect(
      validateStoragePaths({
        dataDir: "C:\\Users\\me\\DailyFlow",
        cacheDir: "D:\\cache",
        backupDir: "C:\\Users\\me\\backups",
      }),
    ).toEqual({});
  });
  test("相对路径报错", () => {
    const e = validateStoragePaths({ dataDir: "DailyFlow", cacheDir: "", backupDir: "" });
    expect(e.dataDir).toContain("绝对路径");
  });
  test("非法字符报错", () => {
    const e = validateStoragePaths({ dataDir: "C:\\a<b", cacheDir: "", backupDir: "" });
    expect(e.dataDir).toContain("非法字符");
  });
  test("UNC 共享路径合法，无共享名的 UNC 非法", () => {
    expect(
      validateStoragePaths({ dataDir: "\\\\server\\share\\data", cacheDir: "", backupDir: "" }),
    ).toEqual({});
    const e = validateStoragePaths({ dataDir: "\\\\server", cacheDir: "", backupDir: "" });
    expect(e.dataDir).toContain("绝对路径");
  });
  test("C:/ 正斜杠形式合法，盘符相对路径 C:foo 非法", () => {
    expect(
      validateStoragePaths({ dataDir: "C:/Users/me/Data", cacheDir: "", backupDir: "" }),
    ).toEqual({});
    const e = validateStoragePaths({ dataDir: "C:foo", cacheDir: "", backupDir: "" });
    expect(e.dataDir).toContain("绝对路径");
  });
  test("逐字段错误契约：合法字段不进入 errors", () => {
    const e = validateStoragePaths({
      dataDir: "DailyFlow", // 非法
      cacheDir: "C:\\cache", // 合法
      backupDir: "C:\\backups", // 合法
    });
    expect(e).toEqual({ dataDir: "必须是绝对路径（如 C:\\Users\\...）" });
  });
});
