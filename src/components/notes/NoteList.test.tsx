// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import NoteList from "./NoteList";
import type { Note } from "../../db/repositories/noteRepository";

afterEach(cleanup);

const mockState = vi.hoisted(() => ({
  notes: [] as Note[],
  completedNotes: [] as Note[],
  loading: false,
  load: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  complete: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../../stores/noteStore", () => ({
  useNoteStore: (selector: (s: unknown) => unknown) => selector(mockState),
}));
vi.mock("../../stores/appStore", () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ dbStatus: "ready", pushToast: vi.fn() }),
}));

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 1,
    title: "设计背包 UI",
    categoryId: null,
    status: "active",
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    completedAt: null,
    ...overrides,
  };
}

describe("NoteList（便签区）", () => {
  beforeEach(() => {
    mockState.notes = [];
    mockState.create.mockClear();
    mockState.update.mockClear();
    mockState.complete.mockClear();
    mockState.remove.mockClear();
    mockState.load.mockClear();
  });

  it("空状态提示", () => {
    render(<NoteList />);
    expect(screen.getByText(/还没有便签/)).toBeTruthy();
    expect(screen.getByText(/暂时没安排时间/)).toBeTruthy();
  });

  it("渲染便签列表", () => {
    mockState.notes = [makeNote({ title: "设计背包 UI" }), makeNote({ id: 2, title: "整理素材" })];
    render(<NoteList />);
    expect(screen.getByText("设计背包 UI")).toBeTruthy();
    expect(screen.getByText("整理素材")).toBeTruthy();
  });

  it("快速添加：输入回车创建", async () => {
    render(<NoteList />);
    fireEvent.change(screen.getByPlaceholderText("记下想法，回车保存"), {
      target: { value: "学习 Substance Designer" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("记下想法，回车保存"), { key: "Enter" });
    await vi.waitFor(() =>
      expect(mockState.create).toHaveBeenCalledWith({ title: "学习 Substance Designer" }),
    );
  });

  it("hover 操作：完成便签", async () => {
    mockState.notes = [makeNote()];
    render(<NoteList />);
    fireEvent.click(screen.getByLabelText("完成便签"));
    expect(mockState.complete).toHaveBeenCalledWith(1);
  });

  it("hover 操作：删除便签", async () => {
    mockState.notes = [makeNote()];
    render(<NoteList />);
    fireEvent.click(screen.getByLabelText("删除便签"));
    expect(mockState.remove).toHaveBeenCalledWith(1);
  });

  it("双击进入编辑，Enter 保存", async () => {
    mockState.notes = [makeNote()];
    render(<NoteList />);
    fireEvent.doubleClick(screen.getByText("设计背包 UI"));
    const input = screen.getByDisplayValue("设计背包 UI") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "设计新背包" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockState.update).toHaveBeenCalledWith(1, { title: "设计新背包" });
  });

  it("已安排（arranged）便签默认折叠，展开后显示且无完成按钮", () => {
    mockState.notes = [makeNote({ status: "arranged", title: "已安排事项" })];
    render(<NoteList />);
    // 默认折叠：只显示「已安排（1）」入口
    expect(screen.getByText(/已安排（1）/)).toBeTruthy();
    expect(screen.queryByText("已安排事项")).toBeNull();
    // 展开后可见：划线灰显、无完成按钮（可还原/删除）
    fireEvent.click(screen.getByText(/已安排（1）/));
    expect(screen.getByText("已安排事项")).toBeTruthy();
    expect(screen.queryByLabelText("完成便签")).toBeNull();
    expect(screen.getByLabelText("还原便签")).toBeTruthy();
    expect(screen.getByText("全部清理")).toBeTruthy();
  });
});
