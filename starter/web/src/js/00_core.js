// 공통 도구. 주의: 이 화면 코드에는 슬래시+별표 주석을 쓰지 않는다 (build.py 가 검사)
const SCHEMA = __SCHEMA__;
const API = '__API_URL__';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => Number(n || 0).toLocaleString('ko-KR') + '원';
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const dlabel = d => { if (!d) return ''; const t = new Date(d + 'T00:00:00'); return `${t.getMonth() + 1}월 ${t.getDate()}일 (${WD[t.getDay()]})`; };
const sheetDef = key => SCHEMA.sheets.find(s => s.key === key);
const folderDef = key => SCHEMA.folders.find(f => f.key === key);
const store = {
  k: n => SCHEMA.app.name + '_' + n,
  get(n) { try { return localStorage.getItem(this.k(n)) || ''; } catch (e) { return ''; } },
  set(n, v) { try { localStorage.setItem(this.k(n), v); } catch (e) {} },
  del(n) { try { localStorage.removeItem(this.k(n)); } catch (e) {} }
};
let AUTH = { pw: store.get('pw'), user: store.get('user') };
let ME = null;
document.documentElement.style.setProperty('--accent', SCHEMA.app.color || '#0B5D56');

const ICONS = {
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  chat: '<path d="M5 5h14v10H9l-4 4z"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/>',
  chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  up: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'
};
const ic = (n, cls) => `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ICONS.list}</svg>`;

// 네트워크 표시: 0.6초 넘게 걸릴 때만 화면 아래에 작게
const NET = { n: 0, t: 0 };
function netOn() { NET.n++; clearTimeout(NET.t); NET.t = setTimeout(() => { if (NET.n) $('net').hidden = false; }, 600); }
function netOff() { NET.n = Math.max(0, NET.n - 1); if (!NET.n) { clearTimeout(NET.t); setTimeout(() => { if (!NET.n) $('net').hidden = true; }, 300); } }

// 서버 부르기. 모의 화면에서는 window.MOCK 이 대신 대답한다
async function rpc(fn, args) {
  if (window.MOCK) return window.MOCK(fn, args);
  if (!API || API.indexOf('__') === 0) throw new Error('서버 주소가 아직 없어요 (배포 전)');
  let r;
  try { r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn, args }) }); }
  catch (e) { throw new Error('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요'); }
  let j; try { j = await r.json(); } catch (e) { throw new Error('서버 대답을 읽지 못했어요 (HTTP ' + r.status + ')'); }
  if (!j.ok) throw new Error(j.error);
  return j.data;
}
async function call(fn, ...args) {
  netOn();
  try { return await rpc(fn, [AUTH, ...args]); }
  catch (e) { if (/비밀번호|명단/.test(e.message)) { store.del('pw'); showLogin(e.message); } throw e; }
  finally { netOff(); }
}

function toast(t) { const el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(el._t); el._t = setTimeout(() => el.style.display = 'none', 2800); }
function fail(e) {
  const m = (e && e.message) || String(e); toast('잘 안 됐어요: ' + m);
  if (/HTTP \d|읽지 못/.test(m) && typeof reportErr === 'function') reportErr('서버: ' + m);   // 서버가 망가진 경우만 오류 시트로
}

// 확인 창. 버튼 = [{label, value, sub}] → 누른 버튼의 value 로 끝난다. Esc 는 마지막 버튼(보통 취소)
function modal(title, bodyHtml, buttons, onOpen) {
  return new Promise(res => {
    const m = $('modal'), prev = document.activeElement;
    $('md_t').textContent = title; $('md_b').innerHTML = bodyHtml || ''; $('md_btns').innerHTML = '';
    const close = v => { m.style.display = 'none'; document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); res(v); };
    const onKey = e => { if (e.key === 'Escape') close(buttons[buttons.length - 1].value); };
    buttons.forEach(b => {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'btn' + (b.sub ? ' sub' : '') + (b.danger ? ' danger' : ''); el.textContent = b.label;
      el.onclick = async () => { if (b.check) { const ok = await b.check(el); if (!ok) return; } close(b.value); };
      $('md_btns').appendChild(el);
    });
    m.style.display = 'flex'; document.addEventListener('keydown', onKey);
    if (onOpen) onOpen(); else $('md_btns').firstChild.focus();
  });
}
const ask = (title, body, yes, no) => modal(title, body, [{ label: yes, value: true }, { label: no || '취소', value: false, sub: true }]);

// 버튼 안에서 저장: 서버가 "저장했다"고 대답한 뒤에만 성공 표시
async function saveBtn(btn, job, okMsg) {
  const t = btn.innerHTML; btn.disabled = true; btn.textContent = '저장 중…';
  try { const r = await job(); if (okMsg) toast(okMsg); return r; }
  catch (e) { fail(e); return undefined; }
  finally { btn.disabled = false; btn.innerHTML = t; }
}
