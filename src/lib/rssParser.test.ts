// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseFeed } from "./rssParser";

describe("parseFeed", () => {
  it("解析 RSS 2.0：标题/链接/guid/发布时间/摘要", () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Feed</title>
  <item>
    <title>RSS 新闻标题</title>
    <link>https://example.com/a</link>
    <guid>guid-1</guid>
    <pubDate>Thu, 01 Aug 2024 12:00:00 GMT</pubDate>
    <description><![CDATA[<p>这是<b>摘要</b>内容</p>]]></description>
  </item>
</channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("RSS 新闻标题");
    expect(items[0].url).toBe("https://example.com/a");
    expect(items[0].guid).toBe("guid-1");
    expect(items[0].publishedAt).toBe(Date.parse("2024-08-01T12:00:00Z"));
    expect(items[0].summary).toContain("摘要");
  });

  it("解析 Atom：title/link/updated/summary", () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Atom 标题</title>
    <link rel="alternate" href="https://example.com/atom-a" />
    <id>atom-id-1</id>
    <updated>2024-08-02T10:00:00Z</updated>
    <summary>Atom 摘要文本</summary>
  </entry>
</feed>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Atom 标题");
    expect(items[0].url).toBe("https://example.com/atom-a");
    expect(items[0].guid).toBe("atom-id-1");
    expect(items[0].summary).toBe("Atom 摘要文本");
  });

  it("提取图片：media:content > enclosure > 正文 <img>", () => {
    const withMedia = `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><item>
      <title>t</title><link>https://e.com/1</link>
      <media:content url="https://img.example.com/media.jpg" />
    </item></channel></rss>`;
    expect(parseFeed(withMedia)[0].imageUrl).toBe("https://img.example.com/media.jpg");

    const withEnclosure = `<rss version="2.0"><channel><item>
      <title>t</title><link>https://e.com/2</link>
      <enclosure url="https://img.example.com/enclosure.jpg" type="image/jpeg" />
    </item></channel></rss>`;
    expect(parseFeed(withEnclosure)[0].imageUrl).toBe("https://img.example.com/enclosure.jpg");

    const withHtmlImg = `<rss version="2.0"><channel><item>
      <title>t</title><link>https://e.com/3</link>
      <description><![CDATA[<p><img src="https://img.example.com/og.jpg" /></p>]]></description>
    </item></channel></rss>`;
    expect(parseFeed(withHtmlImg)[0].imageUrl).toBe("https://img.example.com/og.jpg");
  });

  it("无图片时 imageUrl 为 null", () => {
    const xml = `<rss version="2.0"><channel><item>
      <title>t</title><link>https://e.com/noimg</link><description>无图</description>
    </item></channel></rss>`;
    expect(parseFeed(xml)[0].imageUrl).toBeNull();
  });

  it("缺少标题或链接的条目被丢弃", () => {
    const xml = `<rss version="2.0"><channel>
      <item><title>只有标题</title></item>
      <item><link>https://e.com/onlylink</link></item>
    </channel></rss>`;
    expect(parseFeed(xml)).toHaveLength(0);
  });
});
