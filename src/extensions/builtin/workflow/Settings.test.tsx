// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import WorkflowSettings from "./Settings";

const preferenceMock = vi.hoisted(() => ({
  value: {
    openEditorAfterCreate: true,
    enableCommandNodes: false,
    rememberNonSensitiveVariables: true,
    defaultFileConflict: "fail" as "fail" | "skip" | "overwrite" | "rename",
  },
  save: vi.fn(async (next: typeof preferenceMock.value) => {
    preferenceMock.value = next;
  }),
}));

vi.mock("./preferences", () => ({
  getWorkflowPreferences: () => ({ ...preferenceMock.value }),
  saveWorkflowPreferences: preferenceMock.save,
}));

afterEach(() => {
  cleanup();
  preferenceMock.value = {
    openEditorAfterCreate: true,
    enableCommandNodes: false,
    rememberNonSensitiveVariables: true,
    defaultFileConflict: "fail",
  };
  preferenceMock.save.mockReset();
  preferenceMock.save.mockImplementation(async (next) => {
    preferenceMock.value = next;
  });
});

describe("WorkflowSettings", () => {
  it("保存成功后更新开关状态", async () => {
    render(<WorkflowSettings />);
    const toggle = screen.getByRole("switch", { name: "创建后自动打开编辑器" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() => expect(preferenceMock.save).toHaveBeenCalledWith(expect.objectContaining({
      openEditorAfterCreate: false,
      enableCommandNodes: false,
    })));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("启用命令节点并更新默认冲突策略", async () => {
    render(<WorkflowSettings />);
    fireEvent.click(screen.getByRole("switch", { name: "启用命令节点" }));
    await waitFor(() => expect(preferenceMock.save).toHaveBeenCalledWith(expect.objectContaining({ enableCommandNodes: true })));
    fireEvent.change(screen.getByRole("combobox", { name: "默认文件冲突策略" }), { target: { value: "rename" } });
    await waitFor(() => expect(preferenceMock.save).toHaveBeenLastCalledWith(expect.objectContaining({ defaultFileConflict: "rename" })));
  });

  it("保存失败时保持原状态并显示错误", async () => {
    preferenceMock.save.mockRejectedValueOnce(new Error("磁盘写入失败"));
    render(<WorkflowSettings />);
    const toggle = screen.getByRole("switch", { name: "创建后自动打开编辑器" });
    fireEvent.click(toggle);
    expect((await screen.findByRole("alert")).textContent).toContain("磁盘写入失败");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
});
