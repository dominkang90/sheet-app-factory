"""틀(starter)을 복사해 새 앱 폴더를 만든다.
  python new_app.py <영문이름> --title "보이는 이름" [--preset club] [--dest C:\\Users\\rkdtk\\dev] [--color "#0B5D56"]
- 코드는 구글 드라이브 밖(기본 C:\\Users\\rkdtk\\dev)에 둔다: 드라이브 동기화와 git 이 같은 폴더를 건드리면 저장소가 깨질 수 있다
- 프리셋의 schema.json 을 복사하고 이름·제목만 바꾼다. 이어서 git init + 첫 커밋(로컬만)"""
import argparse, json, os, re, shutil, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('name'); ap.add_argument('--title', required=True); ap.add_argument('--preset', default='club')
ap.add_argument('--dest', default=os.path.join(os.path.expanduser('~'), 'dev')); ap.add_argument('--color')
a = ap.parse_args()
if not re.fullmatch(r'[a-z][a-z0-9-]{2,40}', a.name): sys.exit('이름은 영어 소문자·숫자·하이픈으로 (예: book-club). Vercel 주소에도 쓰여요')
dest = os.path.abspath(os.path.join(a.dest, a.name))
if '내 드라이브' in dest or 'My Drive' in dest or 'GoogleDrive' in dest: sys.exit('구글 드라이브 안에는 만들지 않아요(동기화와 git 충돌). --dest 를 C: 아래로 주세요')
if os.path.exists(dest): sys.exit(f'이미 있어요: {dest}')
pre = os.path.join(HERE, 'presets', a.preset, 'schema.json')
if not os.path.exists(pre): sys.exit(f'프리셋이 없어요: {a.preset} (있는 것: {", ".join(os.listdir(os.path.join(HERE, "presets")))})')
shutil.copytree(os.path.join(HERE, 'starter'), dest, ignore=shutil.ignore_patterns('mock', 'shots', '__pycache__', '.last_pushed', '.clasp.json', 'deploy.json', '.vercel', 'index.html', 'schema.js'))
S = json.load(open(pre, encoding='utf-8'))
S['app']['name'] = a.name; S['app']['title'] = a.title
if a.color: S['app']['color'] = a.color
json.dump(S, open(os.path.join(dest, 'schema.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open(os.path.join(dest, 'CHANGELOG.md'), 'w', encoding='utf-8').write(f'# {a.title} 바뀐 기록\n\n')
r = subprocess.run(f'git init -q -b main && git add -A && git commit -q -m "{a.title}: 틀에서 시작 ({a.preset})"', cwd=dest, shell=True, capture_output=True, text=True)
print(f'만들었어요: {dest}')
err = (r.stderr or r.stdout)
if r.returncode == 0: print('git: 첫 커밋 OK (로컬)')
elif 'email' in err or 'identity' in err: print('git: 커밋 전에 git 이름·이메일 설정이 필요해요 (카드 0). 파일은 준비돼 있어요')
else: print('git: 확인 필요 → ' + err[-200:])
print('다음: schema.json 고치기 → python tools/build.py --mock → python tools/smoke.py')
