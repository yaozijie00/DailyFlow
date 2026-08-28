// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import NewsCard from "./NewsCard";
import type { NewsItem } from "../../db/repositories/newsRepository";

vi.mock("../../lib/imageCache", () => ({
  cacheImage: vi.fn(),
}));

import { cacheImage } from "../../lib/imageCache";

afterEach(cleanup);

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 1,
    guid: "g",
    url: "https://example.com/a",
    title: "标题",
    source: "来源",
    imageUrl: null,
    summary: "摘要",
    category: "Tech",
    publishedAt: Date.now(),
    isRead: false,
    isFavorite: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("NewsCard", () => {
  it("无本地缓存时使用远程图片；加载失败显示占位", async () => {
    vi.mocked(cacheImage).mockResolvedValue(null);
    const item = makeItem({ imageUrl: "https://img.example.com/broken.jpg" });
    const { container } = render(
      <NewsCard item={item} onOpen={vi.fn()} onToggleFavorite={vi.fn()} />,
    );
    await waitFor(() => expect(container.querySelector("img")).toBeTruthy());
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("标题")).toBeTruthy();
  });

  it("命中本地缓存时使用缓存地址", async () => {
    vi.mocked(cacheImage).mockResolvedValue("asset://localhost/cached.jpg");
    const item = makeItem({ imageUrl: "https://img.example.com/real.jpg" });
    const { container } = render(
      <NewsCard item={item} onOpen={vi.fn()} onToggleFavorite={vi.fn()} />,
    );
    await waitFor(() => expect(container.querySelector("img")).toBeTruthy());
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "asset://localhost/cached.jpg",
    );
  });

  it("点击卡片触发 onOpen", () => {
    const onOpen = vi.fn();
    const item = makeItem();
    render(<NewsCard item={item} onOpen={onOpen} onToggleFavorite={vi.fn()} />);
    fireEvent.click(screen.getByText("标题"));
    expect(onOpen).toHaveBeenCalledWith(item);
  });

  it("点击收藏不触发 onOpen", () => {
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    const item = makeItem();
    render(<NewsCard item={item} onOpen={onOpen} onToggleFavorite={onToggle} />);
    fireEvent.click(screen.getByLabelText("收藏"));
    expect(onToggle).toHaveBeenCalledWith(item.id);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
