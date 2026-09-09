// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import WorkflowSettings from "./Settings";

const preferenceMock = vi.hoisted(() => ({
  value: true,
  save: vi.fn(async (next: { openEditorAfterCreate: boolean }) => {
    preferenceMock.value = next.openEditorAfterCreate;
  }),
}));

vi.mock("./preferences", () => ({
  getWorkflowPreferences: () => ({ openEditorAfterCreate: preferenceMock.value }),
  saveWorkflowPreferences: preferenceMock.save,
}));

afterEach(() => {
  cleanup();
  preferenceMock.value = true;
  preferenceMock.save.mockReset();
  preferenceMock.save.mockImplementation(async (next) => {
    preferenceMock.value = next.openEditorAfterCreate;
  });
});

describe("WorkflowSettings", () => {
  it("保存成功后更新开关状态", async () => {
    render(<WorkflowSettings />);
    const toggle = screen.getByRole("switch", { name: "创建后自动打开编辑器" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() => expect(preferenceMock.save).toHaveBeenCalledWith({
      openEditorAfterCreate: false,
    }));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
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
