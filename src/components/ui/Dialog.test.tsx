// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Dialog } from "./Dialog";

afterEach(cleanup);

describe("Dialog", () => {
  it("关闭时不渲染", () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="标题">
        内容
      </Dialog>,
    );
    expect(screen.queryByText("标题")).toBeNull();
  });

  it("打开时渲染标题与内容", () => {
    render(
      <Dialog open onClose={vi.fn()} title="标题">
        内容
      </Dialog>,
    );
    expect(screen.getByText("标题")).toBeTruthy();
    expect(screen.getByText("内容")).toBeTruthy();
  });

  it("ESC 触发 onClose", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="标题">
        内容
      </Dialog>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("点击关闭按钮触发 onClose", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="标题">
        内容
      </Dialog>,
    );
    fireEvent.click(screen.getByLabelText("关闭"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("点击遮罩触发 onClose（closeOnBackdrop=true）", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog open onClose={onClose} title="标题">
        内容
      </Dialog>,
    );
    fireEvent.mouseDown(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("打开时焦点进入对话框内部", () => {
    render(
      <Dialog open onClose={vi.fn()} title="标题" footer={<button>确定</button>}>
        内容
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
