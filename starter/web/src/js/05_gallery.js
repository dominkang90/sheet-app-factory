// 사진: 작은 그림을 먼저(6장씩 묶어 한 번에), 크게 보기는 화면 크기 사진 + 옆 사진 미리 받기. 두 번 누르면 원본
const IMG = {}, SZQ = [];
let SZT = 0;
const thumbPx = () => Math.round(Math.min(600, 160 * Math.min(3, devicePixelRatio || 1)));
const bigPx = () => Math.round(Math.min(1600, Math.max(innerWidth, 360) * Math.min(3, devicePixelRatio || 1)));
function sized(id, px) {
  const k = px + '_' + id; if (IMG[k]) return IMG[k];
  IMG[k] = new Promise((res, rej) => { SZQ.push({ id, px, res, rej }); clearTimeout(SZT); SZT = setTimeout(szFlush, 30); });
  IMG[k].catch(() => delete IMG[k]);
  return IMG[k];
}
function szFlush() {
  const byPx = {};
  SZQ.splice(0).forEach(q => (byPx[q.px] = byPx[q.px] || []).push(q));
  Object.keys(byPx).forEach(px => { const L = byPx[px];
    for (let i = 0; i < L.length; i += 6) { const part = L.slice(i, i + 6);
      call('getImagesSized', part.map(q => q.id), +px)
        .then(out => part.forEach((q, j) => out[j] ? q.res(out[j]) : call('getFile', q.id).then(q.res, q.rej)))
        .catch(e => part.forEach(q => q.rej(e)));
    } });
}
function thumbGrid(files, box) {
  box.innerHTML = files.map((f, i) => `<button type="button" data-i="${i}" class="loading" aria-label="${esc(f.date + ' 사진 ' + (i + 1))}"></button>`).join('');
  box.querySelectorAll('button').forEach(b => {
    const f = files[+b.dataset.i];
    sized(f.id, thumbPx()).then(src => { b.classList.remove('loading'); b.innerHTML = `<img src="${src}" alt="">`; }).catch(() => b.classList.remove('loading'));
    b.onclick = () => openLightbox(files, +b.dataset.i);
  });
}
const LB = { files: [], i: 0 };
function openLightbox(files, i) {
  LB.files = files; LB.prev = document.activeElement; $('lb').style.display = 'flex'; lbShow(i); $('lb_x').focus();
}
function lbShow(i) {
  const L = LB.files; LB.i = (i + L.length) % L.length; const f = L[LB.i], img = $('lb_img');
  $('lb_n').textContent = `${LB.i + 1} / ${L.length}` + (f.date ? ' · ' + dlabel(f.date) : '');
  img.alt = `${f.date || ''} 사진 ${LB.i + 1}`; img.classList.remove('zoomed');
  const lq = IMG[thumbPx() + '_' + f.id]; img.classList.add('lq');
  if (lq) lq.then(s => { if (LB.files[LB.i] === f && img.classList.contains('lq')) img.src = s; });
  sized(f.id, bigPx()).then(s => { if (LB.files[LB.i] === f) { img.src = s; img.classList.remove('lq'); } }).catch(fail);
  [1, -1, 2].forEach(d => { const n = L[(LB.i + d + L.length) % L.length]; if (n) sized(n.id, bigPx()).catch(() => {}); });
}
function lbClose() { $('lb').style.display = 'none'; if (LB.prev && LB.prev.focus) LB.prev.focus(); }
(function lbWire() {
  $('lb_x').onclick = lbClose; $('lb_prev').onclick = () => lbShow(LB.i - 1); $('lb_next').onclick = () => lbShow(LB.i + 1);
  document.addEventListener('keydown', e => { if ($('lb').style.display !== 'flex') return;
    if (e.key === 'Escape') lbClose(); if (e.key === 'ArrowRight') lbShow(LB.i + 1); if (e.key === 'ArrowLeft') lbShow(LB.i - 1); });
  const st = $('lb_stage'); let x0 = null, y0 = 0;
  st.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; });
  st.addEventListener('pointerup', e => { if (x0 == null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if ($('lb_img').classList.contains('zoomed')) return;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) lbShow(LB.i + (dx < 0 ? 1 : -1)); });
  $('lb_img').addEventListener('dblclick', () => { const img = $('lb_img'), f = LB.files[LB.i];
    if (img.classList.toggle('zoomed')) call('getFile', f.id).then(s => { if (LB.files[LB.i] === f) img.src = s; }).catch(() => {}); });
})();
VIEWS.gallery = {
  async show(sec, tab, soft) {
    const fd = folderDef(tab.folder);
    const up = canUpload(fd) ? `<button type="button" class="btn sm" data-up="1">${ic('up')}올리기</button>` : '';
    if (!soft || !FILES[fd.key]) sec.innerHTML = `<div class="row" style="justify-content:space-between"><h2 class="vt">${esc(tab.label)}</h2>${up}</div><div class="grid"><button class="loading"></button><button class="loading"></button><button class="loading"></button></div>`;
    let files; try { files = await loadFiles(fd.key, soft); } catch (e) { sec.innerHTML = `<h2 class="vt">${esc(tab.label)}</h2>` + empty('불러오지 못했어요', e.message); return; }
    const imgs = files.filter(f => /^image\//.test(f.mime));
    let html = `<div class="row" style="justify-content:space-between"><h2 class="vt">${esc(tab.label)}</h2>${up}</div><div class="ups" id="ups_${tab.key}"></div>`;
    if (!imgs.length) html += empty(`아직 올라온 ${fd.label || '사진'}이 없어요`, canUpload(fd) ? '올리기 버튼으로 첫 사진을 올려 보세요' : '');
    const dates = [...new Set(imgs.map(f => f.date))];
    html += dates.map(d => `<div class="dlabel">${esc(d ? dlabel(d) : '날짜 없음')}</div><div class="grid" data-d="${esc(d)}"></div>`).join('');
    sec.innerHTML = html;
    dates.forEach(d => thumbGrid(imgs.filter(f => f.date === d), sec.querySelector(`.grid[data-d="${d}"]`)));
    const ub = sec.querySelector('[data-up]');
    if (ub) ub.onclick = () => pickDate(fd).then(date => date != null && pickAndUpload(fd, date, $('ups_' + tab.key), n => n && this.show(sec, tab, true)));
  }
};
// 날짜별 폴더면 날짜를 먼저 묻는다 (기본: 오늘)
async function pickDate(fd) {
  if (!fd.byDate) return '';
  const ok = await modal(`${fd.label || fd.name} 올리기`, `<label class="fld"><span>언제 것인가요?</span><input id="f_pick" type="date" value="${today()}"></label>`, [{ label: '파일 고르기', value: true }, { label: '취소', value: false, sub: true }]);
  return ok ? (document.getElementById('f_pick').value || today()) : null;
}
