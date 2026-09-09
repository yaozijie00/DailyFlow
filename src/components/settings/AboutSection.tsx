import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  getStartupMetrics,
  STARTUP_PHASE_BUDGETS,
  subscribeStartupMetrics,
  type StartupMetric,
} from "../../services/startupDiagnostics";

/** 关于：版本与应用信息。 */
export default function AboutSection() {
  const [appVersion, setAppVersion] = useState("");
  const [startupMetrics, setStartupMetrics] = useState<StartupMetric[]>(getStartupMetrics);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  useEffect(
    () => subscribeStartupMetrics(() => setStartupMetrics(getStartupMetrics())),
    [],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-md border border-border-subtle glass-surface p-5">
        <div>
          <div className="text-lg font-semibold text-text-primary">DailyFlow</div>
          <div className="mt-0.5 text-sm text-text-muted">
            本地优先的个人时间管理与专注工具
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">当前版本</span>
          <span className="text-text-primary">V{appVersion || "…"}</span>
        </div>
        <p className="text-xs text-text-faint">
          数据完全存储在本地 SQLite，无需账号、无需联网。
        </p>
      </div>

      <div className="rounded-md border border-border-subtle glass-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-sm font-medium text-text-primary">启动诊断</div>
          <span className="text-[10px] text-text-faint">本次启动</span>
        </div>
        <p className="mt-1 text-xs text-text-faint">
          用于发现数据库、扩展或数据量增长造成的启动变慢。
        </p>
        {startupMetrics.length === 0 ? (
          <p className="mt-4 text-xs text-text-muted">启动阶段尚未完成。</p>
        ) : (
          <div className="mt-4 divide-y divide-border-subtle">
            {startupMetrics.map((metric) => {
              const overBudget = metric.durationMs > STARTUP_PHASE_BUDGETS[metric.id];
              return (
                <div key={metric.id} className="flex items-center justify-between gap-4 py-2 text-xs">
                  <span className="text-text-muted">{metric.label}</span>
                  <span
                    className={
                      metric.status === "error"
                        ? "text-red-600"
                        : overBudget
                          ? "text-amber-600"
                          : "text-text-primary"
                    }
                    title={overBudget ? `建议低于 ${STARTUP_PHASE_BUDGETS[metric.id]} ms` : undefined}
                  >
                    {metric.status === "error" ? "失败 · " : ""}
                    {metric.durationMs < 10
                      ? `${metric.durationMs.toFixed(1)} ms`
                      : `${Math.round(metric.durationMs)} ms`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
