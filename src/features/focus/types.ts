export type FocusMode = "stopwatch" | "countdown" | "pomodoro";
export interface FocusRecord {
  id: number; taskId: number | null; taskTitle: string; startedAt: number; endedAt: number | null;
  actualSeconds: number; status: "running" | "paused" | "recovery" | "finished";
  runningSince: number | null; pausedAt: number | null; goalSeconds: number | null;
  mode: FocusMode; note: string; nextAction: string; interruptionCount: number;
  source: "timer" | "manual" | "legacy"; checkpointAt: number; revision: number;
}
export interface FocusRequest {
  action: "read" | "start" | "pause" | "resume" | "finish" | "switch" | "recover" | "interrupt" | "heartbeat" | "list" | "manual" | "edit" | "delete";
  operationId?: string; sessionId?: number; expectedVersion?: number; taskId?: number | null;
  goalSeconds?: number | null; mode?: FocusMode; note?: string; nextAction?: string;
  completeTask?: boolean; durationSeconds?: number; startedAt?: number;
  recoveryChoice?: "exclude" | "include" | "discard"; limit?: number;
}
export interface FocusResponse { active: FocusRecord | null; sessions?: FocusRecord[] }
export function elapsedSeconds(record: FocusRecord, now = Date.now()): number {
  return Math.max(0, record.actualSeconds + (record.status === "running" && record.runningSince != null ? Math.max(0, now - record.runningSince) / 1000 : 0));
}
export function focusTime(seconds: number): string {
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 3600) ? `${Math.floor(n / 3600)}:` : ""}${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
