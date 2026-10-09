"""Inspect actual Tauri layouts across widths, appearance styles and light/dark modes."""
from pathlib import Path
import json,sys
from playwright.sync_api import sync_playwright,expect
sys.stdout.reconfigure(encoding="utf-8")
out=Path("artifacts/experience-implementation/layout");out.mkdir(parents=True,exist_ok=True)
cases=[];errors=[]
with sync_playwright() as p:
    b=p.chromium.connect_over_cdp("http://127.0.0.1:9225")
    page=next(pg for c in b.contexts for pg in c.pages if pg.url.startswith("http://localhost:1420"))
    assert "experience-implementation" in page.evaluate("window.__TAURI_INTERNALS__.invoke('data_dir')")
    page.set_default_timeout(10000);page.emulate_media(reduced_motion="reduce")
    page.on("pageerror",lambda e:errors.append(str(e)))
    nav=page.get_by_role("navigation",name="主导航")
    def go(name):nav.get_by_role("button",name=name,exact=True).click()
    def appearance():
        go("设置");page.get_by_role("navigation",name="设置分类").get_by_role("button",name="外观",exact=True).click()
    try:
        for mode,index in [("light",1),("dark",2)]:
            for style_index,style in enumerate(["classic","paper","forest","graphite"]):
                appearance();page.locator('input[name="theme-mode"]').nth(index).click()
                page.locator('input[name="appearance-style"]').nth(style_index).click()
                expect(page.locator("html")).to_have_attribute("data-appearance",style)
                for width,height in [(1440,900),(1100,720),(900,600),(820,560)]:
                    page.set_viewport_size({"width":width,"height":height})
                    for label,key in [("今日","today"),("专注","focus"),("长期","planning"),("长期","gantt"),("统计","statistics"),("设置","settings")]:
                        go(label)
                        if key=="gantt":page.get_by_role("tab",name="甘特图",exact=True).click()
                        if key=="planning":page.get_by_role("tab",name="工作台",exact=True).click()
                        page.wait_for_timeout(80)
                        measurements=page.evaluate("""() => ({width:innerWidth,height:innerHeight,bodyOverflow:document.documentElement.scrollWidth-innerWidth,heading:!!document.querySelector('h1'),colors:{surface:getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim(),accent:getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()},overflow:[...document.querySelectorAll('.focus-workspace,.pw-workspace,.gantt,.inbox-organizer,.td-workspace')].filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.className)})""")
                        row={"mode":mode,"style":style,"page":key,"viewport":[width,height],**measurements}
                        cases.append(row)
                        assert measurements["heading"] and measurements["bodyOverflow"]<=2 and not measurements["overflow"],row
                        if width==1440:page.screenshot(path=str(out/f"{mode}-{style}-{key}.png"))
        # Expanded organizers and shared task editors at the supported minimum size.
        page.set_viewport_size({"width":820,"height":560});go("今日")
        if not page.get_by_role("button",name="展开整理",exact=True).count(): page.locator('button[aria-controls="today-inbox"]').click()
        page.get_by_role("button",name="展开整理",exact=True).click()
        page.screenshot(path=str(out/"inbox-minimum.png"))
        dialog=page.get_by_role("dialog").last
        assert dialog.evaluate("el=>el.scrollWidth<=el.clientWidth+2")
        dialog.get_by_role("button",name="关闭",exact=True).click()
        page.get_by_role("button",name="打开任务",exact=False).first.click()
        page.get_by_role("button",name="展开详情",exact=True).click()
        page.screenshot(path=str(out/"detail-minimum.png"))
        assert page.get_by_role("dialog").last.evaluate("el=>el.scrollWidth<=el.clientWidth+2")
        page.get_by_role("dialog").last.get_by_role("button",name="关闭",exact=True).click()
        assert not errors,errors
    except Exception:
        page.screenshot(path=str(out/"failure.png"));raise
    finally:
        (out/"report.json").write_text(json.dumps({"cases":cases,"errors":errors},ensure_ascii=False,indent=2),encoding="utf-8")
        b.close()
print(f"Passed {len(cases)} layout cases and minimum-size dialogs")
