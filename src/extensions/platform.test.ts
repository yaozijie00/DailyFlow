import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { SettingsRepository } from "../db/repositories/settingsRepository";
import {
  validateManifest,
  getExtensionCompatibilityError,
  EXTENSION_API_VERSION,
  type CoreContext,
} from "./types";
import { createExtensionStore } from "./extensionStoreFactory";
import {
  registerCourseCompletedProvider,
  unregisterCourseCompletedProvider,
  getCourseCompletedProvider,
  scopeContextCapabilities,
  validateContributions,
  validateContributionCapabilities,
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
      expect(m?.capabilities).toEqual([]);
    });

    it("接受已知能力并拒绝未知能力", () => {
      const base = {
        id: "com.dailyflow.test",
        name: "Test",
        version: "1.0.0",
        apiVersion: EXTENSION_API_VERSION,
      };
      expect(
        validateManifest({ ...base, capabilities: ["ui.page", "tasks.read"] })?.capabilities,
      ).toEqual(["ui.page", "tasks.read"]);
      expect(validateManifest({ ...base, capabilities: ["system.shell"] })).toBeNull();
      expect(validateManifest({ ...base, capabilities: "tasks.read" })).toBeNull();
    });

    it("缺 id / name / version / apiVersion 或非法类型 → null", () => {
      expect(validateManifest(null)).toBeNull();
      expect(validateManifest({ name: "x", version: "1", apiVersion: 1 })).toBeNull();
      expect(validateManifest({ id: "a", name: "x", version: "1" })).toBeNull();
      expect(validateManifest({ id: "a", name: "x", version: "1", apiVersion: "1" })).toBeNull();
    });

    it("要求反向域名 ID、SemVer 和正整数 API 版本", () => {
      const base = {
        id: "com.example.valid-extension",
        name: "Valid",
        description: "",
        version: "1.2.3-beta.1+build.5",
        apiVersion: 1,
      };
      expect(validateManifest(base)).not.toBeNull();
      expect(validateManifest({ ...base, id: "Workflow" })).toBeNull();
      expect(validateManifest({ ...base, version: "1.2" })).toBeNull();
      expect(validateManifest({ ...base, apiVersion: 1.5 })).toBeNull();
      expect(validateManifest({ ...base, apiVersion: 0 })).toBeNull();
    });

    it("API 版本不一致时返回可诊断的兼容错误", () => {
      const manifest = validateManifest({
        id: "com.example.future",
        name: "Future",
        description: "",
        version: "1.0.0",
        apiVersion: 2,
      });
      expect(manifest).not.toBeNull();
      expect(getExtensionCompatibilityError(manifest!, 1)).toMatch(/需要 API 2.*提供 API 1/);
      expect(getExtensionCompatibilityError({ ...manifest!, apiVersion: 1 }, 1)).toBeNull();
    });
  });

  describe("UI 贡献隔离", () => {
    const Page = () => null;

    it("只允许 ext: 命名空间并拒绝重复路由", () => {
      expect(
        validateContributions("com.a", { nav: { page: "today", label: "A" }, Page }, new Map()),
      ).toMatch(/ext:/);
      expect(
        validateContributions(
          "com.b",
          { nav: { page: "ext:shared", label: "B" }, Page },
          new Map([["ext:shared", "com.a"]]),
        ),
      ).toMatch(/com\.a/);
    });

    it("导航与页面必须成对声明", () => {
      expect(validateContributions("com.a", { Page }, new Map())).toMatch(/nav/);
      expect(
        validateContributions("com.a", { nav: { page: "ext:a", label: "A" } }, new Map()),
      ).toMatch(/Page/);
    });

    it("扩展设置分组必须使用非空且不重复的本地 ID", () => {
      expect(
        validateContributions(
          "com.a",
          {
            settings: [
              { id: "account", label: "账户", Component: Page },
              { id: "account", label: "同步", Component: Page },
            ],
          },
          new Map(),
        ),
      ).toMatch(/设置分组 ID 重复/);
      expect(
        validateContributions(
          "com.a",
          { settings: [{ id: " ", label: "同步", Component: Page }] },
          new Map(),
        ),
      ).toMatch(/设置分组 ID/);
    });

    it("UI 贡献必须声明对应能力", () => {
      const contributions = {
        nav: { page: "ext:a", label: "A" },
        Page,
        slots: { today: Page },
        settings: [{ id: "main", label: "设置", Component: Page }],
      };
      expect(validateContributionCapabilities([], contributions)).toMatch(/ui\.page/);
      expect(validateContributionCapabilities(["ui.page"], contributions)).toMatch(
        /ui\.today-slot/,
      );
      expect(
        validateContributionCapabilities(["ui.page", "ui.today-slot"], contributions),
      ).toMatch(/ui\.settings/);
      expect(
        validateContributionCapabilities(
          ["ui.page", "ui.today-slot", "ui.settings"],
          contributions,
        ),
      ).toBeNull();
    });
  });

  describe("宿主能力限制", () => {
    it("只读扩展可以查询任务，但不能写任务或读取旧数据", async () => {
      const listByDate = vi.fn(async () => [{ id: 1, title: "A", status: "TODO" }]);
      const create = vi.fn(async () => true);
      const ctx = {
        apiVersion: EXTENSION_API_VERSION,
        events: { getVersion: () => 0, subscribe: () => () => undefined },
        lifecycle: { onDispose: () => () => undefined },
        storage: {
          get: async () => null,
          set: async () => undefined,
          delete: async () => false,
          keys: async () => [],
          version: async () => 0,
          migrate: async () => undefined,
        },
        tasks: {
          create,
          createWithId: async () => ({ ok: true, id: 1 }),
          listByIds: async () => [],
          complete: async () => true,
          listByDate,
        },
        legacy: {
          listCourses: async () => [],
          listSlots: async () => [],
          listTaskCoursePairs: async () => [],
        },
      } satisfies CoreContext;

      const scoped = scopeContextCapabilities(ctx, ["tasks.read"]);
      await expect(scoped.tasks.listByDate("2026-09-09")).resolves.toHaveLength(1);
      await expect(scoped.tasks.create({ title: "B" })).rejects.toThrow(/tasks\.write/);
      expect(create).not.toHaveBeenCalled();
      expect(scoped.storage).toBeUndefined();
      expect(scoped.legacy).toBeUndefined();

      const storageScoped = scopeContextCapabilities(ctx, ["storage.extension"]);
      expect(storageScoped.storage).toBe(ctx.storage);
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
