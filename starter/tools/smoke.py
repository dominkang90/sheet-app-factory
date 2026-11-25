"""모의 화면 기본 검사 (Playwright + 크롬). 폰 폭 375px 로 실제 사람처럼 눌러 본다.
  python tools/build.py --mock && python tools/smoke.py
결과: 통과/실패 목록 + shots/ 에 탭별 캡처. 하나라도 실패하면 종료 코드 1"""
import asyncio, base64, json, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
S = json.load(open('schema.json', encoding='utf-8'))
URL = 'file:///' + os.path.abspath('mock/index.html').replace(os.sep, '/')
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9Qz0AEYBxVSF8FAAhNBf8Tr1fpAAAAAElFTkSuQmCC')
R = []
def ok(name, cond, why=''): R.append((bool(cond), name, why)); print(('통과 ' if cond else '실패 ') + name + ('' if cond else f' — {why}'))

async def login(pg, user):
    await pg.goto(URL); await pg.fill('#l_pw', 'test'); await pg.click('#l_go')
    await pg.wait_for_selector('#l_user option', state='attached'); await pg.select_option('#l_user', user); await pg.click('#l_in')
    await pg.wait_for_selector('#tabbar button', timeout=8000)

async def settle(pg, sec):
    await pg.wait_for_function(f"!document.querySelector('{sec} .card.loading')", timeout=8000)

async def main():
    os.makedirs('shots', exist_ok=True)
    lead = next(m['이름'] for m in S['sample']['members'] if m['역할'] in S['leads'])
    plain = next((m['이름'] for m in S['sample']['members'] if m['역할'] == '회원'), None)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        pg = await b.new_page(viewport={'width': 375, 'height': 812}, device_scale_factor=2)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        TEST_ERR = '검사용 오류'   # 일부러 낸 오류는 '화면 오류 없음'에서 뺀다
        # 1) 틀린 비밀번호
        await pg.goto(URL); await pg.fill('#l_pw', 'wrong'); await pg.click('#l_go')
        await pg.wait_for_function("document.getElementById('l_err').textContent.includes('맞지')")
        ok('틀린 비밀번호 안내', True)
        # 2) 로그인
        await login(pg, lead); ok('로그인 (대표)', True)
        tabs = S['tabs']
        # 3) 첫 화면 참석 응답 — 서버 대답 뒤에만 눌린 표시
        if (S.get('home') or {}).get('rsvp') and tabs[0]['view'] == 'home':
            await settle(pg, '#v_' + tabs[0]['key'])
            o1, o2 = S['home']['rsvp']['options'][:2]
            await pg.evaluate("window.MOCK_FAIL='upsert'")
            await pg.click(f'[data-rsvp="{o2}"]'); await pg.wait_for_function("document.getElementById('toast').textContent.includes('잘 안')")
            ok('실패하면 눌린 표시 안 함', await pg.get_attribute(f'[data-rsvp="{o2}"]', 'aria-pressed') != 'true')
            await pg.evaluate("window.MOCK_FAIL=null")
            await pg.click(f'[data-rsvp="{o1}"]')
            await pg.wait_for_function(f"document.querySelector('[data-rsvp=\"{o1}\"]').getAttribute('aria-pressed')==='true'", timeout=5000)
            ok('참석 응답 저장', True)
        # 4) 탭마다 열어 보고 캡처
        for t in tabs:
            await pg.click(f'#tabbar button[data-t="{t["key"]}"]')
            try: await settle(pg, '#v_' + t['key']); good = True
            except Exception as e: good = False
            await pg.wait_for_timeout(500)
            await pg.screenshot(path=f'shots/{t["key"]}.png', full_page=True)
            ok(f'탭 열기: {t["label"]}', good, '불러오기가 끝나지 않음')
        # 5) 표 탭: 빈칸 검사 → 새로 쓰기 저장
        tt = next((t for t in tabs if t['view'] == 'table'), None)
        if tt:
            sd = next(s for s in S['sheets'] if s['key'] == tt['sheet'])
            await pg.click(f'#tabbar button[data-t="{tt["key"]}"]'); await settle(pg, '#v_' + tt['key'])
            n0 = await pg.locator(f'#v_{tt["key"]} .card.item').count()
            await pg.click(f'#v_{tt["key"]} [data-new]'); await pg.click('#md_btns .btn >> nth=0')
            req = [c for c in sd['columns'] if c.get('req') and c.get('type') not in ('date', 'user')]
            if req: ok('빈칸이면 저장 막기', (await pg.text_content('#f_err')).strip() != '')
            for c in req:
                if c.get('type') == 'select': await pg.select_option(f'[id="f_{c["h"]}"]', c['options'][0])
                elif c.get('type') in ('number', 'money'): await pg.fill(f'[id="f_{c["h"]}"]', '1000')
                else: await pg.fill(f'[id="f_{c["h"]}"]', '검사로 쓴 글')
            await pg.click('#md_btns .btn >> nth=0')
            await pg.wait_for_function(f"document.querySelectorAll('#v_{tt['key']} .card.item').length > {n0}", timeout=5000)
            ok(f'{sd["name"]} 새로 쓰기 저장', True)
        # 6) 사진 크게 보기 + 넘기기 + 올리기
        gt = next((t for t in tabs if t['view'] == 'gallery'), None)
        if gt:
            await pg.click(f'#tabbar button[data-t="{gt["key"]}"]'); await pg.wait_for_timeout(800)
            if await pg.locator(f'#v_{gt["key"]} .grid button').count() > 1:
                await pg.click(f'#v_{gt["key"]} .grid button >> nth=0'); await pg.wait_for_selector('#lb', state='visible')
                await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(300)
                ok('크게 보기에서 다음 사진', (await pg.text_content('#lb_n')).startswith('2 /'))
                await pg.keyboard.press('Escape'); ok('Esc 로 닫기', not await pg.is_visible('#lb'))
            if await pg.locator(f'#v_{gt["key"]} [data-up]').count():
                await pg.click(f'#v_{gt["key"]} [data-up]')
                async with pg.expect_file_chooser() as fc:
                    await pg.click('#md_btns .btn >> nth=0')
                await (await fc.value).set_files([{'name': 'test.png', 'mimeType': 'image/png', 'buffer': PNG}])
                await pg.wait_for_function("document.getElementById('toast').textContent.includes('올렸어요')", timeout=8000)
                ok('사진 올리기 (줄이기 포함)', '1개 올렸어요' in await pg.text_content('#toast'), await pg.text_content('#toast'))
        # 7) 화면 규칙: 11px 미만 글자, 40px 미만 버튼
        await pg.click(f'#tabbar button[data-t="{tabs[0]["key"]}"]'); await pg.wait_for_timeout(600)
        small = await pg.evaluate("""() => [...document.querySelectorAll('body *')].filter(e => e.offsetParent && e.childNodes.length && [...e.childNodes].some(n => n.nodeType===3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 11).map(e => e.textContent.trim().slice(0,20))""")
        ok('11px 미만 글자 없음', not small, ', '.join(small[:5]))
        tiny = await pg.evaluate("""() => [...document.querySelectorAll('button, a, select, input')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 40).map(e => (e.textContent||e.id).trim().slice(0,15))""")
        ok('누르는 곳 높이 40px 이상', not tiny, ', '.join(tiny[:5]))
        # 7-1) 고쳐 주세요: 빈칸이면 막고, 쓰면 보내고, 보낸 요청이 보인다
        await pg.click('#meBtn'); await pg.click('#meMenu [data-a="fix"]')
        await pg.wait_for_selector('#cr_t', state='visible')
        await pg.click('#md_btns .btn >> nth=0')
        ok('고쳐 주세요: 빈칸이면 막기', (await pg.text_content('#cr_err')).strip() != '')
        await pg.fill('#cr_t', '사진 탭을 맨 뒤로 옮겨 주세요')
        await pg.click('#md_btns .btn >> nth=0')
        await pg.wait_for_function("document.getElementById('toast').textContent.includes('보냈어요')", timeout=5000)
        ok('고쳐 주세요: 보내기', await pg.evaluate("window.MOCK_CARE.req.length === 1 && window.MOCK_CARE.req[0].화면 !== ''"))
        await pg.click('#meBtn'); await pg.click('#meMenu [data-a="fix"]')
        await pg.wait_for_selector('#cr_my .care', timeout=5000)
        ok('고쳐 주세요: 보낸 요청 보기', '사진 탭' in await pg.text_content('#cr_my'))
        await pg.keyboard.press('Escape')
        # 7-2) 화면 오류는 오류 시트로 (같은 오류는 한 번만)
        await pg.evaluate(f"setTimeout(() => {{ throw new Error('{TEST_ERR}') }}, 0); setTimeout(() => {{ throw new Error('{TEST_ERR}') }}, 10)")
        await pg.wait_for_function("window.MOCK_CARE.err.length >= 1", timeout=5000); await pg.wait_for_timeout(300)
        ok('화면 오류 자동 보내기 (한 번만)', await pg.evaluate(f"window.MOCK_CARE.err.filter(e => e.내용.includes('{TEST_ERR}')).length === 1"))
        errs[:] = [x for x in errs if TEST_ERR not in x]
        # 8) 일반 회원은 권한 없는 탭이 안 보임
        if plain:
            await pg.evaluate("localStorage.clear()")
            await login(pg, plain)
            hidden = [t for t in tabs if t.get('roles') and '회원' not in t['roles']]
            vis = await pg.locator('#tabbar button').count()
            ok('일반 회원 탭 제한', vis == len(tabs) - len(hidden), f'{vis}개 보임')
        ok('화면 오류 없음', not errs, ' | '.join(errs[:3]))
        await b.close()
    bad = [r for r in R if not r[0]]
    print(f'\n결과: {len(R) - len(bad)}/{len(R)} 통과' + ('' if not bad else ' — 실패: ' + ', '.join(r[1] for r in bad)))
    sys.exit(1 if bad else 0)

asyncio.run(main())
