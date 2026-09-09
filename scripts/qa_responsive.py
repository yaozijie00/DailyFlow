"""DailyFlow 桌面窗口响应式冒烟检查（需要本地 Vite 服务）。"""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


VIEWPORTS = (
    (800, 600),
    (960, 720),
    (1180, 800),
    (1440, 900),
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://[::1]:1420/")
    parser.add_argument("--screenshots", action="store_true")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(tempfile.gettempdir()) / "dailyflow-responsive-qa",
    )
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    report: list[dict[str, object]] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for width, height in VIEWPORTS:
            page = browser.new_page(viewport={"width": width, "height": height})
            console_errors: list[str] = []
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.goto(args.url, wait_until="domcontentloaded")
            try:
                page.wait_for_load_state("networkidle", timeout=5_000)
            except PlaywrightTimeoutError:
                # Vite HMR 会保持长连接；DOM 已加载时仍可执行结构与溢出检查。
                pass
            metrics = page.evaluate(
                """() => ({
                    viewportWidth: window.innerWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    bodyWidth: document.body.scrollWidth,
                    rootTextLength: document.querySelector('#root')?.textContent?.length ?? 0,
                    sidebarCollapsed: document.querySelector('.df-sidebar')?.dataset.collapsed === 'true',
                    hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
                })"""
            )
            screenshot = args.output / f"today-{width}x{height}.png"
            if args.screenshots:
                page.screenshot(path=str(screenshot), full_page=False)
            report.append(
                {
                    "viewport": f"{width}x{height}",
                    **metrics,
                    "consoleErrors": console_errors,
                    "screenshot": str(screenshot) if args.screenshots else None,
                }
            )
            page.close()
        browser.close()

    report_path = args.output / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(report_path)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
