"""Verify appearance and native focus controls across the isolated main/Mini windows."""
from pathlib import Path
import json,sys
from playwright.sync_api import sync_playwright,expect

sys.stdout.reconfigure(encoding="utf-8")
output=Path("artifacts/experience-implementation")
checks=[];errors=[]
with sync_playwright() as p:
    browser=p.chromium.connect_over_cdp("http://127.0.0.1:9225")
    page=next(pg for c in browser.contexts for pg in c.pages if pg.evaluate("window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label")=="main")
    data=page.evaluate("window.__TAURI_INTERNALS__.invoke('data_dir')")
    assert "experience-implementation" in data and "focus-native-qa" in data
    page.set_default_timeout(10000);page.set_viewport_size({"width":1280,"height":800})
    page.on("pageerror",lambda e:errors.append(str(e)))
    nav=page.get_by_role("navigation",name="主导航")
    try:
        nav.get_by_role("button",name="专注",exact=True).click()
        page.get_by_role("button",name="无任务计时",exact=True).click()
        page.get_by_label("计时模式",exact=True).select_option("stopwatch")
        page.get_by_role("button",name="开始无任务计时",exact=True).click()
        expect(page.get_by_role("button",name="暂停",exact=True)).to_be_visible()
        page.evaluate("window.__TAURI_INTERNALS__.invoke('open_mini_window')")
        mini=None
        for _ in range(100):
            mini=next((pg for c in browser.contexts for pg in c.pages if pg.evaluate("window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label")=="mini"),None)
            if mini:break
            page.wait_for_timeout(100)
        assert mini,"Mini WebView did not appear"
        mini.set_default_timeout(10000);mini.on("pageerror",lambda e:errors.append(str(e)))
        expect(mini.get_by_role("button",name="暂停",exact=True)).to_be_visible()
        nav.get_by_role("button",name="设置",exact=True).click()
        page.get_by_role("navigation",name="设置分类").get_by_role("button",name="外观",exact=True).click()
        for index,style in enumerate(["classic","paper","forest","graphite"]):
            page.locator('input[name="appearance-style"]').nth(index).click()
            expect(mini.locator("html")).to_have_attribute("data-appearance",style)
        for index,dark in [(2,True),(1,False)]:
            page.locator('input[name="theme-mode"]').nth(index).click()
            expect(mini.locator("html")).to_have_class("dark" if dark else "")
        checks.append("four appearance styles and light/dark synchronize to Mini")
        mini.get_by_role("button",name="暂停",exact=True).click()
        nav.get_by_role("button",name="专注",exact=True).click()
        expect(page.get_by_role("button",name="继续",exact=True)).to_be_visible()
        mini.screenshot(path=str(output/"mini-synchronized.png"))
        mini.get_by_role("button",name="继续",exact=True).click()
        expect(page.get_by_role("button",name="暂停",exact=True)).to_be_visible()
        page.get_by_role("button",name="结束本次",exact=True).click()
        page.get_by_role("button",name="保存投入",exact=True).click()
        expect(page.get_by_role("button",name="无任务计时",exact=True)).to_be_visible()
        expect(mini.get_by_role("button",name="暂停",exact=True)).to_have_count(0)
        checks.append("Mini pause/resume and main finish share one native session")
        assert not errors,errors
    finally:
        page.evaluate("window.__TAURI_INTERNALS__.invoke('close_mini_window')")
        (output/"mini-report.json").write_text(json.dumps({"checks":checks,"pageErrors":errors,"dataDir":data},ensure_ascii=False,indent=2),encoding="utf-8")
        browser.close()
print(json.dumps(checks,ensure_ascii=False))
