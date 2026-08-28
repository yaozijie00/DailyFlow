/**
 * 新闻分类与默认源（首次初始化时 seed 到 news_sources 表，之后由用户配置）。
 * 无服务器、无 API Key、无付费服务。
 * 除 Art & Design 外，其余默认源均按「中国网络环境可访问」选取，保证刷新速度快；
 * 个别源（澎湃/联合早报/科学松鼠会等）URL 可能随站点改版变化，可在 Settings → 新闻 中验证/替换。
 */

export const NEWS_CATEGORIES = [
  "Art & Design",
  "Game",
  "AI & Technology",
  "World",
  "Headlines",
  "Science",
  "Society",
  "Trends",
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export interface DefaultNewsSource {
  name: string;
  url: string;
  category: NewsCategory;
}

export const DEFAULT_NEWS_SOURCES: DefaultNewsSource[] = [
  // Art & Design（需外网）
  { name: "Design Milk", url: "https://design-milk.com/feed/", category: "Art & Design" },
  { name: "Dezeen", url: "https://www.dezeen.com/feed/", category: "Art & Design" },
  { name: "Colossal", url: "https://www.thisiscolossal.com/feed/", category: "Art & Design" },

  // Game（Epic，中国可访问）
  { name: "Unreal Engine（Epic）", url: "https://www.unrealengine.com/en-US/blog/rss", category: "Game" },

  // AI & Technology（国内科技）
  { name: "少数派", url: "https://sspai.com/feed/", category: "AI & Technology" },
  { name: "爱范儿", url: "https://www.ifanr.com/feed", category: "AI & Technology" },

  // World（国际要闻，中国可访问）
  { name: "联合早报", url: "https://www.zaobao.com.sg/rss", category: "World" },

  // Science（科普）
  { name: "果壳网", url: "https://www.guokr.com/rss/", category: "Science" },
  { name: "科学松鼠会", url: "https://songshuhui.net/feed", category: "Science" },

  // Society（社会事件）
  { name: "澎湃新闻", url: "https://www.thepaper.cn/rss", category: "Society" },

  // Trends（潮流趋势）
  { name: "虎嗅", url: "https://www.huxiu.com/rss/0.xml", category: "Trends" },

  // Headlines（中文综合热点）
  { name: "36氪", url: "https://36kr.com/feed", category: "Headlines" },
];
