/**
 * 极简 RSS/Atom/RDF 解析器（纯前端，无第三方依赖）。
 * 仅依赖 DOMParser（浏览器 / jsdom 均可用）。
 *
 * 覆盖：
 *  - RSS 2.0（<rss><channel><item>）
 *  - Atom（<feed><entry>）
 *  - RSS 1.0 / RDF（<rdf:RDF><item>）
 *
 * 图片优先级：media:content > media:thumbnail > enclosure(image) > 正文首张 <img>。
 * 摘要：优先 summary/description，去 HTML 标签后截断。
 */

export interface ParsedFeedItem {
  title: string;
  url: string;
  guid: string | null;
  publishedAt: number | null;
  summary: string | null;
  imageUrl: string | null;
}

const SUMMARY_MAX = 220;

function textOf(parent: Element, tag: string): string | null {
  const el = parent.querySelector(tag);
  return el?.textContent?.trim() || null;
}

function textOfLocal(parent: Element, tag: string): string | null {
  // 只取直接子级（避免 Atom 里 entry 嵌套 feed 标题等干扰）
  const direct = parent.children;
  for (const el of direct) {
    if (el.localName === tag || el.tagName === tag) {
      const t = el.textContent?.trim();
      if (t) return t;
    }
  }
  return null;
}

function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX)}…` : text;
}

/** 从正文 HTML 中提取首张 <img>（作为无 media/enclosure 时的兜底）。 */
function firstImageFromHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return m ? m[1] : null;
}

/** 取命名空间下的第一个元素属性值（media:content / media:thumbnail 等）。 */
function mediaUrl(parent: Element, tags: string[], attr: string): string | null {
  for (const tag of tags) {
    const els = parent.getElementsByTagName(tag);
    for (const el of els) {
      const v = el.getAttribute(attr)?.trim();
      if (v) return v;
    }
  }
  // 回退：按 localName / tagName 后缀匹配（兼容不同 DOM 实现的命名空间差异）
  const all = parent.getElementsByTagName("*");
  for (const el of all) {
    const name = el.tagName.toLowerCase();
    if (name === "content" || name.endsWith(":content") || name === "thumbnail" || name.endsWith(":thumbnail")) {
      const v = el.getAttribute(attr)?.trim();
      if (v) return v;
    }
  }
  return null;
}

function extractImage(parent: Element, summaryHtml: string | null): string | null {
  return (
    mediaUrl(parent, ["media:content", "media:thumbnail"], "url") ??
    mediaUrl(parent, ["enclosure"], "url") ??
    firstImageFromHtml(summaryHtml)
  );
}

function parseRssItem(item: Element): ParsedFeedItem | null {
  const title = textOf(item, "title");
  const url = textOf(item, "link");
  if (!title || !url) return null;
  const description = textOf(item, "description") ?? textOf(item, "content\\:encoded");
  return {
    title,
    url: url.trim(),
    guid: textOf(item, "guid"),
    publishedAt: parseDate(textOf(item, "pubDate")),
    summary: stripHtml(description),
    imageUrl: extractImage(item, description),
  };
}

function parseAtomEntry(entry: Element): ParsedFeedItem | null {
  const title = textOfLocal(entry, "title");
  if (!title) return null;
  // link rel=alternate 优先，其次任意 link
  const linkEl =
    entry.querySelector('link[rel="alternate"]') ?? entry.querySelector("link");
  const url = linkEl?.getAttribute("href")?.trim();
  if (!url) return null;
  const summaryHtml =
    textOfLocal(entry, "summary") ??
    textOfLocal(entry, "content") ??
    textOfLocal(entry, "description");
  return {
    title,
    url,
    guid: textOfLocal(entry, "id"),
    publishedAt:
      parseDate(textOfLocal(entry, "published")) ??
      parseDate(textOfLocal(entry, "updated")),
    summary: stripHtml(summaryHtml),
    imageUrl: extractImage(entry, summaryHtml),
  };
}

/** 解析 RSS/Atom/RDF XML 文本，返回去空后的条目数组。 */
export function parseFeed(xml: string): ParsedFeedItem[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const items: ParsedFeedItem[] = [];

  // Atom
  const entries = Array.from(doc.querySelectorAll("entry"));
  for (const e of entries) {
    const item = parseAtomEntry(e);
    if (item) items.push(item);
  }
  if (items.length > 0) return items;

  // RSS 2.0
  const rssItems = Array.from(doc.querySelectorAll("rss item, channel > item"));
  for (const it of rssItems) {
    const item = parseRssItem(it);
    if (item) items.push(item);
  }
  if (items.length > 0) return items;

  // RSS 1.0 / RDF
  const rdfItems = Array.from(doc.getElementsByTagName("item"));
  for (const it of rdfItems) {
    const item = parseRssItem(it);
    if (item) items.push(item);
  }
  return items;
}
