import { invoke } from "@tauri-apps/api/core";

/** 用系统默认浏览器打开外部链接（不做内置浏览器）。 */
export function openExternalUrl(url: string): Promise<void> {
  return invoke("open_url", { url });
}
