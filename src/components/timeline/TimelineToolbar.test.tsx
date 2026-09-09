// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TimelineToolbar from "./TimelineToolbar";

afterEach(cleanup);

describe("TimelineToolbar", () => {
  it("展示工作范围与缩放比例，并提供清晰的缩放操作", () => {
    const onZoom = vi.fn();
    render(
      <TimelineToolbar
        startMinutes={8 * 60}
        endMinutes={22 * 60}
        pxPerMinute={1.25}
        onZoom={onZoom}
      />,
    );

    expect(screen.getByText("08:00–22:00")).toBeTruthy();
    expect(screen.getByText("125%")).toBeTruthy();
    expect(screen.getByText(/拖动空白创建/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("缩小时间轴"));
    fireEvent.click(screen.getByLabelText("放大时间轴"));
    expect(onZoom).toHaveBeenNthCalledWith(1, -1);
    expect(onZoom).toHaveBeenNthCalledWith(2, 1);
  });
});
