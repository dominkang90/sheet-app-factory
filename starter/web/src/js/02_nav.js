// 아래 탭바: schema.tabs 로 만든다. 역할에 맞는 탭만 보인다. 주소 끝 #탭이름 으로 바로 열 수 있다
const VIEWS = {};
let TABS = [], CUR = '';
function canSee(roles) { return !roles || ME.lead || roles === 'all' || ME.roles.some(r => roles.indexOf(r) >= 0); }
function buildTabs() {
  TABS = SCHEMA.tabs.filter(t => canSee(t.roles));
  const nav = $('tabbar'); nav.style.gridTemplateColumns = `repeat(${TABS.length},1fr)`;
  nav.innerHTML = TABS.map(t => `<button type="button" data-t="${t.key}">${ic(t.icon)}<span>${esc(t.label)}</span></button>`).join('');
  $('main').innerHTML = TABS.map(t => `<section class="view" id="v_${t.key}" aria-label="${esc(t.label)}"></section>`).join('');
  nav.onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.t); };
}
function go(key, force) {
  const t = TABS.find(x => x.key === key) || TABS[0];
  if (CUR === t.key && !force) { VIEWS[t.view].show($('v_' + t.key), t, true); return; }
  CUR = t.key;
  document.querySelectorAll('#tabbar button').forEach(b => { if (b.dataset.t === t.key) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  document.querySelectorAll('section.view').forEach(s => s.classList.toggle('on', s.id === 'v_' + t.key));
  if (location.hash !== '#' + t.key) history.replaceState(null, '', '#' + t.key);
  window.scrollTo(0, 0);
  VIEWS[t.view].show($('v_' + t.key), t, false);
}
function refreshCur() { const t = TABS.find(x => x.key === CUR); if (t) VIEWS[t.view].show($('v_' + t.key), t, true); }
function empty(title, how) { return `<div class="empty"><b>${esc(title)}</b>${esc(how || '')}</div>`; }
