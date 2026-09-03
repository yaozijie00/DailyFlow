import { describe, it, expect } from "vitest";
import { postponeTargets } from "./postpone";

describe("postponeTargets（延期目标日期）", () => {
  it("周一（2026-09-28）：明天周二 / 周末周六(10-03) / 下周一(10-05)", () => {
    const t = postponeTargets("2026-09-28");
    expect(t.tomorrow).toBe("2026-09-29");
    expect(t.weekend).toBe("2026-10-03");
    expect(t.nextWeek).toBe("2026-10-05");
  });

  it("周五：周末=次日周六；下周一为后天", () => {
    const t = postponeTargets("2026-10-02");
    expect(t.tomorrow).toBe("2026-10-03");
    expect(t.weekend).toBe("2026-10-03");
    expect(t.nextWeek).toBe("2026-10-05");
  });

  it("周六：周末=次日周日；下周一为后天", () => {
    const t = postponeTargets("2026-10-03");
    expect(t.tomorrow).toBe("2026-10-04");
    expect(t.weekend).toBe("2026-10-04");
    expect(t.nextWeek).toBe("2026-10-05");
  });

  it("周日：周末=下周六；下周一=明天", () => {
    const t = postponeTargets("2026-10-04");
    expect(t.tomorrow).toBe("2026-10-05");
    expect(t.weekend).toBe("2026-10-10");
    expect(t.nextWeek).toBe("2026-10-05");
  });

  it("跨年日期仍正确", () => {
    const t = postponeTargets("2026-12-31"); // 周四
    expect(t.tomorrow).toBe("2027-01-01");
    expect(t.weekend).toBe("2027-01-02");
    expect(t.nextWeek).toBe("2027-01-04");
  });
});
