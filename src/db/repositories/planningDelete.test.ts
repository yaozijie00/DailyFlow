import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../test-helpers";
import { GoalRepository } from "./goalRepository";
import { ProjectRepository } from "./projectRepository";
import { PlanningRepository } from "./planningRepository";
import { GoalService } from "../../services/goalService";
import { ProjectService } from "../../services/projectService";
import { undoManager } from "../../lib/undoManager";

describe("长期事项删除撤销", () => {
  let data: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => { data = await createTestDb(); undoManager.clear(); });
  afterEach(() => { undoManager.clear(); data.close(); });
  it.each(["plan", "project"] as const)("%s 恢复准备信息和原始周承诺", async (kind) => {
    const service = kind === "plan" ? new GoalService(new GoalRepository(data.db)) : new ProjectService(new ProjectRepository(data.db));
    const item = await service.create({ title: "需要保留的长期事项" });
    const key = `${kind}:${item.id}`;
    const planning = new PlanningRepository(data.db);
    await planning.updateMeta(key, { lifecycle: "preparation", preparationJson: '[{"title":"收集参考","done":true}]' });
    await planning.setWeek(key, "2026-09-14", 360);
    await planning.setWeek(key, "2026-09-14", 240, "临时调整");
    await service.delete(item.id);
    expect(await planning.getMeta(key)).toBeNull();
    await undoManager.undo();
    expect(await planning.getMeta(key)).toMatchObject({ lifecycle: "preparation", preparationJson: '[{"title":"收集参考","done":true}]' });
    expect(await planning.getWeek(key, "2026-09-14")).toMatchObject({ originalMinutes: 360, targetMinutes: 240, reason: "临时调整" });
    await undoManager.redo();
    expect(await planning.getMeta(key)).toBeNull();
    await undoManager.undo();
    expect((await planning.getWeek(key, "2026-09-14"))?.originalMinutes).toBe(360);
  });
});
