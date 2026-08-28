// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useWindowDrag } from "./useWindowDrag";

const state = vi.hoisted(() => ({
  onMove: vi.fn(),
  onUp: vi.fn(),
  abort: vi.fn(),
}));

function Harness() {
  const { start } = useWindowDrag();
  return (
    <button
      onClick={() => start({ onMove: state.onMove, onUp: state.onUp }, state.abort)}
    >
      start
    </button>
  );
}

afterEach(cleanup);

describe("useWindowDrag", () => {
  beforeEach(() => {
    state.onMove.mockClear();
    state.onUp.mockClear();
    state.abort.mockClear();
  });

  it("mouseup 结束拖拽并触发 onUp", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("start"));
    fireEvent.mouseMove(window);
    fireEvent.mouseUp(window);
    expect(state.onMove).toHaveBeenCalledTimes(1);
    expect(state.onUp).toHaveBeenCalledTimes(1);
    // 结束后监听器已移除，再次 mouseup 不再触发
    fireEvent.mouseUp(window);
    expect(state.onUp).toHaveBeenCalledTimes(1);
  });

  it("Escape 取消拖拽：调用 abortState，且不触发 onUp", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("start"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(state.abort).toHaveBeenCalledTimes(1);
    expect(state.onUp).not.toHaveBeenCalled();
    // 取消后监听器已移除
    fireEvent.mouseUp(window);
    fireEvent.mouseMove(window);
    expect(state.onUp).toHaveBeenCalledTimes(0);
    expect(state.onMove).toHaveBeenCalledTimes(0);
  });
});
