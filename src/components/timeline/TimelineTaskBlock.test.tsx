// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TimelineTaskBlock from "./TimelineTaskBlock";

afterEach(cleanup);

const baseView = {
  id: 1,
  title: "完成时间轴重构",
  notes: "拆分显示层",
  categoryName: "开发",
  state: "normal" as const,
  top: 100,
  height: 60,
  startMs: new Date(2026, 8, 8, 9, 0).getTime(),
  endMs: new Date(2026, 8, 8, 10, 0).getTime(),
  color: "#4f46e5",
  selected: false,
  isPreviewing: false,
  isRemoving: false,
};

describe("TimelineTaskBlock", () => {
  it("可通过键盘打开详情，并暴露状态和时间", () => {
    const onOpen = vi.fn();
    render(
      <TimelineTaskBlock
        view={baseView}
        onMoveStart={vi.fn()}
        onOpen={onOpen}
        onFocus={vi.fn()}
        onResizeStart={vi.fn()}
        onResizeEnd={vi.fn()}
        onMoveToInbox={vi.fn()}
      />,
    );

    const block = screen.getByRole("button", {
      name: /完成时间轴重构.*待办.*09:00 - 10:00/,
    });
    fireEvent.keyDown(block, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("直接移回收集箱不会同时打开详情", () => {
    const onOpen = vi.fn();
    const onMoveToInbox = vi.fn();
    render(
      <TimelineTaskBlock
        view={baseView}
        onMoveStart={vi.fn()}
        onOpen={onOpen}
        onFocus={vi.fn()}
        onResizeStart={vi.fn()}
        onResizeEnd={vi.fn()}
        onMoveToInbox={onMoveToInbox}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "移回收集箱" }));
    expect(onMoveToInbox).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
