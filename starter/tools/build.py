"""schema.json + web/src 조각 → web/index.html(Vercel용) · gas/schema.js(서버용). 만들기 전에 검사까지 한다.
  python tools/build.py           실제 화면 (서버 주소는 deploy.json 의 apiUrl)
  python tools/build.py --mock    모의 화면 mock/index.html (가짜 서버, 비밀번호 test)
검사: ① 칸 정의(schema) 앞뒤가 맞는지 ② 화면 스크립트에 슬래시+별표 없음(앱스크립트가 거기서 잘라 먹음) ③ 문법(node --check)"""
import json, os, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
TYPES = {'text', 'longtext', 'date', 'time', 'datetime', 'number', 'money', 'select', 'user'}
VIEWS = {'home', 'table', 'gallery'}


def check_schema(S):
    e = []
    keys = [t['key'] for t in S['sheets']]
    fkeys = [f['key'] for f in S['folders']]
    if len(set(keys)) != len(keys): e.append('시트 key 가 겹침')
    for t in S['sheets']:
        if t['name'] in ('요청', '오류'): e.append(f'시트 이름 "{t["name"]}" 은 틀이 쓰는 이름이에요 (고쳐 주세요·오류 기록). 다른 이름으로')
    if any(f['name'] == '백업' for f in S['folders']): e.append('폴더 이름 "백업" 은 틀이 쓰는 이름이에요 (주간 백업)')
    if len(set(fkeys)) != len(fkeys): e.append('폴더 key 가 겹침')
    for r in S.get('leads', []):
        if r not in S.get('roles', []): e.append(f'leads 의 "{r}" 이 roles 에 없음')
    for t in S['sheets']:
        hs = [c['h'] for c in t['columns']]
        if len(set(hs)) != len(hs): e.append(f'{t["name"]}: 칸 이름이 겹침')
        if 'ID' in hs: e.append(f'{t["name"]}: ID 칸은 자동으로 생기므로 빼 주세요')
        for c in t['columns']:
            if c.get('type', 'text') not in TYPES: e.append(f'{t["name"]}.{c["h"]}: 모르는 종류 {c.get("type")}')
            if c.get('type') == 'select' and not c.get('options'): e.append(f'{t["name"]}.{c["h"]}: 보기(options)가 없음')
        for k in ('title', 'date', 'sum'):
            if t.get(k) and t[k] not in hs: e.append(f'{t["name"]}: {k}="{t[k]}" 칸이 없음')
        w = t.get('write', 'all')
        if w == 'own' and not any(c.get('type') == 'user' for c in t['columns']): e.append(f'{t["name"]}: write=own 이면 user 칸이 필요')
    A = S['auth']; at = next((t for t in S['sheets'] if t['key'] == A['sheet']), None)
    if not at: e.append(f'auth.sheet "{A["sheet"]}" 시트가 없음')
    else:
        hs = [c['h'] for c in at['columns']]
        for k in ('name', 'role'):
            if A[k] not in hs: e.append(f'auth.{k}="{A[k]}" 칸이 회원 시트에 없음')
    for tab in S['tabs']:
        v = tab.get('view')
        if v not in VIEWS and not any(f'VIEWS.{v} ' in open(os.path.join('web/src/js', f), encoding='utf-8').read() for f in os.listdir('web/src/js')):
            e.append(f'탭 {tab["key"]}: 화면 "{v}" 을 만든 코드(VIEWS.{v} = ...)가 없음')
        if v == 'table' and tab.get('sheet') not in keys: e.append(f'탭 {tab["key"]}: 시트 "{tab.get("sheet")}" 없음')
        if v == 'gallery' and tab.get('folder') not in fkeys: e.append(f'탭 {tab["key"]}: 폴더 "{tab.get("folder")}" 없음')
    H = S.get('home') or {}
    if H.get('nextEvent') and H['nextEvent'] not in keys: e.append('home.nextEvent 시트 없음')
    if H.get('rsvp'):
        rt = next((t for t in S['sheets'] if t['key'] == H['rsvp']['sheet']), None)
        et = next((t for t in S['sheets'] if t['key'] == H.get('nextEvent')), None)
        if not rt: e.append('home.rsvp 시트 없음')
        elif et and et.get('date') not in [c['h'] for c in rt['columns']]: e.append('home.rsvp 시트에 일정과 같은 이름의 날짜 칸이 필요')
    for k in (H.get('uploads') or []) + ([H['photos']] if H.get('photos') else []):
        if k not in fkeys: e.append(f'home 의 폴더 "{k}" 없음')
    return e


def js_json(o):  # 'audio/*' 같은 글자도 앱스크립트가 주석 시작으로 오해하므로 바꿔 쓴다
    return json.dumps(o, ensure_ascii=False).replace('</', '<\\/').replace('/' + '*', '/\\u002a').replace('*' + '/', '\\u002a/')


def main():
    mock = '--mock' in sys.argv
    S = json.load(open('schema.json', encoding='utf-8'))
    errs = check_schema(S)
    print('칸 정의:', 'OK' if not errs else '고쳐야 함'); [print('  -', x) for x in errs]
    if errs: sys.exit(1)
    lite = {k: v for k, v in S.items() if k != 'sample'}
    open('gas/schema.js', 'w', encoding='utf-8').write('// build.py 가 schema.json 으로 만든 파일 — 직접 고치지 마세요\nconst SCHEMA = ' + json.dumps(lite, ensure_ascii=False, indent=1) + ';\n')
    order = json.load(open('web/src/ORDER.json', encoding='utf-8'))
    h = ''.join(open(p, encoding='utf-8', newline='').read() for p in order)
    api = 'mock' if mock else (json.load(open('deploy.json', encoding='utf-8')).get('apiUrl', '') if os.path.exists('deploy.json') else '')
    h = h.replace('__SCHEMA__', js_json(lite)).replace('__API_URL__', api or '__API_URL__').replace('__TITLE__', S['app']['title'])
    a = h.rfind('<script>'); b = h.rfind('</script>'); js = h[a + 8:b]
    bad = js.count('/' + '*') + js.count('*' + '/')
    tmp = os.path.join('tools', '_chk.js'); open(tmp, 'w', encoding='utf-8').write(js)
    ok = subprocess.run(['node', '--check', tmp], capture_output=True, text=True, encoding='utf-8')
    os.remove(tmp)
    print('슬래시별표:', '없음 OK' if not bad else f'{bad}개 — 고쳐야 함')
    print('문법:', 'OK' if ok.returncode == 0 else ok.stderr[:600])
    if bad or ok.returncode: sys.exit(1)
    if mock:
        m = open('tools/mock.js', encoding='utf-8').read().replace('__MOCK_SCHEMA__', js_json(S))
        h = h[:a] + '<script>\n' + m + '\n</script>\n' + h[a:]
        os.makedirs('mock', exist_ok=True); out = 'mock/index.html'
    else:
        out = 'web/index.html'
        if not api: print('알림: 서버 주소(deploy.json)가 아직 없어 화면이 서버에 연결되지 않아요 — deploy.py 가 채워 줘요')
    open(out, 'w', encoding='utf-8').write(h)
    print(f'{out} {len(h):,}자 · 조각 {len(order)}개')


if __name__ == '__main__':
    main()
