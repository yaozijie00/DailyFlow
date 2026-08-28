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
});
