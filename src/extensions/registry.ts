import type { ComponentType } from "react";
import { getDb } from "../db/db";
import { createExtensionStorage } from "./storage";
import {
  getExtensionCompatibilityError,
  validateManifest,
  type ActivatedExtension,
  type CoreContext,
  type ExtensionContributions,
  type ExtensionCapability,
  type ExtensionManifest,
  type ExtensionModule,
  type ExtensionSettingsContribution,
  type ExtensionSlotId,
  type ExtensionTaskActionContribution,
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

export interface ExtensionDiagnostic {
  extensionId: string;
  phase: "load" | "activate" | "deactivate";
  message: string;
}

type ExtensionCleanup = () => void | Promise<void>;

const loaded: LoadedEntry[] = [];
const activated = new Map<string, ActivatedExtension>();
const cleanups = new Map<string, Set<ExtensionCleanup>>();
const lifecycleChains = new Map<string, Promise<void>>();
const diagnostics: ExtensionDiagnostic[] = [];
let hostCtx: CoreContext | null = null;

function recordDiagnostic(diagnostic: ExtensionDiagnostic): void {
  diagnostics.push(diagnostic);
  if (diagnostics.length > 100) diagnostics.shift();
}

function requireCapability(
  capabilities: ReadonlySet<ExtensionCapability>,
  capability: ExtensionCapability,
): void {
  if (!capabilities.has(capability)) {
    throw new Error(`扩展缺少 ${capability} 权限`);
  }
}

/** 按 Manifest 能力收窄宿主 API；用于运行时强制任务读写与旧数据访问边界。 */
export function scopeContextCapabilities(
  ctx: CoreContext,
  declared: readonly ExtensionCapability[],
): CoreContext {
  const capabilities = new Set(declared);
  return {
    ...ctx,
    tasks: {
      create: async (input) => {
        requireCapability(capabilities, "tasks.write");
        return ctx.tasks.create(input);
      },
      createWithId: async (input) => {
        requireCapability(capabilities, "tasks.write");
        return ctx.tasks.createWithId(input);
      },
      complete: async (taskId) => {
        requireCapability(capabilities, "tasks.write");
        return ctx.tasks.complete(taskId);
      },
      listByIds: async (ids) => {
        requireCapability(capabilities, "tasks.read");
        return ctx.tasks.listByIds(ids);
      },
      listByDate: async (date) => {
        requireCapability(capabilities, "tasks.read");
        return ctx.tasks.listByDate(date);
      },
    },
    storage: capabilities.has("storage.extension") ? ctx.storage : undefined,
    legacy: capabilities.has("legacy.read") ? ctx.legacy : undefined,
  };
}

function createScopedContext(entry: LoadedEntry): CoreContext {
  const ctx = hostCtx;
  if (!ctx) throw new Error("Extension Host Context 尚未初始化");
  const capableCtx = scopeContextCapabilities(ctx, entry.manifest.capabilities);
  const owned = new Set<ExtensionCleanup>();
  cleanups.set(entry.id, owned);
  return {
    ...capableCtx,
    storage: entry.manifest.capabilities.includes("storage.extension")
      ? createExtensionStorage(getDb(), entry.id)
      : undefined,
    events: {
      ...capableCtx.events,
      subscribe: (domain, listener) => {
        const unsubscribe = capableCtx.events.subscribe(domain, listener);
        owned.add(unsubscribe);
        return () => {
          owned.delete(unsubscribe);
          unsubscribe();
        };
      },
    },
    lifecycle: {
      onDispose: (cleanup) => {
        owned.add(cleanup);
        return () => owned.delete(cleanup);
      },
    },
  };
}

async function callDeactivate(entry: LoadedEntry, ctx: CoreContext): Promise<void> {
  if (!entry.deactivate) return;
  try {
    await entry.deactivate(ctx);
  } catch (error) {
    recordDiagnostic({
      extensionId: entry.id,
      phase: "deactivate",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function disposeScoped(id: string): Promise<void> {
  const owned = cleanups.get(id);
  cleanups.delete(id);
  if (!owned) return;
  for (const cleanup of [...owned].reverse()) {
    try {
      await cleanup();
    } catch (error) {
      recordDiagnostic({
        extensionId: id,
        phase: "deactivate",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function runSerialized(id: string, operation: () => Promise<void>): Promise<void> {
  const previous = lifecycleChains.get(id) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  lifecycleChains.set(id, current);
  const release = () => {
    if (lifecycleChains.get(id) === current) lifecycleChains.delete(id);
  };
  void current.then(release, release);
  return current;
}

/** 校验 UI 贡献边界，防止扩展覆盖 Core 路由或占用其它扩展的页面地址。 */
export function validateContributions(
  extensionId: string,
  contributions: ExtensionContributions,
  existingRoutes: ReadonlyMap<string, string>,
): string | null {
  const nav = contributions.nav;
  if (!nav && contributions.Page) return "提供 Page 时必须同时声明 nav";
  if (nav && !contributions.Page) return "声明 nav 时必须同时提供 Page";
  if (nav) {
    if (!nav.page.startsWith("ext:")) return "扩展页面路由必须以 ext: 开头";
    const owner = existingRoutes.get(nav.page);
    if (owner && owner !== extensionId) return `路由 ${nav.page} 已被扩展 ${owner} 占用`;
  }
  const settingIds = new Set<string>();
  for (const setting of contributions.settings ?? []) {
    const id = setting.id.trim();
    if (!id || !setting.label.trim()) return "扩展设置分组 ID 与名称不能为空";
    if (settingIds.has(id)) return `扩展设置分组 ID 重复：${id}`;
    settingIds.add(id);
  }
  const taskActionIds = new Set<string>();
  for (const action of contributions.taskActions ?? []) {
    const id = action.id.trim();
    if (!id) return "任务动作 ID 不能为空";
    if (taskActionIds.has(id)) return `任务动作 ID 重复：${id}`;
    taskActionIds.add(id);
  }
  return null;
}

/** UI 扩展点也必须由 manifest 显式申请，避免静默获得新入口。 */
export function validateContributionCapabilities(
  declared: readonly ExtensionCapability[],
  contributions: ExtensionContributions,
): string | null {
  const capabilities = new Set(declared);
  if ((contributions.nav || contributions.Page) && !capabilities.has("ui.page")) {
    return "扩展页面贡献需要声明 ui.page 能力";
  }
  if (contributions.slots?.today && !capabilities.has("ui.today-slot")) {
    return "今日页面槽位贡献需要声明 ui.today-slot 能力";
  }
  if (contributions.quickLaunch && !capabilities.has("ui.today-slot")) {
    return "今日快捷启动贡献需要声明 ui.today-slot 能力";
  }
  if ((contributions.taskActions?.length ?? 0) > 0 && !capabilities.has("ui.task-action")) {
    return "任务动作贡献需要声明 ui.task-action 能力";
  }
  if ((contributions.settings?.length ?? 0) > 0 && !capabilities.has("ui.settings")) {
    return "扩展设置贡献需要声明 ui.settings 能力";
  }
  return null;
}

/** 逐个激活（异常隔离）；init（可选异步初始化）先于 activate 执行，失败仅标记该扩展 error。 */
async function activateEntry(entry: LoadedEntry): Promise<void> {
  if (!hostCtx) return; // Context 尚未注入（Core 启动流程保证先 init 再激活）
  if (activated.has(entry.id)) await callDeactivate(entry, hostCtx);
  await disposeScoped(entry.id);
  const ctx = createScopedContext(entry);
  try {
    if (entry.init) {
      await entry.init(ctx);
    }
    const contributions: ExtensionContributions = entry.activate(ctx) ?? {};
    const routes = new Map<string, string>();
    for (const active of activated.values()) {
      if (active.id !== entry.id && active.contributions.nav) {
        routes.set(active.contributions.nav.page, active.id);
      }
    }
    const contributionError = validateContributions(entry.id, contributions, routes);
    if (contributionError) throw new Error(contributionError);
    const capabilityError = validateContributionCapabilities(
      entry.manifest.capabilities,
      contributions,
    );
    if (capabilityError) throw new Error(capabilityError);
    activated.set(entry.id, {
      id: entry.id,
      manifest: entry.manifest,
      contributions,
      error: null,
    });
  } catch (e) {
    await callDeactivate(entry, ctx);
    await disposeScoped(entry.id);
    const message = e instanceof Error ? e.message : String(e);
    recordDiagnostic({ extensionId: entry.id, phase: "activate", message });
    activated.set(entry.id, {
      id: entry.id,
      manifest: entry.manifest,
      contributions: {},
      error: message,
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
  await runSerialized(id, async () => {
    const ctx = hostCtx;
    const entry = loaded.find((e) => e.id === id);
    if (entry && ctx) await callDeactivate(entry, ctx);
    await disposeScoped(id);
    activated.delete(id);
  });
}

/** 重新激活单个（启用时或设置页「重试」用；需已注入 Context）。 */
export async function reactivate(id: string): Promise<void> {
  const entry = loaded.find((e) => e.id === id);
  if (!entry) return;
  await runSerialized(id, () => activateEntry(entry));
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
      if (!manifest) {
        recordDiagnostic({ extensionId: path, phase: "load", message: "扩展清单格式无效" });
        continue;
      }
      const compatibilityError = getExtensionCompatibilityError(manifest);
      if (compatibilityError) {
        recordDiagnostic({ extensionId: manifest.id, phase: "load", message: compatibilityError });
        continue;
      }
      if (typeof mod.activate !== "function") continue;
      if (loaded.some((entry) => entry.id === manifest.id)) {
        recordDiagnostic({
          extensionId: manifest.id,
          phase: "load",
          message: `扩展 ID 重复：${manifest.id}`,
        });
        continue;
      }
      loaded.push({
        id: manifest.id,
        manifest,
        activate: mod.activate,
        ...(typeof mod.init === "function" ? { init: mod.init } : {}),
        ...(typeof mod.deactivate === "function" ? { deactivate: mod.deactivate } : {}),
      });
    } catch (error) {
      recordDiagnostic({
        extensionId: path,
        phase: "load",
        message: error instanceof Error ? error.message : String(error),
      });
      // 单个模块加载失败：跳过（后续可重试），不影响启动
    }
  }
}

/** 当前宿主 Context（Extension UI 组件取用 Core API；未注入时为 null）。 */
export function getHostContext(): CoreContext | null {
  return hostCtx;
}

export function getExtensionDiagnostics(): ExtensionDiagnostic[] {
  return [...diagnostics];
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

export function getQuickLaunchComponents(): Array<{ id: string; Component: ComponentType }> {
  const out: Array<{ id: string; Component: ComponentType }> = [];
  for (const act of activated.values()) {
    if (act.error) continue;
    const Component = act.contributions.quickLaunch?.Component;
    if (Component) out.push({ id: act.id, Component });
  }
  return out;
}

export function getTaskActionContributions(): Array<{
  extensionId: string;
  contribution: ExtensionTaskActionContribution;
}> {
  const out: Array<{ extensionId: string; contribution: ExtensionTaskActionContribution }> = [];
  for (const act of activated.values()) {
    if (act.error) continue;
    for (const contribution of act.contributions.taskActions ?? []) {
      out.push({ extensionId: act.id, contribution });
    }
  }
  return out;
}

/** 所有激活扩展贡献的设置分组；宿主使用 extensionId + id 生成全局稳定键。 */
export function getSettingsContributions(): Array<{
  extensionId: string;
  extensionName: string;
  contribution: ExtensionSettingsContribution;
}> {
  const out: Array<{
    extensionId: string;
    extensionName: string;
    contribution: ExtensionSettingsContribution;
  }> = [];
  for (const act of activated.values()) {
    if (act.error) continue;
    for (const contribution of act.contributions.settings ?? []) {
      out.push({
        extensionId: act.id,
        extensionName: act.manifest.name,
        contribution,
      });
    }
  }
  return out;
}
