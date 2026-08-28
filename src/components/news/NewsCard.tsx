import { useEffect, useState } from "react";
import { Star, ExternalLink } from "lucide-react";
import type { NewsItem } from "../../db/repositories/newsRepository";
import { formatRelativeTime } from "../../lib/news";
import { cacheImage } from "../../lib/imageCache";

interface NewsCardProps {
  item: NewsItem;
  onOpen: (item: NewsItem) => void;
  onToggleFavorite: (id: number) => void;
}

export default function NewsCard({ item, onOpen, onToggleFavorite }: NewsCardProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // 优先本地缓存（断网可用）；无缓存则回退远程 URL
  useEffect(() => {
    if (!item.imageUrl) return;
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    cacheImage(item.imageUrl)
      .then((local) => {
        if (!cancelled) setSrc(local ?? item.imageUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(item.imageUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [item.imageUrl]);

  function handleImgError() {
    // 本地缓存加载失败 → 回退远程；远程也失败 → 占位
    if (src !== item.imageUrl && item.imageUrl) {
      setSrc(item.imageUrl);
    } else {
      setFailed(true);
    }
  }

  return (
    <article
      onClick={() => onOpen(item)}
      className="group mb-4 break-inside-avoid cursor-pointer overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      {/* 图片 / 缓存中 / 无图占位 */}
      {item.imageUrl && !failed ? (
        src == null ? (
          <div className="h-36 w-full animate-pulse bg-neutral-100" />
        ) : (
          <img
            src={src}
            alt=""
            loading="lazy"
            onError={handleImgError}
            className="h-36 w-full object-cover"
          />
        )
      ) : (
        <div className="flex h-24 w-full items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200 text-neutral-400">
          <span className="text-xs font-medium">{item.category}</span>
        </div>
      )}

      <div className="p-3">
        <div className="mb-1 flex items-center gap-2 text-[11px] text-neutral-500">
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-700">
            {item.category}
          </span>
          <span className="truncate">{item.source}</span>
          <span className="ml-auto shrink-0">{formatRelativeTime(item.publishedAt ?? item.createdAt)}</span>
        </div>

        <h3
          className={`mb-1 text-sm font-semibold leading-snug text-neutral-900 ${
            item.isRead ? "opacity-60" : ""
          }`}
        >
          {item.title}
        </h3>

        {item.summary && (
          <p className="mb-2 line-clamp-3 text-xs leading-relaxed text-neutral-600">
            {item.summary}
          </p>
        )}

        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <ExternalLink size={13} className="shrink-0" />
          <span className="truncate">{item.url}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(item.id);
            }}
            aria-label={item.isFavorite ? "取消收藏" : "收藏"}
            className={`ml-auto shrink-0 rounded p-1 hover:bg-neutral-100 ${
              item.isFavorite ? "text-amber-500" : "text-neutral-300 hover:text-neutral-500"
            }`}
          >
            <Star size={14} fill={item.isFavorite ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
    </article>
  );
}
