import { SettingsRepository } from "../db/repositories/settingsRepository";

/** 应用设置（内存模型，分钟单位）。 */
export interface AppSettings {
  /** 番茄钟默认时长（分钟） */
  pomodoroDurationMinutes: number;
  /** 时间轴开始（当天分钟数） */
  timelineStartMinutes: number;
  /** 时间轴结束（当天分钟数） */
  timelineEndMinutes: number;
  /** 时间轴吸附粒度（分钟） */
  timelineSnapMinutes: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  pomodoroDurationMinutes: 25,
  timelineStartMinutes: 8 * 60, // 08:00
  timelineEndMinutes: 24 * 60, // 24:00
  timelineSnapMinutes: 15,
};

/** settings 表键名（存储格式：时长用秒、时间用 "HH:mm"、粒度用分钟）。 */
const KEY_POMODORO_DURATION = "pomodoro_duration";
const KEY_TIMELINE_START = "timeline_start";
const KEY_TIMELINE_END = "timeline_end";
const KEY_TIMELINE_SNAP = "timeline_snap";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function minutesToHHMM(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/** 解析 "HH:mm" → 当天分钟数；非法返回 null。 */
export function parseHHMMToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59) return null;
  const minutes = h * 60 + m;
  return minutes <= 1440 ? minutes : null;
}

function parseIntSafe(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** 夹取时间轴范围：0-1440 分钟内，且保证 end > start。 */
function clampRange(start: number, end: number): { start: number; end: number } {
  let s = clamp(Math.round(start), 0, 1440);
  let e = clamp(Math.round(end), 0, 1440);
  if (e <= s) {
    e = Math.min(1440, s + 60);
    if (e <= s) s = Math.max(0, e - 60);
  }
  return { start: s, end: e };
}

/**
 * 设置服务。持久化到 SQLite settings 表（键值），
 * 读取时与默认值合并；未保存的键永远回退默认值。
 */
export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  async getSettings(): Promise<AppSettings> {
    const stored = await this.repo.getAll();
    return {
      pomodoroDurationMinutes: Math.round(
        parseIntSafe(stored[KEY_POMODORO_DURATION], 1500) / 60,
      ),
      timelineStartMinutes:
        parseHHMMToMinutes(stored[KEY_TIMELINE_START] ?? "") ??
        DEFAULT_SETTINGS.timelineStartMinutes,
      timelineEndMinutes:
        parseHHMMToMinutes(stored[KEY_TIMELINE_END] ?? "") ??
        DEFAULT_SETTINGS.timelineEndMinutes,
      timelineSnapMinutes: Math.round(parseIntSafe(stored[KEY_TIMELINE_SNAP], 15)),
    };
  }

  /** 更新部分设置（仅写变更的键）。 */
  async update(partial: Partial<AppSettings>): Promise<void> {
    const current = await this.getSettings();
    const range = clampRange(
      partial.timelineStartMinutes ?? current.timelineStartMinutes,
      partial.timelineEndMinutes ?? current.timelineEndMinutes,
    );

    const writes: Array<[string, string]> = [];
    if (partial.pomodoroDurationMinutes !== undefined) {
      const m = clamp(Math.round(partial.pomodoroDurationMinutes), 1, 180);
      writes.push([KEY_POMODORO_DURATION, String(m * 60)]);
    }
    if (partial.timelineStartMinutes !== undefined) {
      writes.push([KEY_TIMELINE_START, minutesToHHMM(range.start)]);
    }
    if (partial.timelineEndMinutes !== undefined) {
      writes.push([KEY_TIMELINE_END, minutesToHHMM(range.end)]);
    }
    if (partial.timelineSnapMinutes !== undefined) {
      const s = clamp(Math.round(partial.timelineSnapMinutes), 5, 60);
      writes.push([KEY_TIMELINE_SNAP, String(s)]);
    }
    for (const [k, v] of writes) {
      await this.repo.set(k, v);
    }
  }
}
