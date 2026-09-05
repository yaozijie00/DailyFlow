import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { useExtensionStore } from "../stores/extensionStore";
import {
  getActivatedExtension,
  getExtensionPageComponent,
  getLoadedExtensions,
  getNavContribution,
  getSlotComponents,
} from "./registry";
import type { ExtensionSlotId } from "./types";

/* ==================== React 订阅层（Core UI 与 Registry 之间的薄绑定） ==================== */

/** 启用且激活成功的 Extension 导航项（Layout 侧栏用）。 */
export function useEnabledNavItems(): Array<{ page: string; label: string }> {
  const enabled = useExtensionStore((s) => s.enabled);
  const revision = useExtensionStore((s) => s.revision);
  void revision; // 激活结果变化后强制重算
  const items: Array<{ page: string; label: string }> = [];
  for (const id of Object.keys(enabled)) {
    if (!enabled[id]) continue;
    const nav = getNavContribution(id);
    if (nav) items.push({ page: nav.page, label: nav.label });
  }
  return items;
}

/** 指定槽位（如 today）的启用 Extension 组件列表（含 id 供 key/错误边界 label）。 */
export function useEnabledSlotComponents(slot: ExtensionSlotId): Array<{
  id: string;
  Component: ComponentType;
}> {
  const enabled = useExtensionStore((s) => s.enabled);
  const revision = useExtensionStore((s) => s.revision);
  void revision;
  return getSlotComponents(slot).filter((x) => enabled[x.id]);
}

/** 管理页行数据（设置 → 扩展）。 */
export interface ExtensionRow {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  description: string;
  status: "enabled" | "disabled" | "error";
  error: string | null;
}

export function useExtensionRows(): ExtensionRow[] {
  const enabled = useExtensionStore((s) => s.enabled);
  const revision = useExtensionStore((s) => s.revision);
  void revision;
  const rows: ExtensionRow[] = [];
  for (const ext of getLoadedExtensions()) {
    const flag = enabled[ext.id] ?? false;
    const act = getActivatedExtension(ext.id);
    const err = flag && act?.error ? act.error : null;
    rows.push({
      id: ext.id,
      name: ext.manifest.name,
      version: ext.manifest.version,
      apiVersion: ext.manifest.apiVersion,
      description: ext.manifest.description,
      status: err ? "error" : flag ? "enabled" : "disabled",
      error: err,
    });
  }
  return rows;
}

/** 按路由取 Extension 页面组件（App 渲染动态页用）。 */
export function getExtensionPageFor(page: string): ComponentType | null {
  return getExtensionPageComponent(page);
}

/* ==================== 每 Extension 错误边界（Rule 04：出错不崩 Core） ==================== */

interface BoundaryState {
  error: Error | null;
}

/** 渲染单个 Extension 页面/槽位的错误边界：异常只替换该区块，不影响 Core。 */
export class ExtensionErrorBoundary extends Component<
  { children: ReactNode; label: string },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      // 动态引入避免循环依赖
      void import("../lib/startupLog").then((m) =>
        m.log(`[Extension:${this.props.label}] ${error.message}\n${info.componentStack ?? ""}`),
      );
    } catch {
      /* ignore */
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-md border border-red-200 bg-red-50/80 p-4 text-xs text-red-700">
          「{this.props.label}」出现异常，已隔离不影响 DailyFlow。错误：{this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
