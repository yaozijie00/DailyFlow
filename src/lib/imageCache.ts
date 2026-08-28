import { invoke, convertFileSrc } from "@tauri-apps/api/core";

/** 由图片 URL 派生确定性的缓存文件名（含扩展名）。 */
export function cacheImageFileName(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h * 31 + url.charCodeAt(i)) | 0;
  }
  return `img_${Math.abs(h).toString(36)}${guessExt(url)}`;
}

function guessExt(url: string): string {
  const m = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.exec(url);
  if (!m) return ".img";
  const e = m[1].toLowerCase();
  return e === "jpeg" ? ".jpg" : `.${e}`;
}

/**
 * 缓存图片到本地（cacheDir/news-images），返回可加载的 asset URL。
 * 已缓存则直接命中（断网可用）；下载失败返回 null。
 */
export async function cacheImage(url: string): Promise<string | null> {
  try {
    const path = await invoke<string>("cache_image", {
      url,
      filename: cacheImageFileName(url),
    });
    return convertFileSrc(path);
  } catch {
    return null;
  }
}
