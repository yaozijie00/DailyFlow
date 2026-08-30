import { describe, it, expect } from "vitest";
import { loadAchievementDefinitions, validateDefinition } from "./definitions";

describe("validateDefinition", () => {
  const valid = {
    id: "first_pomodoro",
    name: "第一步",
    description: "完成第一个番茄钟",
    icon: "Flag",
    category: "basic",
    condition: { type: "event_count", target: 1 },
  };

  it("合法定义通过", () => {
    const d = validateDefinition(valid);
    expect(d?.id).toBe("first_pomodoro");
    expect(d?.enabled).toBe(true);
    expect(d?.hidden).toBe(false);
  });

  it("缺 id / name / description / icon 返回 null", () => {
    expect(validateDefinition({ ...valid, id: "" })).toBeNull();
    expect(validateDefinition({ ...valid, name: "" })).toBeNull();
    expect(validateDefinition({ ...valid, description: undefined })).toBeNull();
    expect(validateDefinition({ ...valid, icon: "" })).toBeNull();
  });

  it("非法条件（缺 target / 未知 type / 缺 categoryName）返回 null", () => {
    expect(validateDefinition({ ...valid, condition: { type: "event_count" } })).toBeNull();
    expect(validateDefinition({ ...valid, condition: { type: "nope", target: 1 } })).toBeNull();
    expect(
      validateDefinition({ ...valid, condition: { type: "category_duration", target: 10 } }),
    ).toBeNull();
  });

  it("非对象输入返回 null", () => {
    expect(validateDefinition(null)).toBeNull();
    expect(validateDefinition("x")).toBeNull();
    expect(validateDefinition(42)).toBeNull();
  });
});

describe("loadAchievementDefinitions", () => {
  it("打包加载全部成就配置，且均为 enabled", () => {
    const defs = loadAchievementDefinitions();
    expect(defs.length).toBeGreaterThanOrEqual(1);
    for (const d of defs) {
      expect(d.enabled).toBe(true);
      expect(d.id).toBeTruthy();
      expect(d.condition).toBeTruthy();
    }
  });
});
