import { dateKey, parseDateKey } from "./monthView";

/**
 * 快速捕获自然语言解析（纯函数，无 UI 依赖）：
 *
 * 语法（空格分隔，词序：日期 → 开始时间 → 时长，`#分类` 可放任意位置）：
 *   日期：今天 / 明天 / 后天 / 周X / 星期X / MM-DD / M月D日 / YYYY-MM-DD
 *   时间：14:00 / 14点 / 14点30 / 14:00-15:30（范围）
 *   时长：30分钟 / 1.5h / 90m / 2小时
 *   例：`明天 14:00 1.5h #开发 写设计文档`
 *
 * 未识别的词全部保留为标题；无日期默认今天；给开始时间但无时长时按 60 分钟
 * 生成计划区间（预计字段保持为空，不污染「预计 vs 实际」统计）。
 */

export interface QuickCaptureCategory {
  id: number;
  name: string;
}

export interface QuickCaptureContext {
  /** 今天 YYYY-MM-DD */
  today: string;
  categories: QuickCaptureCategory[];
}

export interface QuickCaptureResult {
  title: string;
  scheduledDate: string;
  /** 绝对毫秒（scheduledDate 当日） */
  plannedStart: number | null;
  plannedEnd: number | null;
  /** 秒；仅在显式给出时长时填充 */
  estimatedDuration: number | null;
  categoryId: number | null;
}

const WEEKDAY_TOKENS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
};

/** YYYY-MM-DD 平移 n 天。 */
function shiftDate(ymd: string, n: number): string {
  const d = parseDateKey(ymd);
  if (!d) return ymd;
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** 本地 0 点毫秒。 */
function dateMs(ymd: string): number {
  const d = parseDateKey(ymd);
  return d ? d.getTime() : NaN;
}

/** 尝试把 token 解析为日期（今天/明天/周X/MM-DD…）。 */
function matchDateToken(token: string, ctx: QuickCaptureContext): string | null {
  const today = ctx.today;
  const todayDate = parseDateKey(today);
  if (!todayDate) return null;
  if (token === "今天") return today;
  if (token === "明天") return shiftDate(today, 1);
  if (token === "后天") return shiftDate(today, 2);
  const wd = /^(?:周|星期)([一二三四五六日天])$/.exec(token);
  if (wd && WEEKDAY_TOKENS[wd[1]] !== undefined) {
    const target = WEEKDAY_TOKENS[wd[1]];
    const cur = todayDate.getDay();
    let delta = (target - cur + 7) % 7;
    if (delta === 0) delta = 7; // 今天不算，取下一次
    return shiftDate(today, delta);
  }
  const md = /^(\d{1,2})-(\d{1,2})$/.exec(token);
  if (md) {
    const year = todayDate.getFullYear();
    let s = `${year}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;
    if (s < today) s = `${year + 1}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;
    return s;
  }
  const cnd = /^(\d{1,2})月(\d{1,2})日?$/.exec(token);
  if (cnd) {
    const year = todayDate.getFullYear();
    let s = `${year}-${cnd[1].padStart(2, "0")}-${cnd[2].padStart(2, "0")}`;
    if (s < today) s = `${year + 1}-${cnd[1].padStart(2, "0")}-${cnd[2].padStart(2, "0")}`;
    return s;
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(token)) {
    const [y, m, d] = token.split("-").map(Number);
    return dateKey(new Date(y, m - 1, d));
  }
  return null;
}

interface ParsedTime {
  h: number;
  m: number;
}

/** token → 当天时分（14:00 / 14点 / 14点30）。 */
function matchTimeToken(token: string): ParsedTime | null {
  const m = /^(\d{1,2})[:：点](\d{1,2})?$/.exec(token);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return { h, m: mm };
}

/** token → 开始+结束时分（14:00-15:30 / 14点~15点）。 */
function matchTimeRangeToken(token: string): { start: ParsedTime; end: ParsedTime } | null {
  const m = /^(\d{1,2})[:：点](\d{1,2})?\s*[-~至]\s*(\d{1,2})[:：点](\d{1,2})?$/.exec(token);
  if (!m) return null;
  const start = { h: Number(m[1]), m: m[2] === undefined ? 0 : Number(m[2]) };
  const end = { h: Number(m[3]), m: m[4] === undefined ? 0 : Number(m[4]) };
  if (start.h > 23 || start.m > 59 || end.h > 23 || end.m > 59) return null;
  if (start.h * 60 + start.m >= end.h * 60 + end.m) return null;
  return { start, end };
}

/** token → 时长分钟（30分钟 / 1.5h / 90m）。 */
function matchDurationToken(token: string): number | null {
  const m = /^(\d+(?:\.\d+)?)(小时|分钟|h|m|min|分)$/i.exec(token);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  if (unit === "h" || unit === "小时") return Math.round(n * 60);
  return Math.round(n);
}

export function parseQuickCapture(
  raw: string,
  ctx: QuickCaptureContext,
): QuickCaptureResult {
  const today = ctx.today;
  let text = raw.trim();
  let categoryId: number | null = null;

  // 分类：#名称（仅在能匹配到现有分类时消费，避免吞掉标题）
  const catMatch = /#([^\s#]+)/.exec(text);
  if (catMatch) {
    const found = ctx.categories.find((c) => c.name === catMatch[1]);
    if (found) {
      categoryId = found.id;
      text = text.replace(catMatch[0], "").trim();
    }
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  let scheduledDate = today;
  let consumedDate = false;
  let timeStart: ParsedTime | null = null;
  let timeEnd: ParsedTime | null = null;
  let durationMinutes: number | null = null;

  // 词序消费：日期 → 开始时间/时间范围 → 时长（每种只消费一次）
  while (tokens.length > 0) {
    const tok = tokens[0];
    if (!consumedDate) {
      const d = matchDateToken(tok, ctx);
      if (d) {
        scheduledDate = d;
        consumedDate = true;
        tokens.shift();
        continue;
      }
    }
    if (timeStart === null) {
      const range = matchTimeRangeToken(tok);
      if (range) {
        timeStart = range.start;
        timeEnd = range.end;
        tokens.shift();
        continue;
      }
      const t = matchTimeToken(tok);
      if (t) {
        timeStart = t;
        tokens.shift();
        continue;
      }
    }
    if (durationMinutes === null) {
      const dm = matchDurationToken(tok);
      if (dm) {
        durationMinutes = dm;
        tokens.shift();
        continue;
      }
    }
    break; // 词序外（标题开始）
  }

  const title = tokens.join(" ").trim();

  let plannedStart: number | null = null;
  let plannedEnd: number | null = null;
  if (timeStart) {
    const base = dateMs(scheduledDate);
    if (Number.isFinite(base)) {
      plannedStart = base + (timeStart.h * 60 + timeStart.m) * 60_000;
      const endMinutes = timeEnd
        ? timeEnd.h * 60 + timeEnd.m
        : timeStart.h * 60 + timeStart.m + (durationMinutes ?? 60);
      plannedEnd = base + endMinutes * 60_000;
    }
  }

  return {
    title: title || "未命名任务",
    scheduledDate,
    plannedStart,
    plannedEnd,
    estimatedDuration: durationMinutes != null ? durationMinutes * 60 : null,
    categoryId,
  };
}
