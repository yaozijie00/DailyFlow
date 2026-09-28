"""Read-only page/layout smoke plus reversible theme checks in an isolated Tauri QA profile."""
from playwright.sync_api import sync_playwright,expect
from pathlib import Path
import argparse,json,sys
sys.stdout.reconfigure(encoding='utf-8')
parser=argparse.ArgumentParser(); parser.add_argument('--cdp',default='http://127.0.0.1:9225'); parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args(); args.output.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.connect_over_cdp(args.cdp); page=b.contexts[0].pages[0]
    page.get_by_text('已保存到本机',exact=True).wait_for()
    data=page.evaluate("window.__TAURI_INTERNALS__.invoke('data_dir')")
    assert 'focus-native-qa' in data,'Use the isolated QA profile; do not run on personal data.'
    nav=page.get_by_role('navigation',name='主导航'); errors=[]; rows=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def appearance():
        nav.get_by_role('button',name='设置',exact=True).click()
        page.get_by_role('navigation',name='设置分类').get_by_role('button',name='外观',exact=True).click()
    appearance(); radios=page.locator('input[name="theme-mode"]'); original=next(i for i in range(radios.count()) if radios.nth(i).is_checked())
    try:
        for theme,index in [('light',1),('dark',2)]:
            appearance(); radios.nth(index).click(); expect(radios.nth(index)).to_be_checked(); page.wait_for_timeout(250)
            for width,height in [(1440,900),(1100,720),(900,600),(820,560)]:
                page.set_viewport_size({'width':width,'height':height})
                for label,key in [('今日','today'),('专注','focus'),('长期','planning'),('统计','statistics'),('设置','settings')]:
                    nav.get_by_role('button',name=label,exact=True).click(); page.wait_for_timeout(300)
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),f'Horizontal overflow {key} {width}'
                    assert not nav.get_by_role('button',name='Workflow',exact=True).count()
                    assert not nav.get_by_role('button',name='课程',exact=True).count()
                    panes=page.evaluate('''() => [...document.querySelectorAll('main, main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>80&&r.height>40&&r.top<innerHeight-20&&r.bottom>80&&e.scrollHeight>e.clientHeight+8&&/auto|scroll/.test(getComputedStyle(e).overflowY)}).map((e,i)=>{e.dataset.qaScroll=String(i); const r=e.getBoundingClientRect(); return {i,x:Math.max(60,Math.min(innerWidth-30,r.left+r.width/2)),y:Math.max(80,Math.min(innerHeight-25,r.top+Math.min(r.height/2,120))),before:e.scrollTop};})''')
                    scrolled=0
                    for pane in panes:
                        target=page.locator(f'[data-qa-scroll="{pane["i"]}"]'); target.evaluate('(e)=>e.scrollTop=0')
                        page.mouse.move(pane['x'],pane['y']); page.mouse.wheel(0,450); page.wait_for_timeout(130)
                        after=target.evaluate('(e)=>e.scrollTop')
                        if after>0: scrolled+=1
                        target.evaluate('(e)=>{e.scrollTop=0;delete e.dataset.qaScroll}')
                    if panes: assert scrolled>0,f'Visible scroll regions do not wheel-scroll {key} {width}'
                    rows.append({'page':key,'width':width,'theme':theme,'scrollRegions':len(panes),'wheelScrolled':scrolled})
                    page.screenshot(path=str(args.output/f'{key}-{theme}-{width}.png'))
        assert not errors,errors
        (args.output/'report.json').write_text(json.dumps({'status':'passed','scenarios':rows,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
        print(f'PASS {len(rows)} page/theme/width scenarios; real wheel checks; no page errors')
    finally:
        appearance(); page.locator('input[name="theme-mode"]').nth(original).click()
