import type { ComponentType } from "react";
import {
  EXTENSION_API_VERSION,
  validateManifest,
  type ActivatedExtension,
  type CoreContext,
  type ExtensionContributions,
  type ExtensionManifest,
  type ExtensionModule,
  type ExtensionSlotId,
} from "./types";

/**
 * Extension Registry（属于 Core 的 Extension Host）。
 * - 内置 Extension 目录：src/extensions/builtin/<id>/index.ts（懒加载，Core 不硬编码其实现）；
 * - loadAll()：逐个动态导入并激活，异常只影响自身（status: error），不阻塞 Core 启动；
 * - API 版本不匹配的模块整体跳过；
 * - UI（导航/页面/槽位）一律通过本 Registry 查询，禁止 Core 直接 import 具体 Extension。
 */

// 懒加载映射：目录名 = Extension 存放目录（manifest 校验在 loadAll 内完成）
const builtinLoaders = import.meta.glob("./builtin/*/index.ts") as Record<
  string,
  () => Promise<unknown>
>;

interface LoadedEntry {
  id: string;
  manifest: ExtensionManifest;
  activate: (ctx: CoreContext) => ExtensionContributions | void;
  init?: (ctx: CoreContext) => Promise<void>;
  /** 停用钩子：禁用扩展时反注册全局副作用（不删数据）。 */
  deactivate?: (ctx: CoreContext) => void | Promise<void>;
}

const loaded: LoadedEntry[] = [];
const activated = new Map<string, ActivatedExtension>();
let hostCtx: CoreContext | null = null;

/** 逐个激活（异常隔离）；init（可选异步初始化）先于 activate 执行，失败仅标记该扩展 error。 */
async function activateEntry(entry: LoadedEntry): Promise<void> {
  const ctx = hostCtx;
  if (!ctx) return; // Context 尚未注入（Core 启动流程保证先 init 再激活）
  try {
    if (entry.init) {
      await entry.init(ctx);
    }
    const contributions: ExtensionContributions = entry.activate(ctx) ?? {};
    activated.set(entry.id, {
      id: entry.id,
      manifest: entry.manifest,
      contributions,
      error: null,
    });
  } catch (e) {
    activated.set(entry.id, {
      id: entry.id,
      manifest: entry.manifest,
      contributions: {},
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * 停用扩展（禁用时由 Extension Store 调用）：
 * 1. 调用扩展可选 deactivate 钩子（反注册全局副作用，不删数据）；
 * 2. 从 activated 移除 → 其导航/页面/槽位贡献立即消失（路由不可达）。
 * 未加载/未激活的 id 为安全 no-op。
 */
export async function deactivate(id: string): Promise<void> {
  const ctx = hostCtx;
  const entry = loaded.find((e) => e.id === id);
  if (entry?.deactivate && ctx) {
    try {
      await entry.deactivate(ctx);
    } catch {
      // 停用钩子异常不阻塞停用（数据保留优先）
    }
  }
  activated.delete(id);
}

/** 重新激活单个（启用时或设置页「重试」用；需已注入 Context）。 */
export async function reactivate(id: string): Promise<void> {
  const entry = loaded.find((e) => e.id === id);
  if (!entry) return;
  await activateEntry(entry);
}

/**
 * 加载全部内置 Extension 模块（幂等；只加载不激活）。
 * 由 Core 在数据库就绪后调用并注入 CoreContext（Extension 只能通过它访问 Core）；
 * 激活由 Extension Store 按持久化的 enabled 标志逐个执行（reactivate），
 * 保证「禁用的扩展不 init / 不 activate」（服务停）。
 */
export async function loadAll(ctx?: CoreContext): Promise<void> {
  if (ctx) hostCtx = ctx;
  if (loaded.length > 0) return; // 已加载过
  for (const path of Object.keys(builtinLoaders)) {
    try {
      const mod = ((await builtinLoaders[path]()) ?? {}) as Partial<ExtensionModule>;
      const manifest = validateManifest(mod.manifest);
      if (!manifest || manifest.apiVersion !== EXTENSION_API_VERSION) continue;
      if (typeof mod.activate !== "function") continue;
      loaded.push({
        id: manifest.id,
        manifest,
        activate: mod.activate,
        ...(typeof mod.init === "function" ? { init: mod.init } : {}),
        ...(typeof mod.deactivate === "function" ? { deactivate: mod.deactivate } : {}),
      });
    } catch {
      // 单个模块加载失败：跳过（后续可重试），不影响启动
    }
  }
}

/** 当前宿主 Context（Extension UI 组件取用 Core API；未注入时为 null）。 */
export function getHostContext(): CoreContext | null {
  return hostCtx;
}

/* ---- 课程成就数据 Provider：Core 成就引擎经 Host 查询（不直接依赖课程扩展） ---- */

const courseCompletedProviders = new Map<string, () => Promise<number>>();

/** 课程 Extension 注册「累计完成课程任务数」数据源（启用时注册）。 */
export function registerCourseCompletedProvider(
  id: string,
  fn: () => Promise<number>,
): void {
  courseCompletedProviders.set(id, fn);
}

/** 停用课程扩展时反注册其成就数据源（禁用期间成就不再计入）。 */
export function unregisterCourseCompletedProvider(id: string): void {
  courseCompletedProviders.delete(id);
}

/** Core 成就引擎取首个已注册的课程成就数据源；无则返回 null（= 0）。 */
export function getCourseCompletedProvider(): (() => Promise<number>) | null {
  for (const fn of courseCompletedProviders.values()) return fn;
  return null;
}

/* ---- WorkflowRun 完成数据 Provider：Core 成就引擎查询 Workflow 扩展（A5） ---- */

const workflowRunProviders = new Map<string, () => Promise<number>>();

/** Workflow 扩展注册「累计完成的 WorkflowRun 数」数据源（启用时注册）。 */
export function registerWorkflowRunCompletedProvider(
  id: string,
  fn: () => Promise<number>,
): void {
  workflowRunProviders.set(id, fn);
}

/** 停用 Workflow 扩展时注销其成就数据源。 */
export function unregisterWorkflowRunCompletedProvider(id: string): void {
  workflowRunProviders.delete(id);
}

/** Core 成就引擎取 WorkflowRun 完成数；无注册源返回 null（= 0）。 */
export function getWorkflowRunCompletedProvider(): (() => Promise<number>) | null {
  for (const fn of workflowRunProviders.values()) return fn;
  return null;
}

/* ---- 独立库备份参与者：拥有独立 SQLite 文件的扩展在备份/恢复时参与 ---- */

/**
 * 备份参与者（A1-P0Fix-③）：扩展拥有独立库（如课程 course-schedule.db）时注册，
 * 使 Core 备份/恢复能覆盖该库，避免「主库有备份、扩展库零备份」。
 * snapshotTo：把扩展库 VACUUM INTO 到目标绝对路径（返回 false = 无可快照，跳过伴生）；
 * close：恢复前关闭扩展库连接（否则 Windows 文件占用使替换失败）。
 */
export interface DbBackupParticipant {
  snapshotTo: (absTargetPath: string) => Promise<boolean>;
  close: () => Promise<void>;
}

let dbBackupParticipant: DbBackupParticipant | null = null;

/** 扩展激活时注册其独立库备份参与者（每个扩展至多一个；后注册覆盖）。 */
export function registerDbBackupParticipant(p: DbBackupParticipant): void {
  dbBackupParticipant = p;
}

/** 扩展停用时注销（不删除其库文件）。 */
export function unregisterDbBackupParticipant(): void {
  dbBackupParticipant = null;
}

/** Core 备份服务查询当前备份参与者；无独立库扩展启用时返回 null。 */
export function getDbBackupParticipant(): DbBackupParticipant | null {
  return dbBackupParticipant;
}

export function getLoadedExtensions(): LoadedEntry[] {
  return [...loaded];
}

export function getActivatedExtension(id: string): ActivatedExtension | undefined {
  return activated.get(id);
}

/** 导航贡献（需已激活且无错误）。 */
export function getNavContribution(id: string): { page: string; label: string } | null {
  const act = activated.get(id);
  if (!act || act.error) return null;
  return act.contributions.nav ?? null;
}

/** 按路由找 Extension 页面组件。 */
export function getExtensionPageComponent(page: string): ComponentType | null {
  for (const act of activated.values()) {
    if (act.error) continue;
    if (act.contributions.nav?.page === page && act.contributions.Page) {
      return act.contributions.Page;
    }
  }
  return null;
}

/** 某槽位的贡献组件列表（Core 标准扩展点使用）。 */
export function getSlotComponents(slot: ExtensionSlotId): Array<{
  id: string;
  Component: ComponentType;
}> {
  const out: Array<{ id: string; Component: ComponentType }> = [];
  for (const act of activated.values()) {
    if (act.error) continue;
    const Component = act.contributions.slots?.[slot];
    if (Component) out.push({ id: act.id, Component });
  }
  return out;
}
