# schema.json 쓰는 법

앱의 설계도 한 장. 서버·화면·모의 서버·검사가 모두 이것을 읽는다. 고친 뒤 `python tools/build.py --mock` 이 앞뒤를 검사한다.

## 맨 위
| 키 | 뜻 |
|---|---|
| `version` | 칸 정의 버전. 칸을 더하거나 바꾸면 +1 |
| `app` | `name`(영문, Vercel 주소), `title`(보이는 이름), `color`(대표 색), `tz` |
| `scale`, `privacy` | 기획서용 기록(규모·연락처 수집·보관 기간·사진 공개 여부) |
| `auth` | 로그인 명단: `sheet`(회원 시트 key), `name`·`role`·`status` 칸, `inactive`(이 값이면 로그인 못 함) |
| `roles`, `leads` | 역할 목록, 모든 권한을 가진 역할 |

## sheets — 시트 한 장 = 표 하나
```json
{ "key": "money", "name": "돈", "title": "항목", "date": "날짜", "sum": "금액",
  "write": ["대표", "총무"], "read": ["대표", "총무"],
  "columns": [ { "h": "날짜", "type": "date", "req": true }, ... ] }
```
- `key` 코드에서 부르는 이름(영문), `name` 시트 탭 이름
- `title` 카드 제목으로 쓸 칸, `date` 다가오는 것/지난 것을 나눌 칸, `sum` 이번 달 합계를 낼 칸
- `write`: `"all"` 모두 / `"own"` 자기 줄만(이름 칸 `user` 필요) / `["역할"…]`. `read`: 없으면 모두
- `system: true` 서버만 쓰는 시트(예: 기록). `hidden: true` 탭으로는 안 보이는 시트(예: 출석)
- 시트 이름 `요청`·`오류`, 폴더 이름 `백업` 은 틀이 쓰므로 쓰지 않는다. 백업 보관 개수는 맨 위에 `"backupKeep": 4` (기본 4주치)
- 칸 `type`: `text`, `longtext`, `date`, `time`, `datetime`(`auto: true` 면 쓴 시각 자동), `number`, `money`, `select`(`options` 필수), `user`(쓴 사람 자동)
- 칸 옵션: `req`(꼭 채움), `hint`(입력칸 아래 작은 설명)
- `ID` 칸은 자동으로 생긴다. 직접 넣지 않는다.

## folders — 드라이브 폴더
```json
{ "key": "photo", "name": "01_사진", "byDate": true, "image": true, "label": "모임 사진", "write": "all", "accept": "image/*" }
```
- `byDate` 이면 `01_사진/2026-11/2026-11-26/` 처럼 날짜별
- `image` 사진 폴더(올릴 때 1600px로 줄임, 앨범에 보임), `write` 올릴 수 있는 역할, `accept` 고를 수 있는 파일 종류

## tabs — 아래 탭바
`{ "key": "money", "label": "현황", "icon": "chart", "view": "table", "sheet": "money", "roles": ["대표","총무"] }`
- `view`: `home`, `table`(sheet 필요), `gallery`(folder 필요), 또는 90_app.js 에 만든 새 화면 이름
- `icon`: home, cal, chat, photo, chart, list, up, cam (00_core.js 의 ICONS 에 더할 수 있음)
- `roles` 있으면 그 역할(+leads)에게만 보임. 탭은 4~5개 권장

## home — 첫 화면
- `nextEvent`: 다음 일정을 보일 시트 key (그 시트의 `date` 칸 사용)
- `rsvp`: `{ sheet, answer, options }` 참석 응답. rsvp 시트에도 일정과 **같은 이름의 날짜 칸**이 있어야 함
- `photos`: 최근 사진을 보일 폴더 key, `uploads`: '찍기·올리기'에 보일 폴더들(첫 번째가 큰 버튼)

## sample — 모의 화면 데이터
시트 key 별 줄 목록. 날짜에 `"+3"`, `"-4"` 처럼 쓰면 오늘 기준 며칠 뒤/앞. `files: { 폴더key: 장수 }` 는 가짜 사진 수.
`members` 에 leads 역할 한 명과 `회원` 한 명은 꼭 넣는다(smoke.py 가 두 입장으로 검사).
