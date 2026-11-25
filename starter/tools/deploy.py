"""서버(앱스크립트)와 화면(Vercel)을 한 번에 올린다. 키·비밀번호는 다루지 않는다(사용자가 직접 넣음).
  python tools/deploy.py "v2 무엇을 바꿨는지"          화면은 미리보기 주소로
  python tools/deploy.py "v2 무엇을 바꿨는지" --prod   화면을 실제 주소로
처음 한 번: clasp 로그인(npx @google/clasp login)과 vercel 로그인이 되어 있어야 한다.
순서: 칸 정의 검사 → (처음이면 앱스크립트 프로젝트 만들기) → 서버 코드가 편집기에서 바뀌었는지 확인 → clasp push
      → 웹앱 배포(같은 주소 유지) → 화면 만들기(서버 주소 넣기) → Vercel → 서버 대답 확인 → CHANGELOG.md 기록"""
import datetime, json, os, re, shutil, subprocess, sys, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
CLASP = 'npx -y @google/clasp@3.4.1'
desc = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else sys.exit('설명을 넣어 주세요: python tools/deploy.py "v2 무엇을 바꿨는지"')
PROD = '--prod' in sys.argv
S = json.load(open('schema.json', encoding='utf-8'))
DJ = 'deploy.json'
dep = json.load(open(DJ, encoding='utf-8')) if os.path.exists(DJ) else {}


def run(cmd, cwd=None, ok_fail=False):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace', shell=True)
    out = (r.stdout + r.stderr).strip()
    if r.returncode and not ok_fail: sys.exit(f'실패: {cmd}\n{out[-800:]}')
    return out


def save_dep(): json.dump(dep, open(DJ, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


print(run(f'"{sys.executable}" tools/build.py'))          # 검사 + gas/schema.js

# 1) 앱스크립트 프로젝트 (처음 한 번)
if not os.path.exists('gas/.clasp.json'):
    keep = open('gas/appsscript.json', encoding='utf-8').read()
    print(run(f'{CLASP} create-script --type standalone --title "{S["app"]["title"]} 서버" --rootDir .', cwd='gas').splitlines()[-1])
    open('gas/appsscript.json', 'w', encoding='utf-8').write(keep)   # create 가 덮어쓴 설정 되돌리기

# 2) 편집기에서 누가 서버 코드를 직접 고쳤으면 덮어쓰기 전에 멈춤
LAST, TMP = '.last_pushed', 'gas_remote_check'   # gas/ 밖에 둬야 clasp 가 같이 올리지 않음
norm = lambda t: t.replace('\r\n', '\n').rstrip()
if os.path.isdir(LAST):
    shutil.rmtree(TMP, ignore_errors=True); os.makedirs(TMP); shutil.copyfile('gas/.clasp.json', f'{TMP}/.clasp.json')
    run(f'{CLASP} pull', cwd=TMP)
    diff = [f for f in os.listdir(TMP) if f != '.clasp.json' and (not os.path.exists(f'{LAST}/{f}') or norm(open(f'{LAST}/{f}', encoding='utf-8').read()) != norm(open(f'{TMP}/{f}', encoding='utf-8').read()))]
    if diff and '--force' not in sys.argv:
        sys.exit('멈춤: 서버 코드가 지난번 올린 뒤 편집기에서 바뀌었어요 → ' + ', '.join(diff) + f'\n받아 온 코드는 {TMP}/ 에 있어요. 합친 뒤 다시 하거나, 덮어써도 되면 --force')
    shutil.rmtree(TMP, ignore_errors=True)
print(run(f'{CLASP} push --force', cwd='gas').splitlines()[-1])
shutil.rmtree(LAST, ignore_errors=True); os.makedirs(LAST)
for f in os.listdir('gas'):
    if f.endswith(('.js', '.json')) and f != '.clasp.json': shutil.copyfile(f'gas/{f}', f'{LAST}/{f}')

# 3) 웹앱 배포 — 처음엔 새로 만들고, 다음부터는 같은 배포를 새 버전으로 (주소가 그대로)
if dep.get('deploymentId'):
    print(run(f'{CLASP} deploy -i {dep["deploymentId"]} -d "{desc}"', cwd='gas').splitlines()[-1])
else:
    out = run(f'{CLASP} deploy -d "{desc}"', cwd='gas')
    m = re.search(r'(AKfy[\w-]+)', out)
    if not m: sys.exit('배포 주소를 찾지 못했어요:\n' + out[-500:])
    dep['deploymentId'] = m.group(1)
    dep['apiUrl'] = f'https://script.google.com/macros/s/{m.group(1)}/exec'
    save_dep(); print('서버 주소를 deploy.json 에 저장했어요')

# 4) 화면 만들기(서버 주소 넣기) → Vercel
print(run(f'"{sys.executable}" tools/build.py').splitlines()[-1])
if not os.path.isdir('web/.vercel'):
    print(run(f'vercel link --yes --project {S["app"]["name"]}', cwd='web').splitlines()[-1])
vout = run('vercel deploy --yes' + (' --prod' if PROD else ''), cwd='web')
urls = re.findall(r'https://[\w.-]+\.vercel\.app', vout)
url = urls[-1] if urls else vout.splitlines()[-1].strip()
print('화면 주소:', url)
if PROD: dep['webUrl'] = url; save_dep()

# 5) 확인: 서버가 대답하는지 (처음_설정 전이면 시트 연결 오류가 나는 게 정상)
try:
    h = urllib.request.urlopen(dep['apiUrl'], timeout=30).read().decode('utf-8', 'replace')
    print('서버 대답:', 'OK' if '"ok":true' in h.replace(' ', '') else '확인 필요 → ' + h[:120])
except Exception as e:
    if '403' in str(e): print('서버 대답: 403 — 앱스크립트 편집기에서 처음_설정을 한 번 실행(권한 승인)해야 열려요 (카드 7)')
    else: print('서버 대답: 확인 필요 →', e)
sid = json.load(open('gas/.clasp.json', encoding='utf-8')).get('scriptId', '')
print('편집기:', f'https://script.google.com/d/{sid}/edit')
with open('CHANGELOG.md', 'a', encoding='utf-8') as f:
    f.write(f'- {datetime.date.today()} {desc} ({"실제" if PROD else "미리보기"}: {url})\n')
print('기록: CHANGELOG.md 에 한 줄 추가. 이제 git 커밋을 하세요.')
