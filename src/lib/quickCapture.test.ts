import { describe, it, expect } from "vitest";
import { parseQuickCapture, type QuickCaptureContext } from "./quickCapture";

const ctx: QuickCaptureContext = {
  today: "2026-09-28", // 周一
  categories: [
    { id: 1, name: "开发" },
    { id: 2, name: "学习" },
  ],
};

describe("parseQuickCapture（快速捕获解析）", () => {
  it("纯标题：默认今天，无时间", () => {
    const r = parseQuickCapture("写设计文档", ctx);
    expect(r.title).toBe("写设计文档");
    expect(r.scheduledDate).toBe("2026-09-28");
    expect(r.plannedStart).toBeNull();
    expect(r.estimatedDuration).toBeNull();
  });

  it("明天 + 时间 + 时长 + 分类：完整解析", () => {
    const r = parseQuickCapture("明天 14:00 1.5h #开发 写设计文档", ctx);
    expect(r.title).toBe("写设计文档");
    expect(r.scheduledDate).toBe("2026-09-29");
    expect(r.categoryId).toBe(1);
    expect(r.estimatedDuration).toBe(5400);
    // 2026-09-29 14:00 起 90 分钟
    expect(r.plannedStart).toBe(new Date(2026, 8, 29, 14, 0).getTime());
    expect(r.plannedEnd).toBe(new Date(2026, 8, 29, 15, 30).getTime());
  });

  it("后天、周X（下次出现）、MM-DD、跨年兜底", () => {
    expect(parseQuickCapture("后天 整理", ctx).scheduledDate).toBe("2026-09-30");
    // 今天是周一 → 周三是 +2
    expect(parseQuickCapture("周三 例会", ctx).scheduledDate).toBe("2026-09-30");
    // 周日取下次（今天周一 → +6）
    expect(parseQuickCapture("周日 出游", ctx).scheduledDate).toBe("2026-10-04");
    // 10-05 晚于今天
    expect(parseQuickCapture("10-05 出发", ctx).scheduledDate).toBe("2026-10-05");
    // 9-01 早于今天 → 顺延到明年
    expect(parseQuickCapture("9-01 开学", ctx).scheduledDate).toBe("2027-09-01");
    // 绝对日期
    expect(parseQuickCapture("2026-12-31 复盘", ctx).scheduledDate).toBe("2026-12-31");
  });

  it("时间范围 14:00-16:00 生成起止", () => {
    const r = parseQuickCapture("今天 14:00-16:00 联调", ctx);
    expect(r.title).toBe("联调");
    expect(r.plannedStart).toBe(new Date(2026, 8, 28, 14, 0).getTime());
    expect(r.plannedEnd).toBe(new Date(2026, 8, 28, 16, 0).getTime());
  });

  it("给开始时间无时长 → 默认 60 分钟计划区间，预计字段为空", () => {
    const r = parseQuickCapture("今天 21点 阅读", ctx);
    expect(r.title).toBe("阅读");
    expect(r.plannedStart).toBe(new Date(2026, 8, 28, 21, 0).getTime());
    expect(r.plannedEnd).toBe(new Date(2026, 8, 28, 22, 0).getTime());
    expect(r.estimatedDuration).toBeNull();
  });

  it("中文时长单位 90分钟 / 2小时", () => {
    expect(parseQuickCapture("90分钟 健身", ctx).estimatedDuration).toBe(5400);
    expect(parseQuickCapture("2小时 健身", ctx).estimatedDuration).toBe(7200);
  });

  it("未知 #分类 保留在标题（不吞字）", () => {
    const r = parseQuickCapture("#不存在的分类 写文档", ctx);
    expect(r.title).toBe("#不存在的分类 写文档");
    expect(r.categoryId).toBeNull();
  });

  it("标题优先（无前置词）时全部保留为标题", () => {
    const r = parseQuickCapture("写周报 明天", ctx);
    expect(r.title).toBe("写周报 明天");
    expect(r.scheduledDate).toBe("2026-09-28");
  });
});
