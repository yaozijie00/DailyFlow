import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { SettingsRepository } from "../db/repositories/settingsRepository";
import { validateManifest, EXTENSION_API_VERSION } from "./types";
import { createExtensionStore } from "./extensionStoreFactory";
import {
  registerCourseCompletedProvider,
  unregisterCourseCompletedProvider,
  getCourseCompletedProvider,
} from "./registry";

describe("Extension Platform（V1）", () => {
  let db: Db;
  let close: () => void;
  let repo: SettingsRepository;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    repo = new SettingsRepository(db);
  });

  afterEach(() => close());

  describe("Manifest 校验", () => {
    it("合法 manifest 通过", () => {
      const m = validateManifest({
        id: "com.dailyflow.course-schedule",
        name: "课程表",
        description: "x",
        version: "1.0.0",
        apiVersion: EXTENSION_API_VERSION,
      });
      expect(m?.id).toBe("com.dailyflow.course-schedule");
      expect(m?.apiVersion).toBe(1);
    });

    it("缺 id / name / version / apiVersion 或非法类型 → null", () => {
      expect(validateManifest(null)).toBeNull();
      expect(validateManifest({ name: "x", version: "1", apiVersion: 1 })).toBeNull();
      expect(validateManifest({ id: "a", name: "x", version: "1" })).toBeNull();
      expect(validateManifest({ id: "a", name: "x", version: "1", apiVersion: "1" })).toBeNull();
    });
  });

  describe("启用/禁用持久化（Rule 03/16：禁用不删数据）", () => {
    it("setEnabled 写入 settings 表并可读回（新 store 实例模拟重启）", async () => {
      const store = createExtensionStore(repo);
      await store.getState().setEnabled("com.dailyflow.test-ext", true);
      expect(await repo.get("ext.com.dailyflow.test-ext.enabled")).toBe("1");

      await store.getState().setEnabled("com.dailyflow.test-ext", false);
      expect(await repo.get("ext.com.dailyflow.test-ext.enabled")).toBe("0");

      // 模拟重启：同一 repo 上新 store
      const restarted = createExtensionStore(repo);
      expect(restarted.getState().enabled).toEqual({});
      // init 只对「已加载扩展」建默认（单元环境无内置扩展，不覆盖此键）
      await restarted.getState().init();
      expect(await repo.get("ext.com.dailyflow.test-ext.enabled")).toBe("0");
    });

    it("isEnabled 默认 false；启用后 true", async () => {
      const store = createExtensionStore(repo);
      expect(store.getState().isEnabled("com.x")).toBe(false);
      await store.getState().setEnabled("com.x", true);
      expect(store.getState().isEnabled("com.x")).toBe(true);
      expect(store.getState().revision).toBeGreaterThan(0);
    });
  });

  describe("停用反注册（禁用=服务停，数据保留）", () => {
    it("课程成就 Provider：register → get 可取 → unregister 后消失", () => {
      const id = "com.dailyflow.test-provider";
      registerCourseCompletedProvider(id, async () => 3);
      expect(getCourseCompletedProvider()).not.toBeNull();
      unregisterCourseCompletedProvider(id);
      expect(getCourseCompletedProvider()).toBeNull();
    });

    it("deactivate 未加载/未知 id 为安全 no-op（不抛错）", async () => {
      const { deactivate } = await import("./registry");
      await expect(deactivate("com.dailyflow.unknown")).resolves.toBeUndefined();
    });
  });
});
