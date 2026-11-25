// 파일 올리기: 사진은 화면에서 긴 변 1600px 로 줄여 보낸다. 큰 파일(녹음 등)은 2MB 조각으로 나눠 보낸다
// 한 번에 3개씩, 파일마다 '올리는 중 → 완료/실패' 줄을 보여 준다
const FILES = {};
function canUpload(fd) { return ME.lead || hasRoleList(fd.write || 'all'); }
function b64(buf) { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
function shrink(file, max) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b ? b.arrayBuffer().then(res) : rej(new Error('사진을 읽지 못했어요')), 'image/jpeg', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('사진을 읽지 못했어요')); };
    img.src = url;
  });
}
async function sendOne(fd, date, file, setSt) {
  const isImg = /^image\//.test(file.type) && !/gif|svg/.test(file.type);
  if (isImg) {
    setSt('줄이는 중');
    const buf = await shrink(file, 1600), name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    setSt('올리는 중');
    return call('uploadFile', fd.key, date, { name, mime: 'image/jpeg', data: b64(buf) });
  }
  if (file.size <= 4 * 1048576) { setSt('올리는 중'); return call('uploadFile', fd.key, date, { name: file.name, mime: file.type, data: b64(await file.arrayBuffer()) }); }
  const s = await call('startUpload', fd.key, date, file.name, file.type, file.size), CH = 2 * 1048576;
  let r = null;
  for (let off = 0; off < file.size; off += CH) {
    setSt(Math.round(off / file.size * 100) + '%');
    r = await call('uploadChunk', s.key, off, b64(await file.slice(off, off + CH).arrayBuffer()));
  }
  return r;
}
// 파일 고르기 창을 열고, 고른 파일을 box(목록 자리)에 줄로 보여 주며 올린다. 끝나면 onDone(올린 수)
function pickAndUpload(fd, date, box, onDone) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true;
  inp.accept = fd.accept || (fd.image ? 'image/\u002a' : '');
  inp.onchange = () => uploadList(fd, date, Array.from(inp.files), box, onDone);
  inp.click();
}
function uploadList(fd, date, files, box, onDone) {
  if (!files.length) return;
  let ok = 0, left = files.length, i = 0;
  const rows = files.map(f => { const d = document.createElement('div'); d.className = 'up'; d.innerHTML = `<span class="nm">${esc(f.name)}</span><span class="st">기다리는 중</span>`; box.appendChild(d); return d; });
  const next = () => {
    if (i >= files.length) return;
    const k = i++, f = files[k], row = rows[k], st = row.querySelector('.st');
    sendOne(fd, date, f, t => st.textContent = t)
      .then(() => { ok++; row.className = 'up ok'; st.textContent = '완료'; })
      .catch(e => { row.className = 'up bad'; st.textContent = '실패'; row.title = e.message; })
      .finally(() => { left--; next(); if (!left) { delete FILES[fd.key]; toast(`${ok}개 올렸어요` + (ok < files.length ? `, ${files.length - ok}개는 실패했어요` : '')); if (onDone) onDone(ok); } });
  };
  for (let n = 0; n < 3; n++) next();
}
async function loadFiles(key, force) {
  if (FILES[key] && !force) return FILES[key];
  FILES[key] = await call('listFiles', key, ''); return FILES[key];
}
