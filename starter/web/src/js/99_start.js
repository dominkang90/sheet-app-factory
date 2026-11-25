// 시작: 기억된 비밀번호가 있으면 바로 들어가고, 없으면 로그인 화면
function startApp() {
  $('top').style.display = 'flex'; $('tabbar').style.display = 'grid';
  $('appTitle').textContent = SCHEMA.app.title; document.title = SCHEMA.app.title;
  buildTabs(); meMenu(); flushErr();
  APP.onStart.forEach(f => { try { f(); } catch (e) { console.warn(e); } });
  go((location.hash || '').slice(1), true);
  window.addEventListener('hashchange', () => { const k = location.hash.slice(1); if (k && k !== CUR) go(k); });
}
(async function boot() {
  $('l_title').textContent = SCHEMA.app.title;
  if (!AUTH.pw || !AUTH.user) return showLogin();
  try { ME = await call('whoami'); startApp(); }
  catch (e) { showLogin(/비밀번호|명단/.test(e.message) ? e.message : '들어가지 못했어요: ' + e.message); }
})();
