// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Card, CardHeader } from "./Card";

afterEach(cleanup);

describe("Card（Design System 契约：语义类随三主题）", () => {
  it("默认渲染为磨砂表面卡片（glass-surface = 主题表面 + blur）", () => {
    render(<Card>内容</Card>);
    const el = screen.getByText("内容");
    expect(el.className).toContain("glass-surface");
    expect(el.className).toContain("rounded-[var(--radius-card)]");
    expect(el.className).toContain("p-4"); // 默认 padding=md
  });

  it("glass=false 回退实体卡片（border + bg-surface）", () => {
    render(<Card glass={false}>实体</Card>);
    const el = screen.getByText("实体");
    expect(el.className).toContain("bg-surface");
    expect(el.className).toContain("border-border-subtle");
    expect(el.className).not.toContain("glass-surface");
  });

  it("padding=lg 使用 p-5；padding=none 无内边距", () => {
    const { rerender } = render(<Card padding="lg">大</Card>);
    expect(screen.getByText("大").className).toContain("p-5");
    rerender(<Card padding="none">无</Card>);
    expect(screen.getByText("无").className).not.toContain("p-");
  });

  it("interactive 附加 hover 反馈类", () => {
    render(<Card interactive>可点</Card>);
    expect(screen.getByText("可点").className).toContain("hover:bg-surface-hover");
  });

  it("CardHeader：标题 + 可选副标题与操作区", () => {
    render(
      <CardHeader title="本周投入" subtitle="近 7 天" actions={<button>详情</button>} />,
    );
    expect(screen.getByText("本周投入")).toBeTruthy();
    expect(screen.getByText("近 7 天")).toBeTruthy();
    expect(screen.getByText("详情")).toBeTruthy();
  });
});
