import { describe, expect, it, vi } from "vitest";
import type { WorkflowV2, WorkflowNodeV2 } from "../domain/types";
import { createFileSystemNodeDefinitions } from "./fileSystemNodes";
import { createSystemNodeDefinitions } from "./systemNodes";
import { createDailyFlowNodeDefinitions } from "./dailyFlowNodes";

const workflow: WorkflowV2 = { id: "wf", schemaVersion: 2, name: "x", version: 1, variables: [], nodes: [], edges: [], tags: [], createdAt: 1, updatedAt: 1 };
function node(type: string, config: Record<string, unknown>): WorkflowNodeV2 {
  return { id: type, type, typeVersion: 1, title: type, position: { x: 0, y: 0 }, config };
}
function context(item: WorkflowNodeV2) {
  return { workflow, node: item, variables: {}, resolvedConfig: item.config };
}

describe("built-in file system nodes", () => {
  it("previews and creates a directory tree", async () => {
    const bridge = {
      inspectPaths: vi.fn(async (paths: string[]) => paths.map((path) => ({ path, exists: false, kind: "missing" as const }))),
      createDirectories: vi.fn(async (paths: string[]) => paths),
      writeTextFile: vi.fn(), copyPath: vi.fn(),
    };
    const definition = createFileSystemNodeDefinitions(bridge).find((item) => item.type === "files.create-directory-tree")!;
    const item = node(definition.type, { root: "D:\\Projects\\Demo", entries: ["src", "assets/source"] });
    expect(definition.validate(item.config, context(item))).toEqual([]);
    const effects = await definition.preview(item.config, context(item));
    expect(effects.map((effect) => effect.target)).toEqual(["D:\\Projects\\Demo\\src", "D:\\Projects\\Demo\\assets\\source"]);
    const result = await definition.execute(item.config, { ...context(item), trace: [] });
    expect(result.status).toBe("completed");
    expect(bridge.createDirectories).toHaveBeenCalledWith(effects.map((effect) => effect.target));
  });

  it("rejects unsafe directory tree entries", () => {
    const bridge = { inspectPaths: vi.fn(), createDirectories: vi.fn(), writeTextFile: vi.fn(), copyPath: vi.fn() };
    const definition = createFileSystemNodeDefinitions(bridge).find((item) => item.type === "files.create-directory-tree")!;
    const item = node(definition.type, { root: "D:\\Projects", entries: ["../outside"] });
    expect(definition.validate(item.config, context(item))).toEqual([expect.objectContaining({ code: "files.invalid-tree-entry" })]);
  });

  it("marks overwrite as destructive and returns the actual renamed path", async () => {
    const bridge = {
      inspectPaths: vi.fn(async (paths: string[]) => paths.map((path) => ({ path, exists: true, kind: "file" as const }))),
      createDirectories: vi.fn(),
      writeTextFile: vi.fn(async () => ({ outcome: "renamed" as const, actualPath: "D:\\Project\\README (1).md" })),
      copyPath: vi.fn(),
    };
    const definition = createFileSystemNodeDefinitions(bridge).find((item) => item.type === "files.create-text-file")!;
    const overwrite = node(definition.type, { path: "D:\\Project\\README.md", content: "x", conflict: "overwrite" });
    expect((await definition.preview(overwrite.config, context(overwrite)))[0]).toMatchObject({ conflict: "overwrite", destructive: true });
    const renamed = node(definition.type, { path: "D:\\Project\\README.md", content: "x", conflict: "rename" });
    expect((await definition.execute(renamed.config, { ...context(renamed), trace: [] })).affectedPaths).toEqual(["D:\\Project\\README (1).md"]);
  });
});

describe("system and DailyFlow nodes", () => {
  it("blocks command execution until the preference is enabled", () => {
    const bridge = {
      inspectPaths: vi.fn(), openFile: vi.fn(), openFolder: vi.fn(), openUrl: vi.fn(),
      launchProcess: vi.fn(), executeProcess: vi.fn(),
    };
    const definition = createSystemNodeDefinitions(bridge).find((item) => item.type === "system.execute-process")!;
    const item = node(definition.type, { executable: "C:\\Tools\\generator.exe", arguments: [] });
    expect(definition.validate(item.config, context(item))).toEqual([
      expect.objectContaining({ code: "system.command-disabled" }),
    ]);
  });

  it("creates and completes tasks through injected host capabilities", async () => {
    const tasks = { createWithId: vi.fn(async () => ({ ok: true, id: 9 })), complete: vi.fn(async () => true) };
    const definitions = createDailyFlowNodeDefinitions(tasks);
    const create = definitions.find((item) => item.type === "dailyflow.create-task")!;
    const createNode = node(create.type, { title: "初始化项目", scheduledDate: "2026-09-09" });
    expect(await create.execute(createNode.config, { ...context(createNode), trace: [] })).toMatchObject({ status: "completed", output: { taskId: 9 } });
    expect(tasks.createWithId).toHaveBeenCalledWith({ title: "初始化项目", scheduledDate: "2026-09-09" });

    const complete = definitions.find((item) => item.type === "dailyflow.complete-task")!;
    const completeNode = node(complete.type, {});
    expect(await complete.execute({}, { ...context(completeNode), trace: [], taskId: 9 })).toMatchObject({ status: "completed" });
    expect(tasks.complete).toHaveBeenCalledWith(9);
  });
});
