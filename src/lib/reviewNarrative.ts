/**
 * v1.9 复盘文本（确定性叙述，非 AI）：
 * 把数字变成可读的结论行（时间偏差 / 低估率 / 最佳时段 / 停滞目标）。
 * 纯函数，便于单测；UI 只做拼接展示。
 */

export interface NarrativeInput {
  /** 时段标签：今日 / 本周 / 近30天 */
  label: string;
  totalSeconds: number;
  sessionCount: number;
  completedFocusCount: number;
  taskCreated: number;
  taskCompleted: number;
  /** 预计/实际（秒；均为 0 时忽略偏差行） */
  estimatedSeconds: number;
  actualSeconds: number;
  /** 低估统计：有预计且实际>预计的任务数 / 参与样本数（有预计的任务） */
  underCount: number;
  underSample: number;
  /** 低估任务平均超时（秒；0 表示无样本） */
  avgOverrunSeconds: number;
  /** 最佳小时（0..23；-1 表示无数据） */
  bestHour: number;
  /** 高峰投入（秒） */
  bestHourSeconds: number;
  /** 投入最高的项目名（null 表示无项目数据） */
  topProjectName: string | null;
  /** 停滞目标（近 14 天无任务完成）数量 */
  stalledCount: number;
}

function fmt(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} 小时` : `${h} 小时 ${rest} 分钟`;
}

/** 生成复盘结论行（每行一条）。 */
export function buildNarrativeLines(i: NarrativeInput): string[] {
  const lines: string[] = [];

  lines.push(
    `${i.label}专注投入 ${fmt(i.totalSeconds)}（${i.sessionCount} 次，走满 ${i.completedFocusCount} 个番茄）`,
  );
  if (i.taskCreated > 0) {
    const rate = Math.round((i.taskCompleted / i.taskCreated) * 100);
    lines.push(
      `任务：完成 ${i.taskCompleted}/${i.taskCreated}（完成率 ${rate}%）`,
    );
  }

  if (i.estimatedSeconds > 0 || i.actualSeconds > 0) {
    const diff = i.actualSeconds - i.estimatedSeconds;
    if (diff === 0) {
      lines.push("计划 vs 实际：估算精准（实际 = 预计）");
    } else {
      const sign = diff > 0 ? "超出" : "少于";
      lines.push(
        `计划 vs 实际：实际${sign}预计 ${fmt(Math.abs(diff))}（预计 ${fmt(i.estimatedSeconds)} / 实际 ${fmt(i.actualSeconds)}）`,
      );
    }
  }

  if (i.underSample > 0 && i.underCount > 0) {
    const pct = Math.round((i.underCount / i.underSample) * 100);
    lines.push(
      `时间低估：${i.underCount}/${i.underSample} 项任务低估（${pct}%），平均超时 ${fmt(i.avgOverrunSeconds)}`,
    );
  }

  if (i.bestHour >= 0 && i.bestHourSeconds > 0) {
    const next = (i.bestHour + 1) % 24;
    lines.push(
      `最佳投入时段：${String(i.bestHour).padStart(2, "0")}:00–${String(next).padStart(2, "0")}:00（${fmt(i.bestHourSeconds)}）`,
    );
  }

  if (i.topProjectName) {
    lines.push(`投入最多项目：${i.topProjectName}`);
  }

  if (i.stalledCount > 0) {
    lines.push(
      `⚠ ${i.stalledCount} 个进行中目标近两周没有完成任务，记得推进`,
    );
  } else if (i.stalledCount === 0 && i.taskCompleted > 0) {
    lines.push("进行中目标都有推进，节奏不错");
  }

  return lines;
}
