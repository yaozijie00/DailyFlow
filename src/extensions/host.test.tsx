// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExtensionErrorBoundary } from "./host";

afterEach(cleanup);

// componentDidCatch 里动态 import startupLog：测试环境允许（模块存在），静默即可
vi.mock("../lib/startupLog", () => ({
  log: vi.fn(),
}));

// React 会把错误边界的子组件异常打印到 console.error（预期行为）；
// 测试内静默它，避免「预期抛错」污染全量运行输出。
let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  errorSpy.mockRestore();
});

function Boom(): React.ReactElement {
  throw new Error("槽位组件渲染爆炸");
}

describe("ExtensionErrorBoundary（Rule 04：槽位/页面出错不崩 Core）", () => {
  it("子组件渲染抛错 → 只替换该区块（显示隔离文案），不向父级冒泡", () => {
    // 若边界失效，render 会抛出 Boom 的错误导致测试失败
    render(
      <div>
        <span>页面其余内容</span>
        <ExtensionErrorBoundary label="com.example.today-slot">
          <Boom />
        </ExtensionErrorBoundary>
      </div>,
    );
    // 页面其余内容仍在
    expect(screen.getByText("页面其余内容")).toBeTruthy();
    // 边界替换为隔离提示（含扩展 id，便于定位）
    expect(screen.getByText(/com\.example\.today-slot/)).toBeTruthy();
    expect(screen.getByText(/已隔离不影响 DailyFlow/)).toBeTruthy();
  });

  it("子组件正常渲染时原样透传，不显示隔离提示", () => {
    render(
      <ExtensionErrorBoundary label="com.example.ok-slot">
        <span>正常槽位内容</span>
      </ExtensionErrorBoundary>,
    );
    expect(screen.getByText("正常槽位内容")).toBeTruthy();
    expect(screen.queryByText(/已隔离不影响 DailyFlow/)).toBeNull();
  });

  it("不同边界互不影响：一个槽位崩坏，另一个槽位照常渲染", () => {
    render(
      <div>
        <ExtensionErrorBoundary label="bad-slot">
          <Boom />
        </ExtensionErrorBoundary>
        <ExtensionErrorBoundary label="good-slot">
          <span>健康槽位</span>
        </ExtensionErrorBoundary>
      </div>,
    );
    expect(screen.getByText("健康槽位")).toBeTruthy();
    expect(screen.getByText(/bad-slot/)).toBeTruthy();
  });
});
