# 사용자 할 일 카드

그 단계에서 **빠진 것만** 골라 한 장으로 보여 준다. 명령은 PowerShell 코드 블록 하나에 한 줄씩.

## 카드 0 — 처음 한 번 (계정 연결)
확인 명령: `gh auth status` · `vercel whoami` · `npx -y @google/clasp@3.4.1 show-authorized-user`
- [ ] git 이름·이메일 (커밋에 찍힘. GitHub 설정의 noreply 이메일을 쓰면 실제 이메일이 안 드러나요):
      `git config --global user.name "이름"` · `git config --global user.email "아이디@users.noreply.github.com"`
- [ ] GitHub 로그인: `gh auth login` (브라우저에서 승인)
- [ ] Vercel 로그인: `vercel login`
- [ ] 구글(clasp) 로그인: `npx -y @google/clasp@3.4.1 login` → 데이터가 들어갈 **구글 계정**으로
- [ ] Apps Script API 켜기: https://script.google.com/home/usersettings 에서 "Google Apps Script API" 사용

## 카드 7 — 첫 배포 뒤 한 번 (서버 준비)
deploy.py 가 끝나면 Claude 가 `gas/.clasp.json` 의 scriptId 로 편집기 주소를 알려 준다: `https://script.google.com/d/<scriptId>/edit`
- [ ] 편집기에서 함수 `처음_설정` 고르고 **실행** → 권한 승인 → 실행 기록에 시트·폴더 주소가 나옴
- [ ] 왼쪽 톱니(프로젝트 설정) → 스크립트 속성 → `APP_PW` 에 모임 비밀번호 (채팅에 쓰지 않기)
- [ ] 생긴 시트의 `회원` 탭에 이름·역할 넣기 (대표 한 명은 꼭). 실행 기록의 `회원` 줄이 '아직 없음'이면 이것부터
- [ ] 실행 기록의 `주간_백업` 줄이 '켰음'인지 확인 (매주 월요일 새벽 3시, 시트 사본을 `백업` 폴더에)
- [ ] 앞으로 회원이 보낸 **고쳐 주세요**는 시트의 `요청` 탭에 쌓여요. 반영하면 `상태`를 '반영함'으로 바꾸고 `답`을 쓰면 회원 화면에 보여요. 화면 오류는 `오류` 탭에 자동으로 쌓여요
- [ ] 화면 주소에서 로그인해 보기

## 카드 8 — 실제 폰 확인
회원 2명에게 화면 주소를 보내고, 확인할 것 3~4개를 짧게 (예: 참석 버튼이 바로 이해되는지, 사진 올리기를 찾는지, 글자가 잘 보이는지). 들은 말을 그대로 Claude 에게 전달.

## 허락이 필요한 일 (그때마다 묻기)
- GitHub 비공개 저장소 만들기·푸시
- Vercel 실제 주소(`--prod`) 배포
- 드라이브에 새 폴더·시트 만들기 (처음_설정)
