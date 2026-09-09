// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkflowTemplate, WorkflowTemplateQuery } from "../../templates/templateService";
import { useWorkflowUiStore } from "../../store/workflowUiStore";
import { TemplateLibrary } from "./TemplateLibrary";

const templates: WorkflowTemplate[] = [
  {
    id: "builtin.general-project",
    schemaVersion: 2,
    name: "创建通用项目目录",
    description: "建立项目资料和归档目录",
    version: 1,
    variables: [],
    nodes: [
      { id: "s", type: "core.start", typeVersion: 1, title: "开始", position: { x: 0, y: 0 }, config: {} },
      { id: "a", type: "files.create-directory-tree", typeVersion: 1, title: "目录", position: { x: 1, y: 0 }, config: {} },
      { id: "f", type: "core.finish", typeVersion: 1, title: "完成", position: { x: 2, y: 0 }, config: {} },
    ],
    edges: [],
    tags: ["项目", "目录"],
    createdAt: 1,
    updatedAt: 1,
    source: "builtin",
    readOnly: true,
    favorite: false,
  },
  {
    id: "mine.daily",
    schemaVersion: 2,
    name: "我的每日启动",
    description: "打开固定工作页面",
    version: 2,
    variables: [],
    nodes: [
      { id: "s2", type: "core.start", typeVersion: 1, title: "开始", position: { x: 0, y: 0 }, config: {} },
      { id: "a2", type: "system.open-url", typeVersion: 1, title: "打开", position: { x: 1, y: 0 }, config: {} },
      { id: "f2", type: "core.finish", typeVersion: 1, title: "完成", position: { x: 2, y: 0 }, config: {} },
    ],
    edges: [],
    tags: ["每日"],
    createdAt: 2,
    updatedAt: 2,
    lastUsedAt: 20,
    source: "personal",
    readOnly: false,
    favorite: true,
  },
];

function fakeService() {
  let values = structuredClone(templates);
  return {
    listTemplates: vi.fn(async (query: WorkflowTemplateQuery = {}) => {
      let result = values.filter((item) => {
        if (query.source && query.source !== "all" && item.source !== query.source) return false;
        if (query.favorite && !item.favorite) return false;
        if (query.tag && !item.tags.includes(query.tag)) return false;
        const search = query.search?.toLowerCase();
        return !search || [item.name, item.description, ...item.tags].join(" ").toLowerCase().includes(search);
      });
      if (query.sort === "recent") result = result.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
      return structuredClone(result);
    }),
    duplicateTemplateForEdit: vi.fn(async (id: string) => ({
      ...structuredClone(values.find((item) => item.id === id)!),
      id: "mine.copy",
      name: "创建通用项目目录（我的副本）",
      source: "personal" as const,
      readOnly: false,
    })),
    setTemplateFavorite: vi.fn(async (id: string, favorite: boolean) => {
      values = values.map((item) => item.id === id ? { ...item, favorite } : item);
    }),
    markTemplateUsed: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  localStorage.clear();
  useWorkflowUiStore.getState().reset();
});

afterEach(() => {
  cleanup();
  useWorkflowUiStore.getState().reset();
});

describe("TemplateLibrary", () => {
  it("searches, filters categories and shows an empty result", async () => {
    const service = fakeService();
    render(<TemplateLibrary service={service} onRun={vi.fn()} onEdit={vi.fn()} />);
    await screen.findByText("创建通用项目目录");

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索模板" }), { target: { value: "每日" } });
    await waitFor(() => expect(screen.queryByText("创建通用项目目录")).toBeNull());
    expect(screen.getByText("我的每日启动")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索模板" }), { target: { value: "不存在" } });
    await screen.findByText("没有匹配的模板");
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    await screen.findByText("创建通用项目目录");

    fireEvent.click(screen.getByRole("button", { name: "收藏" }));
    await waitFor(() => expect(screen.queryByText("创建通用项目目录")).toBeNull());
    expect(screen.getByText("我的每日启动")).toBeTruthy();
  });

  it("marks a template used before opening the runner", async () => {
    const service = fakeService();
    const onRun = vi.fn();
    render(<TemplateLibrary service={service} onRun={onRun} onEdit={vi.fn()} />);
    await screen.findByText("创建通用项目目录");
    const runButtons = screen.getAllByRole("button", { name: "运行" });
    fireEvent.click(runButtons[0]);

    await waitFor(() => expect(service.markTemplateUsed).toHaveBeenCalledWith("builtin.general-project"));
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: "builtin.general-project" }));
  });

  it("copies a built-in template before opening it in the editor", async () => {
    const service = fakeService();
    const onEdit = vi.fn();
    render(<TemplateLibrary service={service} onRun={vi.fn()} onEdit={onEdit} />);
    await screen.findByText("创建通用项目目录");
    fireEvent.click(screen.getByLabelText("更多操作 创建通用项目目录"));
    fireEvent.click(screen.getAllByRole("button", { name: "编辑" })[0]);

    await waitFor(() => expect(service.duplicateTemplateForEdit).toHaveBeenCalledWith("builtin.general-project"));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "mine.copy", readOnly: false }));
  });

  it("toggles favorites and supports recent-use sorting", async () => {
    const service = fakeService();
    render(<TemplateLibrary service={service} onRun={vi.fn()} onEdit={vi.fn()} />);
    await screen.findByText("创建通用项目目录");
    fireEvent.click(screen.getByRole("button", { name: "收藏 创建通用项目目录" }));
    await waitFor(() => expect(service.setTemplateFavorite).toHaveBeenCalledWith("builtin.general-project", true));
    fireEvent.change(screen.getByRole("combobox", { name: "模板排序" }), { target: { value: "recent" } });
    await waitFor(() => expect(service.listTemplates).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "recent" })));
  });

  it("shows load errors, retries, and keeps search before card actions in keyboard order", async () => {
    const service = fakeService();
    service.listTemplates.mockRejectedValueOnce(new Error("database unavailable"));
    render(<TemplateLibrary service={service} onRun={vi.fn()} onEdit={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("database unavailable");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await screen.findByText("创建通用项目目录");

    const focusable = [...document.querySelectorAll<HTMLElement>("input, select, button, summary")];
    expect(focusable.indexOf(screen.getByRole("searchbox", { name: "搜索模板" }))).toBeLessThan(
      focusable.indexOf(screen.getAllByRole("button", { name: "运行" })[0]),
    );
  });
});
