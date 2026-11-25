# 시트 앱

구글 시트(데이터)와 구글 드라이브(파일)를 쓰고, 화면은 Vercel에서 보여 주는 모바일 웹앱이에요.
`sheet-app-factory` 스킬의 틀에서 만들었어요.

## 구조
| 곳 | 하는 일 |
|---|---|
| `schema.json` | **앱의 설계도.** 시트·칸·폴더·탭·역할·첫 화면을 여기서 정해요 |
| `gas/Code.js` | 서버(앱스크립트). 로그인 확인, 시트 읽기·쓰기, 파일 올리기, 사진 줄이기 |
| `gas/schema.js` | build.py가 schema.json으로 만드는 파일 (직접 고치지 않기) |
| `web/src/` | 화면 조각. `ORDER.json` 순서대로 합쳐져요 |
| `web/src/js/90_app.js` | **이 앱에만 있는 기능은 여기(또는 91_, 92_ 새 파일)에** |
| `tools/build.py` | 조각 합치기 + 검사 → `web/index.html` (`--mock`이면 `mock/index.html`) |
| `tools/mock.js` | 모의 서버 (비밀번호 `test`, 데이터는 schema.json의 `sample`) |
| `tools/smoke.py` | 375px 폰 폭으로 눌러 보는 기본 검사 + `shots/` 캡처 |
| `tools/deploy.py` | 서버(clasp)와 화면(Vercel)을 한 번에 올리기 |

## 자주 쓰는 명령
```
python tools/build.py --mock && python tools/smoke.py     # 고친 뒤 검사
python tools/deploy.py "v2 무엇을 바꿨는지"                # 미리보기 배포
python tools/deploy.py "v2 무엇을 바꿨는지" --prod         # 실제 주소 배포
```

## 처음 한 번 (사용자)
1. 첫 배포 뒤 앱스크립트 편집기에서 `처음_설정` 실행 → 권한 승인 → 시트·폴더 생김
2. 프로젝트 설정 → 스크립트 속성에 `APP_PW`(모임 비밀번호) 넣기. 채팅·코드에 쓰지 않기
3. 시트의 `회원` 탭에 이름·역할 넣기

## 칸이 바뀔 때
schema.json에 칸을 더하고 `version`을 올린 뒤 → 시트를 백업(파일 → 사본 만들기) → 배포 → 편집기에서 `처음_설정`을 다시 실행하면 빠진 칸만 오른쪽에 더해져요. 칸은 순서가 아니라 맨 위 제목으로 찾으니, 시트에서 칸 순서를 바꿔도 괜찮아요. **칸 이름을 바꾸면 안 돼요**(새 칸으로 인식).
