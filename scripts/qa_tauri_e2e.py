"""Drive the real DailyFlow Tauri WebView through its development-only CDP port."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
import time
import uuid
from pathlib import Path

from playwright.sync_api import Page, Playwright, sync_playwright


def find_dailyflow_page(playwright: Playwright, cdp_url: str) -> tuple[object, Page]:
    try:
        browser = playwright.chromium.connect_over_cdp(cdp_url)
    except Exception as error:
        raise RuntimeError(
            "无法连接 DailyFlow WebView。请先在另一个终端运行 `npm run tauri:e2e`，"
            f"并确认 {cdp_url}/json/list 可访问。原始错误：{error}"
        ) from error

    for context in browser.contexts:
        for page in context.pages:
            if page.url.startswith("http://localhost:1420") and page.title() == "DailyFlow":
                return browser, page
    browser.close()
    raise RuntimeError("CDP 已连接，但没有找到标题为 DailyFlow 的 localhost:1420 页面。")


def navigate(page: Page, label: str) -> None:
    page.locator('nav[aria-label="主导航"]').get_by_role(
        "button", name=label, exact=True
    ).click()


def remove_test_task(page: Page, title: str) -> bool:
    """Delete only the task created by this run; safe to call repeatedly."""
    try:
        navigate(page, "今日")
        task = page.get_by_role("button", name=f"打开任务 {title}", exact=True)
        if task.count() == 0:
            return False
        task.first.click()
        page.get_by_role("heading", name=title, exact=True).wait_for(state="visible")
        page.get_by_role("button", name="删除", exact=True).click()
        task.wait_for(state="detached")
        return True
    except Exception:
        return False


def restore_workflow_preference(page: Page, expected: str) -> bool:
    """Restore the Workflow preference touched by this run."""
    try:
        navigate(page, "设置")
        settings_nav = page.locator('nav[aria-label="设置分类"]')
        settings_nav.get_by_role("button", name="Workflow · 偏好", exact=True).click()
        toggle = page.get_by_role("switch", name="创建后自动打开编辑器", exact=True)
        if toggle.get_attribute("aria-checked") != expected:
            toggle.click()
            page.locator(
                f'button[role="switch"][aria-label="创建后自动打开编辑器"]'
                f'[aria-checked="{expected}"]'
            ).wait_for(state="visible")
        return True
    except Exception:
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="DailyFlow 真实 Tauri 关键流程回归")
    parser.add_argument("--cdp", default="http://127.0.0.1:9222")
    parser.add_argument("--output", type=Path, default=Path("artifacts/qa/tauri-e2e"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    title = f"DailyFlow E2E {time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    workflow_project = f"Workflow-E2E-{uuid.uuid4().hex[:6]}"
    workflow_root = Path(tempfile.mkdtemp(prefix="dailyflow-workflow-e2e-"))
    workflow_target = workflow_root / workflow_project
    report: dict[str, object] = {
        "status": "running",
        "taskTitle": title,
        "steps": [],
        "consoleErrors": [],
        "pageErrors": [],
        "taskCreated": False,
        "taskCleaned": False,
        "workflowPreferenceRestored": False,
        "workflowTarget": str(workflow_target),
        "workflowCreated": False,
        "workflowCleaned": False,
    }
    browser = None
    page: Page | None = None
    exit_code = 0

    def passed(step: str) -> None:
        steps = report["steps"]
        assert isinstance(steps, list)
        steps.append({"name": step, "status": "passed"})
        print(f"PASS  {step}")

    try:
        with sync_playwright() as playwright:
            browser, page = find_dailyflow_page(playwright, args.cdp)
            console_errors = report["consoleErrors"]
            page_errors = report["pageErrors"]
            assert isinstance(console_errors, list)
            assert isinstance(page_errors, list)
            page.on(
                "console",
                lambda message: console_errors.append(message.text)
                if message.type == "error"
                else None,
            )
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.set_default_timeout(10_000)

            page.get_by_text("已保存到本机", exact=True).wait_for(state="visible")
            passed("真实数据库与桌面壳已就绪")

            navigate(page, "设置")
            settings_nav = page.locator('nav[aria-label="设置分类"]')
            settings_nav.get_by_role("button", name="关于", exact=True).click()
            main_area = page.locator("main")
            main_area.get_by_text("启动诊断", exact=True).wait_for(state="visible")
            for label in ("本机数据库", "用户设置", "扩展系统", "长期目标", "专注恢复"):
                main_area.get_by_text(label, exact=True).wait_for(state="visible")
            passed("关于页展示完整启动诊断")

            settings_nav.get_by_role("button", name="扩展", exact=True).click()
            for extension_id in (
                "com.dailyflow.course-schedule",
                "com.dailyflow.workflow",
            ):
                main_area.get_by_text(extension_id, exact=True).wait_for(state="visible")
            for label in ("独立页面", "读取任务", "修改任务"):
                main_area.get_by_text(label, exact=True).first.wait_for(state="visible")
            main_area.get_by_text("扩展存储", exact=True).first.wait_for(state="visible")
            main_area.get_by_text("主库存储", exact=True).wait_for(state="visible")
            passed("扩展管理展示扩展状态与能力")

            settings_nav.get_by_role(
                "button", name="Workflow · 偏好", exact=True
            ).click()
            preference = page.get_by_role(
                "switch", name="创建后自动打开编辑器", exact=True
            )
            original_preference = preference.get_attribute("aria-checked")
            if original_preference not in ("true", "false"):
                raise AssertionError("Workflow 偏好开关缺少 aria-checked 状态")
            changed_preference = "false" if original_preference == "true" else "true"
            preference.click()
            page.locator(
                f'button[role="switch"][aria-label="创建后自动打开编辑器"]'
                f'[aria-checked="{changed_preference}"]'
            ).wait_for(state="visible")
            report["workflowPreferenceRestored"] = restore_workflow_preference(
                page, original_preference
            )
            if report["workflowPreferenceRestored"] is not True:
                raise AssertionError("Workflow 偏好未能恢复原值")
            passed("Workflow 扩展偏好可持久化并恢复原值")

            navigate(page, "Workflow")
            card = page.get_by_role("article").filter(has_text="创建通用项目目录").first
            card.get_by_role("button", name="运行", exact=True).click()
            run_dialog = page.get_by_role("dialog", name="创建通用项目目录")
            run_dialog.get_by_label("保存位置").fill(str(workflow_root))
            run_dialog.get_by_label("项目名称").fill(workflow_project)
            run_dialog.get_by_role("button", name="预览操作", exact=True).click()
            run_dialog.get_by_text(workflow_project, exact=False).first.wait_for(state="visible")
            passed("Workflow 运行前展示目标路径与影响预览")

            run_dialog.get_by_role("button", name="确认并运行", exact=True).click()
            run_dialog.get_by_text("Workflow 已完成", exact=True).wait_for(state="visible")
            if not workflow_target.is_dir():
                raise AssertionError(f"Workflow 未创建目标目录：{workflow_target}")
            expected_directories = ("01_资料", "02_规划", "03_制作", "04_交付", "99_归档")
            missing = [name for name in expected_directories if not (workflow_target / name).is_dir()]
            if missing:
                raise AssertionError(f"Workflow 缺少目录：{missing}")
            report["workflowCreated"] = True
            passed("Workflow 在临时根目录创建完整项目结构")

            run_dialog.get_by_role("button", name="关闭运行面板", exact=True).click()
            page.get_by_role("tab", name="运行中心", exact=True).click()
            page.get_by_role("heading", name="运行中心", exact=True).wait_for(state="visible")
            page.get_by_text("创建通用项目目录", exact=True).first.wait_for(state="visible")
            passed("运行中心显示刚完成的快照与步骤记录")

            navigate(page, "今日")
            page.get_by_role("button", name="新建", exact=True).click()
            dialog = page.get_by_role("dialog")
            dialog.get_by_placeholder("输入任务名称").fill(title)
            report["taskCreated"] = True
            dialog.get_by_role("button", name="创建", exact=True).click()
            dialog.wait_for(state="detached")
            task = page.get_by_role("button", name=f"打开任务 {title}", exact=True)
            task.wait_for(state="visible")
            passed("创建唯一测试任务")

            task.click()
            page.get_by_role("heading", name=title, exact=True).wait_for(state="visible")
            passed("从任务列表打开正确详情")

            page.get_by_role("button", name="删除", exact=True).click()
            task.wait_for(state="detached")
            report["taskCleaned"] = True
            passed("删除并清理测试任务")

            if console_errors or page_errors:
                raise AssertionError(
                    f"发现运行时错误：console={console_errors}, page={page_errors}"
                )
            passed("流程中无 console error 或页面异常")
            report["status"] = "passed"
            browser.close()
            browser = None
    except Exception as error:
        exit_code = 1
        report["status"] = "failed"
        report["error"] = str(error)
        print(f"FAIL  {error}", file=sys.stderr)
        if page is not None:
            try:
                page.screenshot(path=str(args.output / "failure.png"), full_page=True)
            except Exception:
                pass
    finally:
        if (
            page is not None
            and report["taskCreated"] is True
            and report["taskCleaned"] is not True
        ):
            report["taskCleaned"] = remove_test_task(page, title)
        if page is not None and report.get("workflowPreferenceRestored") is not True:
            original = locals().get("original_preference")
            if original in ("true", "false"):
                report["workflowPreferenceRestored"] = restore_workflow_preference(
                    page, original
                )
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass
        try:
            shutil.rmtree(workflow_root)
            report["workflowCleaned"] = not workflow_root.exists()
        except Exception as cleanup_error:
            report["workflowCleanupError"] = str(cleanup_error)
        report_path = args.output / "report.json"
        report_path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(report_path.resolve())

    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
