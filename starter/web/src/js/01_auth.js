// 로그인: 비밀번호 → 이름 고르기 → 들어가기. 비밀번호는 이 기기에만 기억한다
function showLogin(msg) {
  $('login').style.display = 'flex'; $('top').style.display = 'none'; $('tabbar').style.display = 'none';
  $('l_title').textContent = SCHEMA.app.title; $('l_err').textContent = msg || '';
  setTimeout(() => $('l_pw').focus(), 50);
}
async function checkPw() {
  $('l_err').textContent = '확인 중…';
  try {
    const ms = await rpc('memberList', [$('l_pw').value]);
    $('l_user').innerHTML = ms.map(m => `<option>${esc(m)}</option>`).join('');
    if (AUTH.user && ms.indexOf(AUTH.user) >= 0) $('l_user').value = AUTH.user;
    $('l_who').style.display = 'block'; $('l_err').textContent = ''; $('l_in').focus();
  } catch (e) { $('l_err').textContent = e.message; }
}
async function login() {
  AUTH = { pw: $('l_pw').value, user: $('l_user').value };
  if (!AUTH.user) { $('l_err').textContent = '이름을 골라 주세요'; return; }
  $('l_err').textContent = '들어가는 중…';
  try { ME = await call('whoami'); } catch (e) { $('l_err').textContent = e.message; return; }
  store.set('pw', AUTH.pw); store.set('user', AUTH.user);
  $('login').style.display = 'none'; $('l_err').textContent = '';
  startApp();
}
$('l_go').onclick = checkPw;
$('l_pw').addEventListener('keydown', e => { if (e.key === 'Enter') checkPw(); });
$('l_in').onclick = login;

// 위쪽 '내 정보' 메뉴: 이름·역할, 휴대폰 바로가기 안내, 나가기(확인 후)
function meMenu() {
  const b = $('meBtn'), m = $('meMenu');
  const close = () => { m.hidden = true; b.setAttribute('aria-expanded', 'false'); };
  b.onclick = e => {
    e.stopPropagation();
    if (!m.hidden) return close();
    const standalone = matchMedia('(display-mode: standalone)').matches;
    m.innerHTML = `<div class="who"><b>${esc(ME.name)}</b><br>${esc(ME.roles.join(', ') || '회원')}</div>` +
      (standalone ? '' : '<button type="button" role="menuitem" data-a="home">휴대폰 홈 화면에 추가하기</button>') +
      '<button type="button" role="menuitem" data-a="fix">고쳐 주세요</button>' +
      '<button type="button" role="menuitem" data-a="out">나가기</button>';
    m.hidden = false; b.setAttribute('aria-expanded', 'true'); m.querySelector('button').focus();
  };
  m.onclick = async e => {
    const a = e.target.dataset.a; if (!a) return; close();
    if (a === 'home') modal('홈 화면에 추가하기', '<p>아이폰: 사파리 아래 공유 버튼 → <b>홈 화면에 추가</b><br>안드로이드: 크롬 오른쪽 위 ⋮ → <b>홈 화면에 추가</b></p>', [{ label: '알겠어요', value: 1 }]);
    if (a === 'fix') careRequest();
    if (a === 'out' && await ask('나가기', '<p>이 기기에서 나갈까요? 다시 들어올 때 비밀번호가 필요해요.</p>', '나가기', '머무르기')) { store.del('pw'); location.reload(); }
  };
  document.addEventListener('click', e => { if (!m.hidden && !m.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !m.hidden) { close(); b.focus(); } });
}
