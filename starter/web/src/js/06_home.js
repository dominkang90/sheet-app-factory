// 첫 화면(오늘): 다음 일정 + 참석 응답, 바로 올리기, 최근 사진. 무엇을 보일지는 schema.home 이 정한다
VIEWS.home = {
  async show(sec, tab, soft) {
    const H = SCHEMA.home || {};
    if (!soft) sec.innerHTML = `<h2 class="vt">${esc(tab.label)}</h2><div class="card loading" style="height:150px"></div><div class="card loading" style="height:110px"></div>`;
    const jobs = [
      H.nextEvent ? loadRows(H.nextEvent, soft) : Promise.resolve([]),
      H.rsvp ? loadRows(H.rsvp.sheet, soft) : Promise.resolve([]),
      H.photos ? loadFiles(H.photos, soft) : Promise.resolve([])
    ];
    let ev, at, ph;
    try { [ev, at, ph] = await Promise.all(jobs); } catch (e) { sec.innerHTML = `<h2 class="vt">${esc(tab.label)}</h2>` + empty('불러오지 못했어요', e.message); return; }
    this.render(sec, tab, H, ev, at, ph);
  },
  render(sec, tab, H, ev, at, ph) {
    let html = `<h2 class="vt">${esc(tab.label)} <span class="muted" style="font-size:15px;font-weight:400">${dlabel(today())}</span></h2>`;
    const et = H.nextEvent && sheetDef(H.nextEvent), dc = et && et.date;
    const next = et ? ev.filter(r => r[dc] >= today()).sort((a, b) => (a[dc] + (a['시작'] || '')).localeCompare(b[dc] + (b['시작'] || '')))[0] : null;
    if (et) {
      if (!next) html += `<div class="card">${empty('다음 일정이 아직 없어요', canWrite(et, null) ? '' : '정해지면 여기에 보여요')}${canWrite(et, null) ? '<button type="button" class="btn sub" data-addev="1" style="width:100%">일정 만들기</button>' : ''}</div>`;
      else {
        const R = H.rsvp, mine = R && at.find(r => r[dc] === next[dc] && r[userColOf(sheetDef(R.sheet))] === ME.name);
        const cnt = R ? R.options.map(o => `${o} ${at.filter(r => r[dc] === next[dc] && r[R.answer] === o).length}명`).join(' · ') : '';
        const when = [dlabel(next[dc]), [next['시작'], next['끝']].filter(Boolean).join('~'), next['장소']].filter(Boolean).join(' · ');
        html += `<div class="card"><div class="meta muted">다음 일정</div><h3 style="font-size:20px;margin:4px 0">${esc(next[titleCol(et)])}</h3><div class="meta">${esc(when)}</div>` +
          (R ? `<div class="row" style="margin-top:12px">${R.options.map(o => `<button type="button" class="btn sub grow" data-rsvp="${esc(o)}" aria-pressed="${mine && mine[R.answer] === o ? 'true' : 'false'}">${esc(o)}</button>`).join('')}</div><div class="meta muted" style="margin-top:8px">${esc(cnt)}</div>` : '') + '</div>';
      }
    }
    const ups = (H.uploads || []).map(folderDef).filter(f => f && canUpload(f));
    if (ups.length) {
      html += `<div class="card"><button type="button" class="btn" style="width:100%" data-upk="${ups[0].key}">${ic('cam')}찍기 · 올리기</button>` +
        (ups.length > 1 ? `<details class="fold"><summary>종류 골라서 올리기</summary><div class="row">${ups.map(f => `<button type="button" class="btn sub sm" data-upk="${f.key}">${esc(f.label || f.name)}</button>`).join('')}</div></details>` : '') +
        '<div class="ups" id="ups_home"></div></div>';
    }
    if (H.photos) {
      const imgs = ph.filter(f => /^image\//.test(f.mime)).slice(0, 6), fd = folderDef(H.photos);
      html += `<div class="card"><h3>${esc(fd.label || '사진')}</h3>${imgs.length ? '<div class="grid" id="home_ph"></div>' : `<p class="muted" style="margin:0">아직 올라온 ${esc(fd.label || '사진')}이 없어요</p>`}</div>`;
      sec.innerHTML = html; if (imgs.length) thumbGrid(imgs, $('home_ph'));
    } else sec.innerHTML = html;
    sec.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.rsvp) {
        const R = H.rsvp, r = await saveBtn(b, () => call('upsert', R.sheet, { [dc]: next[dc] }, { [R.answer]: b.dataset.rsvp }), `'${b.dataset.rsvp}'로 저장했어요`);
        if (r) { const L = TBL[R.sheet], i = L.findIndex(x => x.ID === r.ID); if (i >= 0) L[i] = r; else L.push(r); this.render(sec, tab, H, ev, TBL[R.sheet], ph); }
      }
      if (b.dataset.addev) editRow(et, null).then(ok => ok && this.render(sec, tab, H, TBL[et.key], at, ph));
      if (b.dataset.upk) { const fd = folderDef(b.dataset.upk); const d = await pickDate(fd); if (d != null) pickAndUpload(fd, d, $('ups_home'), n => n && fd.key === H.photos && this.show(sec, tab, true)); }
    };
  }
};
