// 표 화면: 시트 한 장을 카드 목록으로 보여 주고, 쓰기·고치기·지우기 양식을 칸 정의로 만든다
const TBL = {};
function hasRoleList(list) { return ME.lead || list === 'all' || (Array.isArray(list) && ME.roles.some(r => list.indexOf(r) >= 0)); }
function userColOf(t) { const c = t.columns.find(c => c.type === 'user'); return c ? c.h : ''; }
function canWrite(t, row) {
  if (t.system) return false; if (ME.lead) return true;
  const w = t.write || 'all';
  if (w === 'own') { const uc = userColOf(t); return !row || !uc || row[uc] === ME.name; }
  return hasRoleList(w);
}
async function loadRows(key, force) {
  if (TBL[key] && !force) return TBL[key];
  TBL[key] = await call('list', key); return TBL[key];
}
function titleCol(t) { return t.title || (t.columns.find(c => c.type === 'text') || t.columns[0]).h; }
function sortRows(t, rows) {
  const dc = t.date, tc = t.columns.find(c => c.type === 'datetime');
  const r = rows.slice();
  if (dc) r.sort((a, b) => (b[dc] || '').localeCompare(a[dc] || ''));
  else if (tc) r.sort((a, b) => String(b[tc.h]).localeCompare(String(a[tc.h])));
  else r.reverse();
  return r;
}
function rowCard(t, r) {
  const tc = titleCol(t), uc = userColOf(t), meta = [];
  t.columns.forEach(c => {
    const v = r[c.h]; if (v === '' || v == null || c.h === tc || c.type === 'longtext') return;
    if (c.type === 'date') meta.push(dlabel(v));
    else if (c.type === 'money') meta.push(won(v));
    else if (c.type === 'user') meta.push(v);
    else meta.push(String(v));
  });
  const long = t.columns.filter(c => c.type === 'longtext' && r[c.h]).map(c => `<div class="body">${esc(r[c.h])}</div>`).join('');
  const acts = canWrite(t, r) ? `<div class="acts"><button type="button" class="btn sub sm" data-e="${esc(r.ID)}">고치기</button></div>` : '';
  return `<div class="card item"><div class="grow"><h3>${esc(r[tc] || '(제목 없음)')}</h3><div class="meta">${esc(meta.join(' · '))}</div>${long}</div>${acts}</div>`;
}
VIEWS.table = {
  async show(sec, tab, soft) {
    const t = sheetDef(tab.sheet);
    if (!soft || !TBL[t.key]) sec.innerHTML = `<h2 class="vt">${esc(tab.label)}</h2><div class="card loading" style="height:84px"></div><div class="card loading" style="height:84px"></div>`;
    let rows; try { rows = await loadRows(t.key, soft); } catch (e) { sec.innerHTML = `<h2 class="vt">${esc(tab.label)}</h2>` + empty('불러오지 못했어요', e.message); return; }
    this.render(sec, tab, t, rows);
  },
  render(sec, tab, t, rows) {
    const add = canWrite(t, null) ? `<button type="button" class="btn sm" data-new="1">${esc(tab.addLabel || '새로 쓰기')}</button>` : '';
    let html = `<div class="row" style="justify-content:space-between"><h2 class="vt">${esc(tab.label)}</h2>${add}</div>`;
    if (t.sum) {
      const m = today().slice(0, 7), dc = t.date, sum = rows.filter(r => !dc || String(r[dc]).slice(0, 7) === m).reduce((s, r) => s + Number(r[t.sum] || 0), 0);
      html += `<div class="card"><div class="meta muted">이번 달 ${esc(t.sum)} 합계</div><div class="sum">${won(sum)}</div></div>`;
    }
    const list = sortRows(t, rows);
    if (!list.length) html += empty('아직 아무것도 없어요', canWrite(t, null) ? '오른쪽 위 버튼으로 처음 것을 써 보세요' : '');
    else if (t.date) {
      const td = today(), up = list.filter(r => r[t.date] >= td).reverse(), past = list.filter(r => r[t.date] < td);
      if (up.length) html += '<div class="dlabel">다가오는 것</div>' + up.map(r => rowCard(t, r)).join('');
      if (past.length) html += '<div class="dlabel">지난 것</div>' + past.map(r => rowCard(t, r)).join('');
    } else html += list.map(r => rowCard(t, r)).join('');
    sec.innerHTML = html;
    sec.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.new) editRow(t, null).then(ok => ok && this.render(sec, tab, t, TBL[t.key]));
      if (b.dataset.e) editRow(t, TBL[t.key].find(r => r.ID === b.dataset.e)).then(ok => ok && this.render(sec, tab, t, TBL[t.key]));
    };
  }
};
function fieldHtml(c, v) {
  if (c.type === 'user' || (c.type === 'datetime' && c.auto)) return '';
  const id = 'f_' + c.h, req = c.req ? ' required' : '', val = esc(v == null ? '' : v), hint = c.hint ? `<small>${esc(c.hint)}</small>` : '';
  let input;
  if (c.type === 'longtext') input = `<textarea id="${id}"${req}>${val}</textarea>`;
  else if (c.type === 'select') input = `<select id="${id}"${req}><option value="">골라 주세요</option>${(c.options || []).map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else {
    const ty = { date: 'date', time: 'time', number: 'text', money: 'text' }[c.type] || 'text';
    const im = c.type === 'number' || c.type === 'money' ? ' inputmode="numeric"' : '';
    input = `<input id="${id}" type="${ty}"${im}${req} value="${val}">`;
  }
  return `<label class="fld" data-h="${esc(c.h)}"><span>${esc(c.h)}${c.req ? '' : ' (선택)'}</span>${input}${hint}</label>`;
}
function readForm(t) {
  const o = {}, bad = [];
  t.columns.forEach(c => {
    const el = document.getElementById('f_' + c.h); if (!el) return;
    let v = el.value.trim();
    if ((c.type === 'number' || c.type === 'money') && v) { v = v.replace(/[,원\s]/g, ''); if (!/^-?\d+(\.\d+)?$/.test(v)) bad.push([c.h, '숫자로 써 주세요']); }
    if (c.req && !v) bad.push([c.h, '채워 주세요']);
    o[c.h] = v;
  });
  document.querySelectorAll('#md_b .fld').forEach(f => f.classList.toggle('bad', bad.some(b => b[0] === f.dataset.h)));
  return { o, bad };
}
async function editRow(t, row) {
  const isNew = !row, form = t.columns.map(c => fieldHtml(c, row ? row[c.h] : (c.type === 'date' ? today() : ''))).join('') + '<p class="err" id="f_err"></p>';
  const save = async btn => {
    const { o, bad } = readForm(t);
    if (bad.length) { $('f_err').textContent = `'${bad[0][0]}': ${bad[0][1]}`; return false; }
    $('f_err').textContent = '';
    const r = await saveBtn(btn, () => isNew ? call('add', t.key, o) : call('update', t.key, row.ID, o), '저장했어요');
    if (!r) return false;
    const L = TBL[t.key] || (TBL[t.key] = []), i = L.findIndex(x => x.ID === r.ID);
    if (i >= 0) L[i] = r; else L.push(r);
    return true;
  };
  const del = async btn => {
    if (!await ask('지우기', '<p>이 줄을 지울까요? 되돌릴 수 없어요.</p>', '지우기', '그대로 두기')) return true;   // 확인 창이 같은 자리를 쓰므로 양식도 닫는다
    const ok = await saveBtn(btn, () => call('remove', t.key, row.ID), '지웠어요');
    if (ok) TBL[t.key] = TBL[t.key].filter(x => x.ID !== row.ID);
    return !!ok;
  };
  const btns = [{ label: '저장', value: true, check: save }];
  if (!isNew) btns.push({ label: '지우기', value: true, danger: true, check: del });
  btns.push({ label: '취소', value: false, sub: true });
  return modal(isNew ? t.name + ' 새로 쓰기' : t.name + ' 고치기', form, btns, () => { const f = document.querySelector('#md_b input, #md_b select, #md_b textarea'); if (f) f.focus(); });
}
