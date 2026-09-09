export type StartupPhaseId =
  | "database"
  | "settings"
  | "extensions"
  | "goals"
  | "focus-restore";

export type StartupPhaseStatus = "ok" | "error";

export interface StartupMetric {
  id: StartupPhaseId;
  label: string;
  durationMs: number;
  status: StartupPhaseStatus;
  finishedAt: number;
}

export const STARTUP_PHASE_BUDGETS: Record<StartupPhaseId, number> = {
  database: 500,
  settings: 250,
  extensions: 1000,
  goals: 500,
  "focus-restore": 500,
};

const metrics = new Map<StartupPhaseId, StartupMetric>();
const listeners = new Set<() => void>();

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function publish(metric: StartupMetric): void {
  metrics.set(metric.id, metric);
  for (const listener of listeners) listener();
}

/** 测量一个启动阶段；保留原操作的返回值和异常语义。 */
export async function measureStartupPhase<T>(
  id: StartupPhaseId,
  label: string,
  operation: () => Promise<T> | T,
): Promise<T> {
  const startedAt = now();
  try {
    const result = await operation();
    publish({
      id,
      label,
      durationMs: Math.max(0, now() - startedAt),
      status: "ok",
      finishedAt: Date.now(),
    });
    return result;
  } catch (error) {
    publish({
      id,
      label,
      durationMs: Math.max(0, now() - startedAt),
      status: "error",
      finishedAt: Date.now(),
    });
    throw error;
  }
}

export function getStartupMetrics(): StartupMetric[] {
  return [...metrics.values()].sort((a, b) => a.finishedAt - b.finishedAt);
}

export function subscribeStartupMetrics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 仅供单元测试隔离模块级记录。 */
export function resetStartupMetricsForTests(): void {
  metrics.clear();
  listeners.clear();
}

