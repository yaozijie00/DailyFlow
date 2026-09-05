// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import {
  bumpDataVersion,
  getDataVersion,
  useDataVersion,
  type DataDomain,
} from "./dataVersion";

afterEach(cleanup);

describe("dataVersion 失效总线（A1-P0Fix-④）", () => {
  it("getDataVersion 初始为 0，bump 递增", () => {
    const before = getDataVersion("task");
    bumpDataVersion("task");
    expect(getDataVersion("task")).toBe(before + 1);
  });

  it("bump 通知订阅者（useDataVersion 触发重渲染）", () => {
    const { result } = renderHook(() => useDataVersion("task" as DataDomain));
    expect(result.current).toBe(getDataVersion("task"));
    act(() => {
      bumpDataVersion("task");
    });
    // hook 重渲染后拿到新版本号
    expect(result.current).toBe(getDataVersion("task"));
  });

  it("域隔离：bump('focus') 不影响 'task' 订阅", () => {
    const { result } = renderHook(() => useDataVersion("task"));
    const v = getDataVersion("task");
    act(() => {
      bumpDataVersion("focus");
    });
    expect(getDataVersion("task")).toBe(v);
    expect(result.current).toBe(v);
  });

  it("订阅可取消（unmount 退订后 bump 不抛错）", () => {
    const { result, unmount } = renderHook(() => useDataVersion("course"));
    const v = getDataVersion("course");
    unmount();
    act(() => {
      bumpDataVersion("course");
    });
    expect(getDataVersion("course")).toBe(v + 1); // bump 仍生效（只是无人订阅）
    void result;
  });

  it("重复 bump 幂等无害（不抛错）", () => {
    expect(() => {
      bumpDataVersion("task");
      bumpDataVersion("task");
    }).not.toThrow();
  });
});
