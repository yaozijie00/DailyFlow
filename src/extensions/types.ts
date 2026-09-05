import type { ComponentType } from "react";

/**
 * DailyFlow Extension Platform（v0.2 落地 · TS 原生）
 *
 * V1 只做最小集：
 * - Manifest（id/name/version/apiVersion）与唯一 ID
 * - 生命周期：enabled / disabled / error（错误隔离，不阻塞 Core）
 * - Context API（版本化）：Extension 不直接访问 Core 内部，统一走注入的 CoreContext
 * - UI Extension Point：导航页贡献（独立页面）+ 页面槽位（如 Today 的「今日课程」）
 * - 独立启用/禁用（持久化），禁用不删数据
 */

/** Extension API 版本：Extension 声明兼容的版本（V1）。 */
export const EXTENSION_API_VERSION = 1;

export interface ExtensionManifest {
  /** 唯一 ID（不得随 UI 名称变化），如 "com.dailyflow.course-schedule" */
  id: string;
  /** 展示名（可随版本改，ID 不变） */
  name: string;
  description: string;
  version: string;
  /** 声明的 API 兼容版本，须 === EXTENSION_API_VERSION 才会被加载 */
  apiVersion: number;
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

/** Extension 激活结果：声明它向 Core UI 提供的贡献。 */
export interface ExtensionContributions {
  nav?: ExtensionNavContribution;
  /** slot → React 组件（阶段一：today 槽位，如「今日课程」） */
  slots?: Partial<Record<ExtensionSlotId, ComponentType>>;
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
  if (typeof m.id !== "string" || m.id.trim() === "") return null;
  if (typeof m.name !== "string" || m.name.trim() === "") return null;
  if (typeof m.version !== "string" || m.version.trim() === "") return null;
  if (typeof m.apiVersion !== "number") return null;
  return {
    id: m.id,
    name: m.name,
    description: typeof m.description === "string" ? m.description : "",
    version: m.version,
    apiVersion: m.apiVersion,
    author: typeof m.author === "string" ? m.author : undefined,
  };
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

/** Extension 可用的 Core 能力（V1 最小集；后续按 API 版本扩展）。 */
export interface CoreContext {
  /** 当前宿主 API 版本 */
  apiVersion: number;
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
