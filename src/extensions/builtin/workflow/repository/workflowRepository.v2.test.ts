import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Db } from "../../../../db/db";
import { createTestDb } from "../../../../db/test-helpers";
import type { WorkflowV2 } from "../domain/types";
import { WorkflowRepository } from "./workflowRepository";

const workflow: WorkflowV2 = {
  id: "wf_v2_fixture",
  schemaVersion: 2,
  name: "项目初始化",
  description: "创建项目目录",
  version: 3,
  variables: [
    { key: "project_name", label: "项目名称", type: "text", required: true },
  ],
  nodes: [
    {
      id: "start",
      type: "core.start",
      typeVersion: 1,
      title: "开始",
      position: { x: 0, y: 0 },
      config: {},
    },
    {
      id: "finish",
      type: "core.finish",
      typeVersion: 1,
      title: "完成",
      position: { x: 200, y: 0 },
      config: {},
    },
  ],
  edges: [
    { id: "edge", source: "start", target: "finish", sourcePort: "out", targetPort: "in" },
  ],
  tags: ["项目"],
  createdAt: 100,
  updatedAt: 200,
};

describe("WorkflowRepository V2", () => {
  let db: Db;
  let close: () => void;
  let repo: WorkflowRepository;

  beforeEach(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    close = testDb.close;
    repo = new WorkflowRepository(db);
  });

  afterEach(() => close());

  it("migration creates V2 columns and run step table", async () => {
    const workflowColumns = await db.values(sql`PRAGMA table_info(workflows)`);
    const nodeColumns = await db.values(sql`PRAGMA table_info(workflow_nodes)`);
    const tables = await db.values(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_run_steps'`,
    );

    expect(workflowColumns.map((row) => row[1])).toEqual(
      expect.arrayContaining(["schema_version", "variables_json"]),
    );
    expect(nodeColumns.map((row) => row[1])).toContain("type_version");
    expect(tables).toHaveLength(1);
  });

  it("saves a migrated V2 workflow and reads it without losing ports or variables", async () => {
    await repo.saveMigratedWorkflow(workflow);
    const loaded = await repo.getV2(workflow.id);

    expect(loaded).toEqual(workflow);
  });

  it("freezes workflow and variable snapshots when a run is created", async () => {
    await repo.saveMigratedWorkflow(workflow);
    const run = await repo.createRunWithSnapshot(workflow, { project_name: "DailyFlow" }, 42);

    expect(run.workflowVersion).toBe(3);
    expect(run.workflowSnapshot).toEqual(workflow);
    expect(run.variablesSnapshot).toEqual({ project_name: "DailyFlow" });
    expect(run.taskId).toBe(42);
  });

  it("appends and updates ordered run steps", async () => {
    await repo.saveMigratedWorkflow(workflow);
    const run = await repo.createRunWithSnapshot(workflow, { project_name: "DailyFlow" });
    const first = await repo.appendRunStep(run.id, workflow.nodes[0], 0);
    const second = await repo.appendRunStep(run.id, workflow.nodes[1], 1);
    await repo.updateRunStep(first.id, {
      state: "completed",
      startedAt: 300,
      completedAt: 350,
      output: { ok: true },
    });

    const steps = await repo.listRunSteps(run.id);
    expect(steps.map((step) => step.id)).toEqual([first.id, second.id]);
    expect(steps[0]).toMatchObject({
      sequence: 0,
      state: "completed",
      output: { ok: true },
    });
  });
});
