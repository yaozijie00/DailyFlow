import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../db/test-helpers";
import type { Db } from "../../../db/db";
import { createExtensionStorage } from "../../storage";
import {
  disposeWorkflowPreferences,
  getWorkflowPreferences,
  initializeWorkflowPreferences,
  saveWorkflowPreferences,
} from "./preferences";

describe("Workflow preferences", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    disposeWorkflowPreferences();
  });
  afterEach(() => {
    disposeWorkflowPreferences();
    close();
  });

  it("首次初始化执行到 v3 并清理 v1 旧键", async () => {
    const storage = createExtensionStorage(db, "com.dailyflow.workflow");
    await initializeWorkflowPreferences(storage);
    expect(await storage.version()).toBe(3);
    expect(await storage.keys()).toEqual(["preferences"]);
    expect(getWorkflowPreferences()).toEqual({
      openEditorAfterCreate: true,
      enableCommandNodes: false,
      rememberNonSensitiveVariables: true,
      defaultFileConflict: "fail",
    });
  });

  it("从 v1 迁移时保留用户关闭状态", async () => {
    const storage = createExtensionStorage(db, "com.dailyflow.workflow");
    await storage.migrate(1, [{
      version: 1,
      migrate: (target) => target.set("open-created", false),
    }]);
    await initializeWorkflowPreferences(storage);
    expect(getWorkflowPreferences().openEditorAfterCreate).toBe(false);
    expect(await storage.get("open-created")).toBeNull();
  });

  it("重复初始化不重跑迁移并能读取已保存偏好", async () => {
    const storage = createExtensionStorage(db, "com.dailyflow.workflow");
    await initializeWorkflowPreferences(storage);
    await saveWorkflowPreferences({ openEditorAfterCreate: false });
    disposeWorkflowPreferences();
    await initializeWorkflowPreferences(storage);
    expect(await storage.version()).toBe(3);
    expect(getWorkflowPreferences().openEditorAfterCreate).toBe(false);
  });

  it("从旧偏好补齐安全默认值并持久化全部字段", async () => {
    const storage = createExtensionStorage(db, "com.dailyflow.workflow");
    await storage.migrate(2, [
      { version: 1, migrate: (target) => target.set("open-created", true) },
      { version: 2, migrate: (target) => target.set("preferences", { openEditorAfterCreate: false }) },
    ]);
    await initializeWorkflowPreferences(storage);
    expect(getWorkflowPreferences()).toEqual({
      openEditorAfterCreate: false,
      enableCommandNodes: false,
      rememberNonSensitiveVariables: true,
      defaultFileConflict: "fail",
    });
  });

  it("持久化失败时不提前修改内存快照", async () => {
    const storage = createExtensionStorage(db, "com.dailyflow.workflow");
    await initializeWorkflowPreferences(storage);
    close();
    close = () => undefined;
    await expect(
      saveWorkflowPreferences({ openEditorAfterCreate: false }),
    ).rejects.toThrow();
    expect(getWorkflowPreferences().openEditorAfterCreate).toBe(true);
  });
});
