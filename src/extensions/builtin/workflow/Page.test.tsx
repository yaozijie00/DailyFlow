// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import WorkflowPage from "./Page";
import { useWorkflowUiStore, workflowUiStorageKey } from "./store/workflowUiStore";

const workflowMock = vi.hoisted(() => ({
  list: [{ id: "w1", name: "石材材质流程", description: "", version: 1, tags: [], updatedAt: 1 }],
  current: null as null | { id: string },
  currentTemplate: null as null | { id: string },
  loadList: vi.fn(async () => undefined),
  load: vi.fn(async () => undefined),
  loadTemplate: vi.fn(async () => undefined),
  create: vi.fn(async () => "w1"),
  remove: vi.fn(async () => undefined),
  duplicate: vi.fn(async () => undefined),
  updateMeta: vi.fn(async () => undefined),
  activeRuns: [],
  loadingRuns: false,
  loadActiveRuns: vi.fn(async () => undefined),
}));

vi.mock("./store/workflowStore", () => ({
  useWorkflowStore: (selector: (state: typeof workflowMock) => unknown) => selector(workflowMock),
}));

const template = vi.hoisted(() => ({
  id: "builtin.general-project",
  schemaVersion: 2 as const,
  name: "创建通用项目目录",
  description: "建立常用目录",
  version: 1,
  variables: [],
  nodes: [],
  edges: [],
  tags: ["项目"],
  createdAt: 1,
  updatedAt: 1,
  source: "builtin" as const,
  readOnly: true,
  favorite: false,
}));

const serviceMock = vi.hoisted(() => ({
  listTemplates: vi.fn(async () => [template]),
  duplicateTemplateForEdit: vi.fn(async () => ({ ...template, id: "w1", source: "personal" as const, readOnly: false })),
  setTemplateFavorite: vi.fn(async () => undefined),
  markTemplateUsed: vi.fn(async () => undefined),
  listActiveRuns: vi.fn(async () => []),
  saveGraph: vi.fn(async () => undefined),
}));

vi.mock("./services/workflowService", () => ({ workflowService: serviceMock }));

const preferenceMock = vi.hoisted(() => ({ openEditorAfterCreate: true }));
vi.mock("./preferences", () => ({
  getWorkflowPreferences: () => ({ openEditorAfterCreate: preferenceMock.openEditorAfterCreate }),
}));

const appMock = vi.hoisted(() => ({ pushToast: vi.fn() }));
vi.mock("../../../stores/appStore", () => ({
  useAppStore: (selector: (state: typeof appMock) => unknown) => selector(appMock),
}));

beforeEach(() => {
  localStorage.clear();
  useWorkflowUiStore.getState().reset();
  workflowMock.current = null;
  workflowMock.currentTemplate = null;
  preferenceMock.openEditorAfterCreate = true;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  useWorkflowUiStore.getState().reset();
});

describe("WorkflowPage", () => {
  it("defaults to the template library and navigates across all top-level views", async () => {
    render(<WorkflowPage />);
    expect(screen.getByRole("tab", { name: "模板库" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("创建通用项目目录")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "运行中心" }));
    expect(screen.getByRole("heading", { name: "运行中心" })).toBeTruthy();
    expect(workflowMock.loadActiveRuns).toHaveBeenCalled();
  });

  it("persists the top-level view and selected template for a remount", () => {
    useWorkflowUiStore.getState().openEditor("w1");
    expect(JSON.parse(localStorage.getItem(workflowUiStorageKey) ?? "{}")).toEqual({
      view: "editor",
      selectedTemplateId: "w1",
    });
    render(<WorkflowPage />);
    expect(screen.getByRole("tab", { name: "编辑器" }).getAttribute("aria-selected")).toBe("true");
  });

  it("edits a built-in template through a new personal copy", async () => {
    render(<WorkflowPage />);
    await screen.findByText("创建通用项目目录");
    fireEvent.click(screen.getByLabelText("更多操作 创建通用项目目录"));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    await waitFor(() => expect(serviceMock.duplicateTemplateForEdit).toHaveBeenCalledWith(template.id));
    expect(workflowMock.loadTemplate).toHaveBeenCalledWith("w1");
    expect(screen.getByRole("tab", { name: "编辑器" }).getAttribute("aria-selected")).toBe("true");
  });

  it("respects the preference to remain in the library after creating", async () => {
    preferenceMock.openEditorAfterCreate = false;
    render(<WorkflowPage />);
    fireEvent.click(screen.getByRole("button", { name: "新建自动化" }));
    fireEvent.change(screen.getByPlaceholderText("流程名称"), { target: { value: "连续创建测试" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => expect(workflowMock.create).toHaveBeenCalled());
    expect(workflowMock.loadTemplate).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "模板库" }).getAttribute("aria-selected")).toBe("true");
  });
});
