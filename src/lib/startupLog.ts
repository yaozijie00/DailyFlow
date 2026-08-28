/**
 * 启动日志前端封装：把前端启动过程/错误写入
 * %LOCALAPPDATA%\DailyFlow\startup.log（与 Rust 层共享，见 lib.rs）。
 */
import { invoke } from "@tauri-apps/api/core";

/** 追加一行日志（尽力而为，失败不抛错）。 */
export function log(text: string): void {
  const line = `[JS] ${new Date().toLocaleTimeString()} ${text}`;
  // eslint-disable-next-line no-console
  console.log(line);
  try {
    void invoke("append_log", { text: line });
  } catch {
    /* 非 Tauri 环境（浏览器预览）忽略 */
  }
}

/** 把致命错误渲染成覆盖层，避免白屏无从排查。 */
export function showFatal(text: string): void {
  log("FATAL: " + text);
  const div = document.createElement("div");
  div.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:#fff;color:#c00;padding:24px;font:13px/1.6 monospace;white-space:pre-wrap;overflow:auto;";
  div.textContent =
    "DailyFlow 启动失败（JS 层）：\n\n" +
    text +
    "\n\n请截图此信息，或把 %LOCALAPPDATA%\\DailyFlow\\startup.log 发给开发者。";
  document.body.appendChild(div);
}
