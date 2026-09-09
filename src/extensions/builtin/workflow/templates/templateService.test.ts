import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../../../db/db";
import { createTestDb } from "../../../../db/test-helpers";
import { WorkflowRepository } from "../repository/workflowRepository";
import { BUILT_IN_WORKFLOW_TEMPLATES } from "./builtIns";
import {
  WorkflowTemplateService,
  type WorkflowTemplateMetadata,
  type WorkflowTemplateMetadataStore,
} from "./templateService";

function memoryMetadataStore(): WorkflowTemplateMetadataStore & {
  value: Record<string, WorkflowTemplateMetadata>;
} {
  const store = {
    value: {} as Record<string, WorkflowTemplateMetadata>,
    load: async () => structuredClone(store.value),
    save: async (value: Record<string, WorkflowTemplateMetadata>) => {
      store.value = structuredClone(value);
    },
  };
  return store;
}

describe("WorkflowTemplateService", () => {
  let db: Db;
  let close: () => void;
  let repo: WorkflowRepository;
  let metadata: ReturnType<typeof memoryMetadataStore>;
  let now: number;
  let service: WorkflowTemplateService;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    repo = new WorkflowRepository(db);
    metadata = memoryMetadataStore();
    now = 10_000;
    service = new WorkflowTemplateService(repo, metadata, () => now);
  });

  afterEach(() => close());

  it("provides six stable read-only built-in templates without fixed drive letters", async () => {
    const templates = await service.list({ source: "builtin" });

    expect(templates).toHaveLength(6);
    expect(templates.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "builtin.general-project",
        "builtin.frontend-project",
        "builtin.design-project",
        "builtin.daily-start",
        "builtin.daily-review",
        "builtin.fixed-environment",
      ]),
    );
    expect(templates.every((item) => item.readOnly && item.source === "builtin")).toBe(true);
    expect(JSON.stringify(BUILT_IN_WORKFLOW_TEMPLATES)).not.toMatch(/[A-Za-z]:[\\/]/);
    const fileNodes = templates.flatMap((item) => item.nodes).filter((item) => item.type === "files.create-text-file");
    expect(fileNodes.every((item) => item.config.conflict === "fail")).toBe(true);
  });

  it("returns defensive copies and creates a personal copy before editing a built-in", async () => {
    const first = await service.get("builtin.general-project");
    expect(first).not.toBeNull();
    first!.name = "被调用方修改";
    first!.nodes[0].title = "被修改";

    const fresh = await service.get("builtin.general-project");
    expect(fresh?.name).toBe("创建通用项目目录");
    expect(fresh?.nodes[0].title).toBe("开始");

    const copy = await service.duplicateForEdit("builtin.general-project");
    expect(copy).toMatchObject({ source: "personal", readOnly: false, version: 1 });
    expect(copy.id).not.toBe("builtin.general-project");
    expect(copy.nodes.map((item) => item.id)).not.toEqual(fresh?.nodes.map((item) => item.id));
    expect(await repo.getV2(copy.id)).not.toBeNull();
    expect((await service.get("builtin.general-project"))?.name).toBe("创建通用项目目录");
  });

  it("searches name, description and tags and filters by source", async () => {
    expect((await service.list({ search: "前端" })).map((item) => item.id)).toEqual([
      "builtin.frontend-project",
    ]);
    expect((await service.list({ search: "稳定的收尾习惯" })).map((item) => item.id)).toEqual([
      "builtin.daily-review",
    ]);
    expect((await service.list({ search: "应用" })).map((item) => item.id)).toContain(
      "builtin.fixed-environment",
    );

    await service.duplicateForEdit("builtin.design-project");
    const personal = await service.list({ source: "personal" });
    expect(personal).toHaveLength(1);
    expect(personal[0].source).toBe("personal");
  });

  it("persists favorites and sorts recently used templates", async () => {
    await service.setFavorite("builtin.general-project", true);
    now = 20_000;
    await service.markUsed("builtin.design-project");
    now = 30_000;
    await service.markUsed("builtin.frontend-project");

    expect((await service.list({ favorite: true })).map((item) => item.id)).toEqual([
      "builtin.general-project",
    ]);
    const recent = await service.list({ sort: "recent" });
    expect(recent.slice(0, 2).map((item) => item.id)).toEqual([
      "builtin.frontend-project",
      "builtin.design-project",
    ]);
    expect(metadata.value["builtin.general-project"].favorite).toBe(true);
    expect(metadata.value["builtin.frontend-project"].lastUsedAt).toBe(30_000);
  });
});
