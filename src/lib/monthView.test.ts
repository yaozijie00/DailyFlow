import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  monthDays,
  monthLabel,
  dateKey,
  daySpanInMonth,
  shiftDateRange,
  weekdayOf,
  monthGrid,
  weekDayNames,
  segmentInWeek,
  assignLanes,
  overflowCounts,
  type GoalRangeInput,
  type WeekSegment,
} from "./monthView";

describe("daysInMonth（动态天数，不硬编码）", () => {
  it("2026 年 9 月 30 天", () => {
    expect(daysInMonth(2026, 8)).toBe(30);
  });
  it("2026 年 10 月 31 天", () => {
    expect(daysInMonth(2026, 9)).toBe(31);
  });
  it("平年 2 月 28 天、闰年 2 月 29 天", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2024, 1)).toBe(29);
  });
  it("跨年月份正常", () => {
    expect(daysInMonth(2026, 11)).toBe(31); // 2026-12
    expect(daysInMonth(2027, 0)).toBe(31); // 2027-01
  });
});

describe("monthDays（月度日时间轴：每月每天一列）", () => {
  it("2026 年 9 月生成 1..30 共 30 个日期列（非 7 列）", () => {
    const days = monthDays(2026, 8);
    expect(days).toHaveLength(30);
    expect(days[0]).toMatchObject({ date: "2026-09-01", day: 1 });
    expect(days[29]).toMatchObject({ date: "2026-09-30", day: 30 });
  });

  it("每天带星期标注；2026-09-01 为周二", () => {
    const days = monthDays(2026, 8);
    expect(days[0].weekday).toBe("周二");
    expect(days[2].weekday).toBe("周四");
  });

  it("今天高亮标记", () => {
    const days = monthDays(2026, 8, "2026-09-02");
    expect(days.find((d) => d.isToday)?.day).toBe(2);
  });

  it("weekdayOf：2026-09-05 周六 / 09-06 周日", () => {
    expect(weekdayOf("2026-09-05")).toBe("周六");
    expect(weekdayOf("2026-09-06")).toBe("周日");
  });
});

describe("daySpanInMonth（任务块日跨度 + 跨月裁剪）", () => {
  it("完全在月内：3～8 → {start:3,end:8}", () => {
    expect(daySpanInMonth("2026-09-03", "2026-09-08", 2026, 8)).toEqual({ start: 3, end: 8 });
  });
  it("跨月任务：8/25～9/10 → 裁剪为 1～10", () => {
    expect(daySpanInMonth("2026-08-25", "2026-09-10", 2026, 8)).toEqual({ start: 1, end: 10 });
  });
  it("跨月任务：9/25～10/05 → 裁剪为 25～30", () => {
    expect(daySpanInMonth("2026-09-25", "2026-10-05", 2026, 8)).toEqual({ start: 25, end: 30 });
  });
  it("与本月无交集返回 null", () => {
    expect(daySpanInMonth("2026-07-01", "2026-07-10", 2026, 8)).toBeNull();
    expect(daySpanInMonth("2026-11-01", "2026-11-30", 2026, 8)).toBeNull();
  });
  it("无日期范围返回 null", () => {
    expect(daySpanInMonth(null, "2026-09-10", 2026, 8)).toBeNull();
  });
});

describe("shiftDateRange（日级平移）", () => {
  it("+5 天", () => {
    expect(shiftDateRange("2026-09-05", "2026-09-20", 5)).toEqual({
      startDate: "2026-09-10",
      endDate: "2026-09-25",
    });
  });
  it("-3 天", () => {
    expect(shiftDateRange("2026-09-05", "2026-09-20", -3)).toEqual({
      startDate: "2026-09-02",
      endDate: "2026-09-17",
    });
  });
  it("跨月平移", () => {
    expect(shiftDateRange("2026-09-29", "2026-10-02", 3)).toEqual({
      startDate: "2026-10-02",
      endDate: "2026-10-05",
    });
  });
});

describe("monthLabel / dateKey", () => {
  it("monthLabel", () => {
    expect(monthLabel(2026, 8)).toBe("2026年9月");
  });
  it("dateKey", () => {
    expect(dateKey(new Date(2026, 8, 5))).toBe("2026-09-05");
  });
});

/* ==================== v1.6.2 月历网格模型 ==================== */

describe("monthGrid（月历网格：周一为首、7 列、4~6 行、真实日期补位）", () => {
  it("2026年9月：30 天，5 行；头部补 8/31，尾部补 10/1~10/4", () => {
    const weeks = monthGrid(2026, 8, "2026-09-15");
    expect(weeks).toHaveLength(5);
    const first = weeks[0];
    expect(first.startDate).toBe("2026-08-31");
    expect(first.cells[0]).toMatchObject({ date: "2026-08-31", day: 31, inMonth: false, weekday: "周一" });
    expect(first.cells[1]).toMatchObject({ date: "2026-09-01", day: 1, inMonth: true, weekday: "周二" });
    const last = weeks[4];
    expect(last.startDate).toBe("2026-09-28");
    expect(last.cells[2]).toMatchObject({ date: "2026-09-30", inMonth: true });
    expect(last.cells[6]).toMatchObject({ date: "2026-10-04", inMonth: false });
    // 今天标记
    const today = weeks.flatMap((w) => w.cells).find((c) => c.date === "2026-09-15");
    expect(today?.isToday).toBe(true);
    // 周末标记
    expect(first.cells[5].isWeekend).toBe(true); // 9/5 周六
  });

  it("2026年8月（31 天，8/1 周六）：5 补位 → 6 行", () => {
    const weeks = monthGrid(2026, 7);
    expect(weeks).toHaveLength(6);
    expect(weeks[0].startDate).toBe("2026-07-27");
    expect(weeks[5].cells[0]).toMatchObject({ date: "2026-08-31", inMonth: true });
    expect(weeks[5].cells[6]).toMatchObject({ date: "2026-09-06", inMonth: false });
  });

  it("2026年2月（28 天，2/1 周日）：6 补位 → 5 行", () => {
    const weeks = monthGrid(2026, 1);
    expect(weeks).toHaveLength(5);
    expect(weeks[0].startDate).toBe("2026-01-26");
    expect(weeks[0].cells[6]).toMatchObject({ date: "2026-02-01", day: 1, inMonth: true });
  });

  it("2027年2月（28 天且 2/1 为周一）：整月正好 4 行", () => {
    const weeks = monthGrid(2027, 1);
    expect(weeks).toHaveLength(4);
    expect(weeks[0].startDate).toBe("2027-02-01");
    expect(weeks[3].cells[6]).toMatchObject({ date: "2027-02-28", inMonth: true });
  });

  it("2028年2月（闰年 29 天，2/1 周二）：1 补位 → 5 行", () => {
    const weeks = monthGrid(2028, 1);
    expect(weeks).toHaveLength(5);
    expect(weeks[0].startDate).toBe("2028-01-31");
    expect(weeks[0].cells[1]).toMatchObject({ date: "2028-02-01", inMonth: true });
    expect(weeks[4].cells[1]).toMatchObject({ date: "2028-02-29", inMonth: true });
  });

  it("跨年正确：2026年12月尾部补 2027年1月；2027年1月头部补 2026年12月", () => {
    const dec = monthGrid(2026, 11, "2026-12-31");
    const last = dec[dec.length - 1];
    expect(last.cells.some((c) => c.date === "2027-01-02")).toBe(true);
    const jan = monthGrid(2027, 0, "2027-01-01"); // 2027-01-01 周五 → 头部从 12/28（周一）补起
    expect(jan[0].startDate).toBe("2026-12-28");
    expect(jan[0].cells.some((c) => c.date === "2026-12-31" && !c.inMonth)).toBe(true);
  });

  it("任意月份：当月每一天恰好出现一次（28/29/30/31 全覆盖）", () => {
    const samples: Array<[number, number]> = [
      [2026, 0], [2026, 1], [2026, 7], [2026, 8], [2026, 11], [2027, 0], [2028, 1],
    ];
    for (const [y, m] of samples) {
      const weeks = monthGrid(y, m, "2026-09-15");
      for (const w of weeks) {
        expect(w.cells).toHaveLength(7);
        expect(w.cells[0].weekday).toBe("周一");
        expect(w.cells[6].weekday).toBe("周日");
      }
      const n = daysInMonth(y, m);
      const inMonthDays = weeks
        .flatMap((w) => w.cells)
        .filter((c) => c.inMonth)
        .map((c) => c.day)
        .sort((a, b) => a - b);
      expect(inMonthDays).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });
});

const g = (id: number, title: string, s: string, e: string, progress = 50): GoalRangeInput => ({
  id,
  title,
  startDate: s,
  endDate: e,
  progressPercent: progress,
});

describe("segmentInWeek（跨周自动拆段 + 显示月裁剪）", () => {
  const weeks = monthGrid(2026, 8, "2026-09-15"); // 9 月：5 周
  const seg = (goal: GoalRangeInput, wi: number): WeekSegment | null =>
    segmentInWeek(goal, 2026, 8, weeks[wi]);

  it("9/3→9/18 跨三周：首段带左柄、末段带右柄、中段无柄", () => {
    const goal = g(1, "Unity开发", "2026-09-03", "2026-09-18");
    const s0 = seg(goal, 0); // 8/31(周一)~9/6(周日)；9/3=周四 col3，9/6=周日 col6
    expect(s0).toMatchObject({ startCol: 3, endCol: 6, startsGoal: true, endsGoal: false, startDate: "2026-09-03", endDate: "2026-09-06" });
    const s1 = seg(goal, 1); // 9/7~9/13
    expect(s1).toMatchObject({ startCol: 0, endCol: 6, startsGoal: false, endsGoal: false });
    const s2 = seg(goal, 2); // 9/14~9/20
    expect(s2).toMatchObject({ startCol: 0, endCol: 4, startsGoal: false, endsGoal: true, startDate: "2026-09-14", endDate: "2026-09-18" });
    expect(seg(goal, 3)).toBeNull();
    expect(seg(goal, 4)).toBeNull();
  });

  it("跨月任务裁剪：8/25→9/10 在 9 月从 9/1 显示，首段无左柄", () => {
    const goal = g(2, "跨上月", "2026-08-25", "2026-09-10");
    const s0 = seg(goal, 0);
    expect(s0).toMatchObject({ startCol: 1, endCol: 6, startsGoal: false, endsGoal: false, continuesBefore: true, startDate: "2026-09-01", endDate: "2026-09-06" });
    const s1 = seg(goal, 1);
    expect(s1).toMatchObject({ startCol: 0, endCol: 3, endsGoal: true, startDate: "2026-09-07", endDate: "2026-09-10" });
  });

  it("跨下月任务：9/25→10/5 在 9 月尾行显示到 9/30（无右柄，continuesAfter）", () => {
    const goal = g(3, "跨下月", "2026-09-25", "2026-10-05");
    const s = seg(goal, 4); // 9/28~10/4
    expect(s).toMatchObject({ startCol: 0, endCol: 2, startsGoal: false, endsGoal: false, continuesAfter: true, startDate: "2026-09-28", endDate: "2026-09-30" });
  });

  it("单日任务：段宽 1，起止柄同在", () => {
    const goal = g(4, "单日", "2026-09-10", "2026-09-10");
    const s = seg(goal, 1);
    expect(s).toMatchObject({ startCol: 3, endCol: 3, startsGoal: true, endsGoal: true });
  });

  it("与显示月无交集返回 null；无日期范围返回 null", () => {
    expect(seg(g(5, "十月", "2026-10-01", "2026-10-10"), 0)).toBeNull();
    expect(seg(g(6, "七月", "2026-07-01", "2026-07-10"), 0)).toBeNull();
    const noRange = { id: 7, title: "无期", startDate: "2026-09-01", endDate: "2026-09-01", progressPercent: 0 };
    expect(segmentInWeek({ ...noRange, startDate: "bad" }, 2026, 8, weeks[0])).toBeNull();
  });
});

describe("assignLanes（行内轨道防重叠）", () => {
  it("同区间重叠任务分到不同轨道", () => {
    // A 0~6, B 2~3, C 5~6（同一行内）
    const lanes = assignLanes([{ startCol: 0, endCol: 6 }, { startCol: 2, endCol: 3 }, { startCol: 5, endCol: 6 }]);
    expect(lanes).toEqual([0, 1, 1]);
    // 校验：同一轨道内的段互不重叠
    for (const l of new Set(lanes)) {
      const segs = [0, 1, 2].filter((i) => lanes[i] === l).map((i) =>
        i === 0 ? { startCol: 0, endCol: 6 } : i === 1 ? { startCol: 2, endCol: 3 } : { startCol: 5, endCol: 6 },
      );
      segs.sort((a, b) => a.startCol - b.startCol);
      for (let i = 1; i < segs.length; i++) {
        expect(segs[i - 1].endCol).toBeLessThan(segs[i].startCol);
      }
    }
  });
  it("不重叠任务可复用同一轨道（贪心最早结束）", () => {
    const lanes = assignLanes([{ startCol: 0, endCol: 1 }, { startCol: 2, endCol: 3 }, { startCol: 4, endCol: 5 }]);
    expect(lanes).toEqual([0, 0, 0]);
  });
});

describe("overflowCounts（+N 更多折叠计数）", () => {
  it("4 段 3 轨道、MAX_LANES=2：超出的按日计数", () => {
    const segs = [
      { startCol: 0, endCol: 6 },
      { startCol: 2, endCol: 3 },
      { startCol: 5, endCol: 6 },
      { startCol: 3, endCol: 4 },
    ];
    const lanes = assignLanes(segs);
    expect(lanes).toEqual([0, 1, 1, 2]);
    const overflow = overflowCounts(segs, lanes, 2);
    // col3：A+B+D=3 覆盖，可见 A+B=2 → 溢出 1；col4：A+D=2，可见 A=1 → 溢出 1
    expect(overflow[3]).toBe(1);
    expect(overflow[4]).toBe(1);
    expect(overflow[0]).toBe(0); // 仅 A
    expect(overflow[6]).toBe(0); // A+C 均可见
  });
  it("无溢出时全为 0", () => {
    const segs = [{ startCol: 0, endCol: 6 }];
    expect(overflowCounts(segs, assignLanes(segs), 3)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("周起始日（weekStart：周一/周日）", () => {
  it("weekDayNames：周一首列 vs 周日首列", () => {
    expect(weekDayNames("monday")).toEqual(["周一", "周二", "周三", "周四", "周五", "周六", "周日"]);
    expect(weekDayNames("sunday")).toEqual(["周日", "周一", "周二", "周三", "周四", "周五", "周六"]);
    expect(weekDayNames()).toEqual(weekDayNames("monday")); // 默认周一
  });

  it("2026-09-01 是周二：周一为首首格 08/31，周日为首首格 08/30", () => {
    const mon = monthGrid(2026, 8, "2026-09-15", "monday");
    expect(mon[0].cells[0].date).toBe("2026-08-31");
    expect(mon[0].cells[0].weekday).toBe("周一");
    const sun = monthGrid(2026, 8, "2026-09-15", "sunday");
    expect(sun[0].cells[0].date).toBe("2026-08-30");
    expect(sun[0].cells[0].weekday).toBe("周日");
    expect(sun[0].cells[6].date).toBe("2026-09-05"); // 周六收尾
  });
});
