import { describe, it, expect } from "vitest";
import {
  PX_PER_MINUTE,
  TIMELINE_TOTAL_HEIGHT,
  MIN_BLOCK_HEIGHT,
  timeToY,
  yToTime,
  minutesToY,
  yToMinutes,
  formatMinutes,
  dragRangeToMinutes,
  snapMinutes,
  formatTimeRange,
  resizeStartTo,
  resizeEndTo,
  moveTaskBy,
  computeLanes,
  clampBlockY,
  type TimeSpan,
} from "./timeline";
function tsAt(hours: number, minutes = 0): number {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes,
  ).getTime();
}

describe("timeline 时间↔像素转换（全天绝对坐标）", () => {
  it("00:00 → 顶部 0", () => {
    expect(timeToY(tsAt(0, 0))).toBe(0);
  });

  it("24:00（分钟数 1440）→ 总高度", () => {
    expect(minutesToY(1440)).toBe(TIMELINE_TOTAL_HEIGHT);
    expect(yToMinutes(TIMELINE_TOTAL_HEIGHT)).toBe(1440);
  });

  it("12:00 → 中间", () => {
    expect(timeToY(tsAt(12, 0))).toBe(TIMELINE_TOTAL_HEIGHT / 2);
  });

  it("1 小时 = 90px", () => {
    expect(timeToY(tsAt(9, 0)) - timeToY(tsAt(8, 0))).toBe(60 * PX_PER_MINUTE);
  });

  it("30 分钟 = 45px", () => {
    expect(timeToY(tsAt(8, 30)) - timeToY(tsAt(8, 0))).toBe(30 * PX_PER_MINUTE);
  });

  it("yToTime 是 timeToY 的逆（误差 < 1 分钟）", () => {
    const t = tsAt(14, 30);
    const round = yToTime(timeToY(t));
    expect(Math.abs(round - t)).toBeLessThan(60 * 1000);
  });

  it("yToTime(0) = 今天 00:00", () => {
    const d = new Date(yToTime(0));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("缩放：pxPerMinute=3 时 1 小时 = 180px", () => {
    expect(minutesToY(60, 3)).toBe(180);
    expect(timeToY(tsAt(9, 0), 3) - timeToY(tsAt(8, 0), 3)).toBe(180);
  });

  it("formatMinutes 格式化", () => {
    expect(formatMinutes(480)).toBe("08:00");
    expect(formatMinutes(555)).toBe("09:15");
    expect(formatMinutes(1440)).toBe("24:00");
  });
});

describe("timeline 拖拽范围 → 时间", () => {
  it("正常拖拽 09:00 → 10:00", () => {
    expect(dragRangeToMinutes(minutesToY(540), minutesToY(600))).toEqual({
      startMinutes: 540,
      endMinutes: 600,
    });
  });

  it("从下往上拖（10:00 → 09:00）自动交换", () => {
    expect(dragRangeToMinutes(minutesToY(600), minutesToY(540))).toEqual({
      startMinutes: 540,
      endMinutes: 600,
    });
  });

  it("吸附到最近 15 分钟", () => {
    expect(snapMinutes(607)).toBe(600); // 10:07 → 10:00
    expect(snapMinutes(608)).toBe(615); // 10:08 → 10:15
  });

  it("拖拽小于 15 分钟 → 扩展为 15 分钟", () => {
    expect(dragRangeToMinutes(minutesToY(540), minutesToY(545))).toEqual({
      startMinutes: 540,
      endMinutes: 555,
    });
  });

  it("不允许 0 分钟 Task（同一点拖拽 → 15 分钟）", () => {
    expect(dragRangeToMinutes(minutesToY(600), minutesToY(600))).toEqual({
      startMinutes: 600,
      endMinutes: 615,
    });
  });

  it("底部边界 → 最小 15 分钟（23:45 - 24:00）", () => {
    expect(dragRangeToMinutes(minutesToY(1425), minutesToY(1425))).toEqual({
      startMinutes: 1425,
      endMinutes: 1440,
    });
  });

  it("formatTimeRange 格式化", () => {
    const now = new Date();
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0).getTime();
    const b = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 30).getTime();
    expect(formatTimeRange(a, b)).toBe("09:00 - 10:30");
  });
});

describe("timeline resize（调整任务块边缘）", () => {
  const d = new Date();
  function tsAt(h: number, m = 0): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
  }

  it("resizeStartTo：拖上边缘到 08:30", () => {
    const end = tsAt(10, 0);
    expect(resizeStartTo(minutesToY(510), end)).toBe(tsAt(8, 30));
  });

  it("resizeStartTo：不能晚于 end-15 分钟", () => {
    const end = tsAt(10, 0);
    // 拖到 09:55 → 吸附到 10:00 → 被钳制到 09:45
    expect(resizeStartTo(minutesToY(595), end)).toBe(tsAt(9, 45));
  });

  it("resizeStartTo：可早于 08:00（全天范围，拖到 06:45）", () => {
    const end = tsAt(10, 0);
    expect(resizeStartTo(minutesToY(400), end)).toBe(tsAt(6, 45));
  });

  it("resizeEndTo：拖下边缘到 10:30", () => {
    const start = tsAt(9, 0);
    expect(resizeEndTo(minutesToY(630), start)).toBe(tsAt(10, 30));
  });

  it("resizeEndTo：不能早于 start+15 分钟", () => {
    const start = tsAt(9, 0);
    // 拖到 09:05 → 吸附到 09:00 → 被钳制到 09:15
    expect(resizeEndTo(minutesToY(545), start)).toBe(tsAt(9, 15));
  });

  it("resizeEndTo：不能晚于 24:00", () => {
    const start = tsAt(23, 0);
    expect(resizeEndTo(minutesToY(1440), start)).toBe(tsAt(24, 0));
  });
});

describe("timeline move（拖动任务块整体移动）", () => {
  const d = new Date();
  function tsAt(h: number, m = 0): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
  }

  it("向下移 1 小时（保持时长）", () => {
    const r = moveTaskBy(tsAt(9, 0), tsAt(10, 0), 60 * PX_PER_MINUTE);
    expect(r).toEqual({ startMs: tsAt(10, 0), endMs: tsAt(11, 0) });
  });

  it("向上移 30 分钟", () => {
    const r = moveTaskBy(tsAt(10, 0), tsAt(11, 0), -30 * PX_PER_MINUTE);
    expect(r).toEqual({ startMs: tsAt(9, 30), endMs: tsAt(10, 30) });
  });

  it("吸附到 15 分钟", () => {
    // 移动 10 分钟（非 15 倍数）→ start 吸附到 09:15
    const r = moveTaskBy(tsAt(9, 0), tsAt(10, 0), 10 * PX_PER_MINUTE);
    expect(new Date(r.startMs).getHours()).toBe(9);
    expect(new Date(r.startMs).getMinutes()).toBe(15);
  });

  it("可移到 00:00 之前范围（全天，向上 2 小时 → 07:00）", () => {
    const r = moveTaskBy(tsAt(9, 0), tsAt(10, 0), -120 * PX_PER_MINUTE);
    expect(new Date(r.startMs).getHours()).toBe(7);
    expect(new Date(r.startMs).getMinutes()).toBe(0);
  });

  it("不能移到 24:00 之后（23:00 移 +2h → 钳制到 23:30）", () => {
    const r = moveTaskBy(tsAt(23, 0), tsAt(23, 30), 120 * PX_PER_MINUTE);
    expect(new Date(r.startMs).getHours()).toBe(23);
    expect(new Date(r.startMs).getMinutes()).toBe(30);
  });
});

describe("timeline 自定义 TimelineConfig（设置页可配）", () => {
  const CUSTOM = { startMinutes: 9 * 60, endMinutes: 22 * 60, snapMinutes: 30 };

  it("坐标与缩放由 pxPerMinute 决定（与 config 范围无关，全天绝对）", () => {
    expect(minutesToY(10 * 60)).toBe(10 * 60 * PX_PER_MINUTE); // 默认 1.5
    expect(minutesToY(10 * 60, 3)).toBe(10 * 60 * 3); // 缩放 3
    expect(timeToY(tsAt(10, 0))).toBe(600 * PX_PER_MINUTE);
  });

  it("snapMinutes 使用自定义粒度", () => {
    expect(snapMinutes(40, CUSTOM)).toBe(30);
    expect(snapMinutes(50, CUSTOM)).toBe(60);
  });

  it("dragRangeToMinutes 全天钳制（末端 24:00，最小一个粒度）", () => {
    const r = dragRangeToMinutes(minutesToY(1440), minutesToY(1440), CUSTOM);
    expect(r).toEqual({ startMinutes: 1410, endMinutes: 1440 });
  });

  it("moveTaskBy 保持时长且全天钳制（23:30 起 +2h → 钳到 24:00 前 30 分钟）", () => {
    const r = moveTaskBy(tsAt(21, 30), tsAt(22, 0), 300 * PX_PER_MINUTE, CUSTOM);
    expect(new Date(r.startMs).getHours()).toBe(23);
    expect(new Date(r.startMs).getMinutes()).toBe(30);
    expect(r.endMs - r.startMs).toBe(30 * 60_000); // 时长保持
  });

  it("resizeEndTo 全天末端 24:00", () => {
    const end = resizeEndTo(1_000_000, tsAt(23, 30), CUSTOM);
    expect(end).toBe(tsAt(24, 0)); // 24:00 = 次日 00:00
  });

  it("省略 config 时保持默认行为", () => {
    expect(minutesToY(8 * 60)).toBe(8 * 60 * PX_PER_MINUTE);
    expect(snapMinutes(22)).toBe(15); // 22/15 → 取整 15
    expect(snapMinutes(23)).toBe(30); // 23/15 → 取整 30
  });
});

describe("clampBlockY（范围外任务渲染夹取，B4）", () => {
  const H = 1440;
  it("范围内任务不变", () => {
    expect(clampBlockY(100, 200, H)).toEqual({ top: 100, height: 100 });
  });
  it("完全在顶部之上返回 null（不渲染）", () => {
    expect(clampBlockY(-100, -50, H)).toBeNull();
  });
  it("完全在底部之下返回 null（不渲染）", () => {
    expect(clampBlockY(1500, 1600, H)).toBeNull();
  });
  it("部分越顶：夹到 0", () => {
    expect(clampBlockY(-50, 100, H)).toEqual({ top: 0, height: 100 });
  });
  it("部分越底：夹到总高", () => {
    expect(clampBlockY(1400, 1500, H)).toEqual({ top: 1400, height: 40 });
  });
  it("高度不足最小高度时补到 MIN_BLOCK_HEIGHT", () => {
    expect(clampBlockY(100, 102, H)).toEqual({ top: 100, height: MIN_BLOCK_HEIGHT });
  });
});

describe("跨天任务移动（B5）", () => {
  function tsAt(h: number, m = 0): number {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
  }

  it("23:30 → 次日 00:30 移动 0：时长用时间戳差保持 60 分钟，不产生负区间", () => {
    const start = tsAt(23, 30);
    const end = tsAt(0, 30) + 86_400_000; // 次日 00:30
    const r = moveTaskBy(start, end, 0);
    expect(r.endMs - r.startMs).toBe(60 * 60_000); // 时长保持 1 小时
    expect(r.endMs).toBeGreaterThan(r.startMs); // 不再 end 早于 start
  });
});

describe("computeLanes（重叠分栏）", () => {
  const M = 60_000;
  function sp(id: number, s: number, e: number): TimeSpan {
    return { id, startMs: s * M, endMs: e * M };
  }

  it("两个重叠任务各占一栏", () => {
    const lanes = computeLanes([sp(1, 0, 60), sp(2, 10, 70)]);
    expect(lanes.get(1)).toEqual({ lane: 1, laneCount: 2 });
    expect(lanes.get(2)).toEqual({ lane: 2, laneCount: 2 });
  });

  it("传递重叠 A-B-C 用 2 栏（A、C 同栏）", () => {
    const lanes = computeLanes([
      sp(1, 0, 60),
      sp(2, 30, 90),
      sp(3, 60, 120),
    ]);
    expect(lanes.get(1)).toEqual({ lane: 1, laneCount: 2 });
    expect(lanes.get(2)).toEqual({ lane: 2, laneCount: 2 });
    expect(lanes.get(3)).toEqual({ lane: 1, laneCount: 2 });
  });

  it("三个同时重叠用 3 栏", () => {
    const lanes = computeLanes([sp(1, 0, 60), sp(2, 10, 50), sp(3, 20, 40)]);
    expect(lanes.get(1)?.laneCount).toBe(3);
    expect(lanes.get(2)?.laneCount).toBe(3);
    expect(lanes.get(3)?.laneCount).toBe(3);
  });

  it("独立重叠组互不影响", () => {
    const lanes = computeLanes([
      sp(1, 0, 60), sp(2, 10, 50),
      sp(3, 120, 180), sp(4, 130, 170), sp(5, 140, 160),
    ]);
    expect(lanes.get(1)?.laneCount).toBe(2);
    expect(lanes.get(3)?.laneCount).toBe(3);
    expect(lanes.get(4)?.laneCount).toBe(3);
  });

  it("无重叠任务不在 Map 中（渲染时全宽）", () => {
    const lanes = computeLanes([sp(1, 0, 60), sp(2, 120, 180)]);
    expect(lanes.has(1)).toBe(false);
    expect(lanes.has(2)).toBe(false);
  });

  it("prefer 空闲栏被优先使用", () => {
    // 1 与 2 重叠；给 2 偏好栏 1（0-based）→ 2 占用第 2 栏
    const lanes = computeLanes([sp(1, 0, 60), sp(2, 10, 70)], (id) => (id === 2 ? 1 : undefined));
    expect(lanes.get(2)).toEqual({ lane: 2, laneCount: 2 });
    expect(lanes.get(1)).toEqual({ lane: 1, laneCount: 2 });
  });

  it("prefer 被占用则贪心回退", () => {
    // 给 2 偏好栏 0（被 1 占用）→ 回退到贪心第 2 栏
    const lanes = computeLanes([sp(1, 0, 60), sp(2, 10, 70)], (id) => (id === 2 ? 0 : undefined));
    expect(lanes.get(2)).toEqual({ lane: 2, laneCount: 2 });
    expect(lanes.get(1)).toEqual({ lane: 1, laneCount: 2 });
  });

  it("prefer 扩展到新栏（横向拖动到更右）", () => {
    const lanes = computeLanes([sp(1, 0, 60), sp(2, 10, 70)], (id) => (id === 1 ? 3 : undefined));
    expect(lanes.get(1)?.lane).toBe(4); // 0-based 偏好 3 → 1-based 4
    expect(lanes.get(1)?.laneCount).toBe(4);
    expect(lanes.get(2)?.laneCount).toBe(4);
  });
});
