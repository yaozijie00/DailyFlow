import type { ComponentType } from "react";
import type { DataDomain } from "../lib/dataVersion";

/**
 * DailyFlow Extension Platform（v0.2 落地 · TS 原生）
 *
 * V1 只做最小集：
 * - Manifest（id/name/version/apiVersion）与唯一 ID
 * - 生命周期：enabled / disabled / error（错误隔离，不阻塞 Core）
 * - Context API（版本化）：Extension 不直接访问 Core 内部，统一走注入的 CoreContext
 * - UI Extension Point：导航页、页面槽位与独立设置分组
 * - 独立启用/禁用（持久化），禁用不删数据
 */

/** Extension API 版本：Extension 声明兼容的版本（V1）。 */
export const EXTENSION_API_VERSION = 1;

/** Extension 可申请的宿主能力。未知能力会在加载阶段被拒绝。 */
export const EXTENSION_CAPABILITIES = [
  "ui.page",
  "ui.today-slot",
  "ui.settings",
  "tasks.read",
  "tasks.write",
  "storage.core",
  "storage.extension",
  "legacy.read",
] as const;

export type ExtensionCapability = (typeof EXTENSION_CAPABILITIES)[number];

const EXTENSION_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export interface ExtensionManifest {
  /** 唯一 ID（不得随 UI 名称变化），如 "com.dailyflow.course-schedule" */
  id: string;
  /** 展示名（可随版本改，ID 不变） */
  name: string;
  description: string;
  version: string;
  /** 声明的 API 兼容版本，须 === EXTENSION_API_VERSION 才会被加载 */
  apiVersion: number;
  /** 扩展需要的宿主能力；省略时按空数组处理，兼容旧 manifest。 */
  capabilities: ExtensionCapability[];
  author?: string;
}

export type ExtensionStatus = "enabled" | "disabled" | "error";

/** 导航贡献：启用后出现在侧栏，点击进入该 Extension 的独立页面。 */
export interface ExtensionNavContribution {
  page: string; // 路由值，如 "ext:course-schedule"
  label: string;
}

/** 页面槽位贡献：注册到 Core 的某个标准扩展点（第一阶段：today）。 */
export type ExtensionSlotId = "today";

/** 设置分组贡献：启用后作为独立分组显示在设置页。id 只需在本扩展内唯一。 */
export interface ExtensionSettingsContribution {
  id: string;
  label: string;
  Component: ComponentType;
}

/** Extension 激活结果：声明它向 Core UI 提供的贡献。 */
export interface ExtensionContributions {
  nav?: ExtensionNavContribution;
  /** slot → React 组件（阶段一：today 槽位，如「今日课程」） */
  slots?: Partial<Record<ExtensionSlotId, ComponentType>>;
  /** 可选设置分组；宿主会自动隔离渲染错误并添加扩展命名空间。 */
  settings?: ExtensionSettingsContribution[];
  /** nav 指向的页面组件 */
  Page?: ComponentType;
}

/** Extension 模块格式：index 默认导出。 */
export interface ExtensionModule {
  manifest: ExtensionManifest;
  activate: (ctx: CoreContext) => ExtensionContributions | void;
  /** 可选异步初始化（如：打开独立库、一次性导入）。失败 → 该扩展标记 error。 */
  init?: (ctx: CoreContext) => Promise<void>;
  /**
   * 可选停用钩子（禁用扩展时调用）：反注册 activate 产生的全局副作用
   * （如成就数据 Provider、全局监听）。不删除任何数据。
   */
  deactivate?: (ctx: CoreContext) => void | Promise<void>;
}

/** 注册到 Registry 的运行时条目。 */
export interface RegisteredExtension {
  manifest: ExtensionManifest;
  activate: (ctx: CoreContext) => ExtensionContributions | void;
}

/** 激活后（含状态）的条目。 */
export interface ActivatedExtension {
  id: string;
  manifest: ExtensionManifest;
  contributions: ExtensionContributions;
  /** 激活期异常（若有）；有则 Core 标记 error 并隐藏其 UI */
  error: string | null;
}

/** Manifest 校验：非法返回 null（跳过并记录，不崩溃）。 */
export function validateManifest(raw: unknown): ExtensionManifest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string" || !EXTENSION_ID_PATTERN.test(m.id)) return null;
  if (typeof m.name !== "string" || m.name.trim() === "") return null;
  if (typeof m.version !== "string" || !SEMVER_PATTERN.test(m.version)) return null;
  if (
    typeof m.apiVersion !== "number" ||
    !Number.isSafeInteger(m.apiVersion) ||
    m.apiVersion < 1
  ) return null;
  const capabilities = m.capabilities ?? [];
  if (!Array.isArray(capabilities)) return null;
  const knownCapabilities = new Set<string>(EXTENSION_CAPABILITIES);
  if (
    capabilities.some(
      (capability) => typeof capability !== "string" || !knownCapabilities.has(capability),
    )
  ) {
    return null;
  }
  return {
    id: m.id,
    name: m.name,
    description: typeof m.description === "string" ? m.description : "",
    version: m.version,
    apiVersion: m.apiVersion,
    capabilities: [...new Set(capabilities)] as ExtensionCapability[],
    author: typeof m.author === "string" ? m.author : undefined,
  };
}

/** 清单格式通过后的宿主兼容性判断；返回 null 表示可以加载。 */
export function getExtensionCompatibilityError(
  manifest: ExtensionManifest,
  hostApiVersion = EXTENSION_API_VERSION,
): string | null {
  if (manifest.apiVersion !== hostApiVersion) {
    return `扩展需要 API ${manifest.apiVersion}，当前宿主提供 API ${hostApiVersion}`;
  }
  return null;
}

/* ==================== Core Context（Extension 唯一访问入口，版本化） ==================== */

export interface CoreTaskCreateInput {
  title: string;
  scheduledDate?: string;
  plannedStart?: number | null;
  plannedEnd?: number | null;
  estimatedDuration?: number | null;
  categoryId?: number | null;
  /** 归属课程（由课程类 Extension 传入，Core 任务系统不解释其语义） */
  courseId?: number | null;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ExtensionStorageMigration {
  version: number;
  migrate: (storage: ExtensionStorage) => Promise<void>;
}

/** 由宿主绑定扩展 ID 的持久化入口；扩展无法指定或读取其它命名空间。 */
export interface ExtensionStorage {
  get: <T extends JsonValue = JsonValue>(key: string) => Promise<T | null>;
  set: (key: string, value: JsonValue) => Promise<void>;
  delete: (key: string) => Promise<boolean>;
  keys: () => Promise<string[]>;
  version: () => Promise<number>;
  migrate: (targetVersion: number, migrations: ExtensionStorageMigration[]) => Promise<void>;
}

/** Extension 可用的 Core 能力（V1 最小集；后续按 API 版本扩展）。 */
export interface CoreContext {
  /** 当前宿主 API 版本 */
  apiVersion: number;
  /** 数据域失效事件。扩展可订阅 Core 变化，并在停用时由宿主自动清理。 */
  events: {
    getVersion: (domain: DataDomain) => number;
    subscribe: (domain: DataDomain, listener: () => void) => () => void;
  };
  /** 当前激活周期的资源清理器；宿主在停用、重试和异常时统一执行。 */
  lifecycle: {
    onDispose: (cleanup: () => void | Promise<void>) => () => void;
  };
  /** 仅向声明 storage.extension 的扩展注入，并自动绑定 manifest.id。 */
  storage?: ExtensionStorage;
  tasks: {
    /** 在指定日期创建任务；成功返回 true。与 Core 今日页创建同一语义。 */
    create: (input: CoreTaskCreateInput) => Promise<boolean>;
    /** 创建任务并返回新任务 id（课程扩展写 task_links 映射用）。 */
    createWithId: (input: CoreTaskCreateInput) => Promise<{ ok: boolean; id: number | null }>;
    /** 按 id 批量回查任务状态（课程成就/周进度用；只暴露最小字段）。 */
    listByIds: (ids: number[]) => Promise<Array<{ id: number; status: string }>>;
    /** 完成任务（Workflow Finish 经用户确认后调用；语义同 Core 今日页「完成」）。 */
    complete: (taskId: number) => Promise<boolean>;
    /** 按日期列出任务最小字段（Workflow 关联任务选择器用；只读，不暴露 Core 内部类型）。 */
    listByDate: (
      date: string,
    ) => Promise<Array<{ id: number; title: string; status: string }>>;
  };
  /** Core 旧数据只读提供（Extension 首次初始化把历史数据迁入自己的库）。 */
  legacy?: {
    listCourses: () => Promise<LegacyCourseSource[]>;
    listSlots: () => Promise<LegacyWeeklySlotSource[]>;
    /** Core 旧 tasks.course_id 关联（回填 task_links 用） */
    listTaskCoursePairs: () => Promise<Array<{ taskId: number; courseId: number }>>;
  };
}

/** Core 旧表 courses 行（数据迁移源）。 */
export interface LegacyCourseSource {
  id: number;
  title: string;
  categoryId: number | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** Core 旧表 weekly_slots 行（数据迁移源）。 */
export interface LegacyWeeklySlotSource {
  id: number;
  courseId: number | null;
  weekday: number;
  startMinutes: number;
  durationMinutes: number;
  createdAt: number;
}
