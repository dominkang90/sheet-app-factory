// 돌봄 부품: '고쳐 주세요'(내 정보 메뉴) · 화면 오류 자동 보내기
// 요청은 서버의 '요청' 시트로, 오류는 '오류' 시트로 간다. 대표가 시트에서 상태를 '반영함'으로 바꾸고 답을 쓰면 여기 보인다
// 오류는 같은 내용을 한 번만, 한 번 열 때 최대 5개. 못 보내면 이 기기에 모아 두었다가 다음에 들어올 때 보낸다
const CARE = { sent: new Set(), n: 0 };
function careView() {
  if (!ME) return '로그인';
  const t = TABS.find(x => x.key === CUR);
  return t ? t.label : '';
}
function careQueue(q) {
  if (q === undefined) { try { return JSON.parse(store.get('errq') || '[]'); } catch (e) { return []; } }
  if (q.length) store.set('errq', JSON.stringify(q.slice(-10))); else store.del('errq');
}
function reportErr(msg, where) {
  msg = String(msg || '').slice(0, 480);
  if (!msg || !AUTH.pw || CARE.sent.has(msg) || CARE.n >= 5) return;   // 같은 내용은 자리(줄 번호)가 달라도 한 번만
  CARE.sent.add(msg); CARE.n++;
  if (where) msg += ' ' + where;
  const it = { msg, view: careView() };
  rpc('reportError', [AUTH, it.msg, it.view, navigator.userAgent.slice(0, 120)]).catch(() => careQueue(careQueue().concat([it])));
}
async function flushErr() {
  const q = careQueue(); if (!q.length) return;
  careQueue([]);
  for (let i = 0; i < q.length; i++) {
    try { await rpc('reportError', [AUTH, q[i].msg + ' (나중에 보냄)', q[i].view, navigator.userAgent.slice(0, 120)]); }
    catch (e) { careQueue(q.slice(i)); return; }
  }
}
window.addEventListener('error', e => reportErr(e.message || '화면 오류', e.lineno ? `(줄 ${e.lineno}:${e.colno})` : ''));
window.addEventListener('unhandledrejection', e => reportErr('처리 안 된 실패: ' + ((e.reason && e.reason.message) || e.reason)));

async function careRequest() {
  const view = careView();
  const body = `<p class="muted">불편한 점이나 바꾸고 싶은 점을 적어 주세요. 지금 보던 화면(<b>${esc(view)}</b>)도 함께 보내요.</p>` +
    '<label class="fld"><span>무엇을 고치면 좋을까요</span><textarea id="cr_t" maxlength="1000" placeholder="예: 사진 탭을 맨 뒤로 옮겨 주세요"></textarea></label>' +
    '<p class="err" id="cr_err" role="alert"></p><div id="cr_my"></div>';
  const r = await modal('고쳐 주세요', body, [
    { label: '보내기', value: 'sent', check: async btn => {
      const t = $('cr_t').value.trim();
      if (!t) { $('cr_err').textContent = '무엇을 고치면 좋을지 써 주세요'; $('cr_t').focus(); return false; }
      $('cr_err').textContent = '';
      return (await saveBtn(btn, () => call('sendRequest', t, view))) !== undefined;
    } },
    { label: '닫기', value: '', sub: true }
  ], () => { $('cr_t').focus(); careMine(); });
  if (r === 'sent') toast('보냈어요. 반영되면 여기 보낸 요청에서 볼 수 있어요');
}
async function careMine() {
  let rs;
  try { rs = await call('myRequests'); } catch (e) { return; }
  const box = $('cr_my'); if (!box || !rs.length) return;
  box.innerHTML = `<div class="dlabel">${ME.lead ? '받은 요청' : '보낸 요청'}</div>` + rs.map(x =>
    `<div class="care"><span class="st${x.상태 === '반영함' ? ' done' : ''}">${esc(x.상태)}</span>${ME.lead ? `<b>${esc(x.이름)}</b> · ` : ''}${esc(x.내용)}` +
    (x.답 ? `<div class="ans">답: ${esc(x.답)}</div>` : '') + '</div>').join('');
}
