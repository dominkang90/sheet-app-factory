// 시트 앱 틀 — 서버 (Google Apps Script)
// 화면은 Vercel 에 있고, 여기는 데이터 처리만 한다.
// schema.js 의 SCHEMA(= schema.json, build.py 가 만들어 줌)를 읽어 시트·폴더를 만들고 요청을 처리한다.
// 비밀번호는 코드에 쓰지 않는다: 앱스크립트 편집기 → 프로젝트 설정 → 스크립트 속성 APP_PW 에 사용자가 직접 넣는다.

const P_ = PropertiesService.getScriptProperties();
function cfg_(k) { return P_.getProperty(k) || ''; }
function tz_() { return SCHEMA.app.tz || 'Asia/Seoul'; }
function now_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'); }

/** ▶ 처음 한 번: 편집기에서 이 함수를 골라 '실행' → 권한 승인. 칸이 늘어난 뒤 다시 실행해도 안전하다(있는 칸·데이터는 그대로) */
function 처음_설정() { return setup(); }
function setup() {
  let root = cfg_('ROOT_ID') ? DriveApp.getFolderById(cfg_('ROOT_ID')) : null;
  if (!root) { root = DriveApp.createFolder(SCHEMA.app.title + ' 데이터'); P_.setProperty('ROOT_ID', root.getId()); }
  let ss = cfg_('DB_ID') ? SpreadsheetApp.openById(cfg_('DB_ID')) : null;
  if (!ss) { ss = SpreadsheetApp.create(SCHEMA.app.title + ' DB'); DriveApp.getFileById(ss.getId()).moveTo(root); P_.setProperty('DB_ID', ss.getId()); }
  ss.setSpreadsheetTimeZone(tz_());
  SCHEMA.sheets.forEach(t => {
    const sh = ss.getSheetByName(t.name) || ss.insertSheet(t.name);
    const w = sh.getLastColumn(); const have = w ? sh.getRange(1, 1, 1, w).getValues()[0].map(String) : [];
    const want = t.columns.map(c => c.h).concat(['ID']);
    const add = want.filter(h => have.indexOf(h) < 0);
    if (add.length) sh.getRange(1, have.length + 1, 1, add.length).setValues([add]);
    sh.setFrozenRows(1); sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  });
  ['Sheet1', '시트1'].forEach(n => { const s = ss.getSheetByName(n); if (s && ss.getSheets().length > 1) ss.deleteSheet(s); });
  careSheets_(ss);
  SCHEMA.folders.forEach(f => child_(root, f.name));
  P_.setProperty('SCHEMA_VER', String(SCHEMA.version || 1));
  const n = members_().length;
  const out = { 시트: ss.getUrl(), 폴더: root.getUrl(), 비밀번호: cfg_('APP_PW') ? '설정됨' : '아직 없음 — 스크립트 속성 APP_PW 를 넣어 주세요',
    회원: n ? n + '명' : `아직 없음 — 시트의 '${def_(SCHEMA.auth.sheet).name}' 탭에 이름·역할을 넣어 주세요`, 주간_백업: backupTrigger_() };
  Logger.log(JSON.stringify(out, null, 1));
  return out;
}

// ───────── 요청 받기 ─────────
// 화면은 로그인 쿠키 없이 POST(JSON, text/plain)로 보낸다. 함수마다 auth_ 로 비밀번호·이름을 확인한다.
const API_ = { memberList, whoami, list, add, update, remove, upsert, listFiles, uploadFile, getImagesSized, getFile, deleteFile, startUpload, uploadChunk, sendRequest, myRequests, reportError };
function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    if (!Object.prototype.hasOwnProperty.call(API_, req.fn)) throw new Error('알 수 없는 요청이에요');
    out = { ok: true, data: API_[req.fn].apply(null, req.args || []) };
  } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: SCHEMA.app.title, ver: SCHEMA.version || 1, backup: cfg_('LAST_BACKUP') })).setMimeType(ContentService.MimeType.JSON);
}
function withLock_(fn) { const l = LockService.getScriptLock(); l.waitLock(30000); try { return fn(); } finally { l.releaseLock(); } }

// ───────── 로그인·역할 ─────────
function db_() { const id = cfg_('DB_ID'); if (!id) throw new Error('아직 처음 설정을 하지 않았어요'); return SpreadsheetApp.openById(id); }
function members_() {
  const A = SCHEMA.auth;
  return read_(A.sheet).filter(m => m[A.name] && (!A.inactive || m[A.status] !== A.inactive));
}
function checkPw_(pw) {
  const real = cfg_('APP_PW');
  if (!real) throw new Error('관리자가 아직 비밀번호를 정하지 않았어요');
  if (String(pw) !== real) throw new Error('비밀번호가 맞지 않아요');
}
function auth_(a) {
  checkPw_(a && a.pw);
  const name = String(a.user || '').trim(); const A = SCHEMA.auth;
  const m = members_().find(x => String(x[A.name]) === name);
  if (!m) throw new Error('회원 명단에 없는 이름이에요');
  const roles = String(m[A.role] || '').split(/[,\s/]+/).filter(Boolean);
  return { name, roles, lead: roles.some(r => (SCHEMA.leads || []).indexOf(r) >= 0) };
}
function memberList(pw) { checkPw_(pw); return members_().map(m => String(m[SCHEMA.auth.name])); }
function whoami(a) { const u = auth_(a); return { name: u.name, roles: u.roles, lead: u.lead, ver: SCHEMA.version || 1 }; }
function hasRole_(u, list) { return u.lead || list === 'all' || (Array.isArray(list) && u.roles.some(r => list.indexOf(r) >= 0)); }

// ───────── 표(시트) — 칸은 순서가 아니라 맨 위 제목으로 찾는다 ─────────
function def_(key) { const t = SCHEMA.sheets.find(s => s.key === key); if (!t) throw new Error('없는 표예요: ' + key); return t; }
function sheet_(t) { const sh = db_().getSheetByName(t.name); if (!sh) throw new Error(`'${t.name}' 시트가 없어요. 처음_설정을 다시 실행해 주세요`); return sh; }
function col_(t, h) { return t.columns.find(c => c.h === h) || { h, type: 'text' }; }
function userCol_(t) { const c = t.columns.find(c => c.type === 'user'); return c ? c.h : ''; }
function fmt_(v, type) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), type === 'time' ? 'HH:mm' : type === 'datetime' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : v;
}
function head_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); }
function read_(key) {
  const t = def_(key), sh = sheet_(t), n = sh.getLastRow();
  if (n < 2) return [];
  const v = sh.getRange(1, 1, n, sh.getLastColumn()).getValues(), H = v[0].map(String);
  return v.slice(1).map(r => { const o = {}; H.forEach((h, j) => { if (h) o[h] = fmt_(r[j], col_(t, h).type); }); return o; })
    .filter(o => H.some(h => h && h !== 'ID' && o[h] !== ''));
}
function rowIndex_(sh, id) {
  const H = head_(sh), c = H.indexOf('ID') + 1; if (!c || !id) return 0;
  const ids = sh.getLastRow() < 2 ? [] : sh.getRange(2, c, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}
function clean_(t, obj, u, isNew) {
  const o = {};
  t.columns.forEach(c => {
    let v = obj[c.h];
    if (c.type === 'user') { if (isNew || !u.lead) v = u.name; else if (v === undefined) return; }
    else if (c.type === 'datetime' && c.auto) { if (!isNew) return; v = now_(); }
    else if (v === undefined) { if (!isNew) return; v = ''; }
    v = typeof v === 'string' ? v.trim() : v;
    if (c.req && (v === '' || v === null)) throw new Error(`'${c.h}'을(를) 채워 주세요`);
    if (v !== '' && (c.type === 'number' || c.type === 'money')) { v = Number(String(v).replace(/[,원\s]/g, '')); if (!isFinite(v)) throw new Error(`'${c.h}'은(는) 숫자로 써 주세요`); }
    if (v !== '' && c.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`'${c.h}'은(는) 날짜로 골라 주세요`);
    if (v !== '' && c.type === 'select' && (c.options || []).indexOf(v) < 0) throw new Error(`'${c.h}'은(는) 보기 중에서 골라 주세요`);
    if (v !== '' && c.type === 'date') v = "'" + v;   // 시트가 날짜를 다른 시간대로 바꾸지 않게 글자로 저장
    if (v !== '' && c.type === 'time') v = "'" + v;
    o[c.h] = v;
  });
  return o;
}
function canWrite_(u, t, row) {
  if (t.system) return false;
  if (u.lead) return true;
  const w = t.write || 'all';
  if (w === 'own') { const uc = userCol_(t); return !row || !uc || String(row[uc]) === u.name; }
  return hasRole_(u, w);
}
function canRead_(u, t) { return !t.system && (!t.read || hasRole_(u, t.read)); }

function list(a, key) { const u = auth_(a), t = def_(key); if (!canRead_(u, t)) throw new Error('볼 수 있는 권한이 없어요'); return read_(key); }
function add(a, key, obj) {
  const u = auth_(a), t = def_(key);
  if (!canWrite_(u, t, null)) throw new Error('쓸 수 있는 권한이 없어요');
  return withLock_(() => {
    const sh = sheet_(t), H = head_(sh), o = clean_(t, obj || {}, u, true);
    o.ID = Utilities.getUuid().slice(0, 8);
    H.forEach(h => { if (h && !(h in o) && h !== 'ID') o[h] = ''; });
    const miss = Object.keys(o).filter(h => H.indexOf(h) < 0);
    if (miss.length) throw new Error(`시트에 칸이 없어요: ${miss.join(', ')} — 처음_설정을 다시 실행해 주세요`);
    sh.appendRow(H.map(h => h in o ? o[h] : ''));
    log_(u, '추가', `${t.name} ${o.ID}`);
    return read_(key).find(r => r.ID === o.ID);
  });
}
function update(a, key, id, obj) {
  const u = auth_(a), t = def_(key);
  return withLock_(() => {
    const sh = sheet_(t), r = rowIndex_(sh, id); if (!r) throw new Error('이미 지워졌거나 없는 줄이에요');
    const H = head_(sh), cur = {}; sh.getRange(r, 1, 1, H.length).getValues()[0].forEach((v, j) => cur[H[j]] = fmt_(v, col_(t, H[j]).type));
    if (!canWrite_(u, t, cur)) throw new Error('고칠 수 있는 권한이 없어요');
    const o = clean_(t, obj || {}, u, false);
    Object.keys(o).forEach(h => { const c = H.indexOf(h) + 1; if (c) sh.getRange(r, c).setValue(o[h]); });
    log_(u, '고침', `${t.name} ${id}`);
    return read_(key).find(x => x.ID === id);
  });
}
function remove(a, key, id) {
  const u = auth_(a), t = def_(key);
  return withLock_(() => {
    const sh = sheet_(t), r = rowIndex_(sh, id); if (!r) return true;
    const H = head_(sh), cur = {}; sh.getRange(r, 1, 1, H.length).getValues()[0].forEach((v, j) => cur[H[j]] = fmt_(v, col_(t, H[j]).type));
    if (!canWrite_(u, t, cur)) throw new Error('지울 수 있는 권한이 없어요');
    sh.deleteRow(r); log_(u, '지움', `${t.name} ${id}`);
    return true;
  });
}
/** 같은 칸 값(match)을 가진 줄이 있으면 고치고, 없으면 새로 쓴다. 예: 출석 응답 */
function upsert(a, key, match, obj) {
  const u = auth_(a), t = def_(key), uc = userCol_(t);
  const m = Object.assign({}, match || {}); if (uc && (!u.lead || !(uc in m))) m[uc] = u.name;   // 대표도 이름을 안 주면 자기 줄
  const hit = read_(key).find(r => Object.keys(m).every(h => String(r[h]) === String(m[h])));
  return hit ? update(a, key, hit.ID, obj) : add(a, key, Object.assign({}, m, obj));
}
function log_(u, kind, text) {
  const t = SCHEMA.sheets.find(s => s.key === 'log'); if (!t) return;
  try { const sh = sheet_(t), H = head_(sh), o = { 시간: now_(), 이름: u.name, 일: kind, 내용: text, ID: '' }; sh.appendRow(H.map(h => h in o ? o[h] : '')); } catch (e) {}
}

// ───────── 파일 (드라이브) ─────────
function child_(parent, name) {
  const it = parent.getFoldersByName(name);
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) return f; }
  return parent.createFolder(name);
}
function fdef_(key) { const f = SCHEMA.folders.find(x => x.key === key); if (!f) throw new Error('없는 폴더예요: ' + key); return f; }
function folder_(f, dateStr) {
  const base = child_(DriveApp.getFolderById(cfg_('ROOT_ID')), f.name);
  if (!f.byDate) return base;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) throw new Error('날짜를 골라 주세요');
  return child_(child_(base, dateStr.slice(0, 7)), dateStr);
}
/** 앱 폴더 안의 파일인지 확인 — 다른 드라이브 파일을 ID 로 꺼내 가지 못하게 */
function inRoot_(file) {
  const root = cfg_('ROOT_ID'); let ps = file.getParents(), depth = 0;
  while (ps.hasNext() && depth < 6) { const p = ps.next(); if (p.getId() === root) return true; ps = p.getParents(); depth++; }
  return false;
}
function fileById_(id) {
  let x; try { x = DriveApp.getFileById(id); } catch (e) { throw new Error('파일을 찾지 못했어요'); }
  if (x.isTrashed() || !inRoot_(x) || /google-apps\.(spreadsheet|script)/.test(x.getMimeType())) throw new Error('파일을 찾지 못했어요');   // DB·백업 시트는 꺼내 갈 수 없게
  return x;
}
function canFolder_(u, f, who) { return u.lead || hasRole_(u, f.write || 'all') || (who && who === u.name); }
function fileInfo_(x, date) { return { id: x.getId(), name: x.getName(), date: date || '', size: x.getSize(), mime: x.getMimeType(), by: x.getDescription() || '', time: Utilities.formatDate(x.getDateCreated(), tz_(), 'yyyy-MM-dd HH:mm') }; }
function listFiles(a, key, dateStr) {
  auth_(a); const f = fdef_(key), C = CacheService.getScriptCache(), ck = 'lf_' + key + '_' + (dateStr || '');
  const hit = C.get(ck); if (hit) return JSON.parse(hit);
  const out = [], base = child_(DriveApp.getFolderById(cfg_('ROOT_ID')), f.name);
  const take = (fo, d) => { const it = fo.getFiles(); while (it.hasNext()) { const x = it.next(); if (!x.isTrashed()) out.push(fileInfo_(x, d)); } };
  if (!f.byDate) take(base, '');
  else if (dateStr) take(folder_(f, dateStr), dateStr);
  else { const ms = base.getFolders(); while (ms.hasNext()) { const m = ms.next(); const ds = m.getFolders(); while (ds.hasNext()) { const d = ds.next(); take(d, d.getName()); } } }
  out.sort((p, q) => (q.date + q.time) < (p.date + p.time) ? -1 : 1);
  try { C.put(ck, JSON.stringify(out), 60); } catch (e) {}
  return out;
}
function dropListCache_(key, dateStr) { const C = CacheService.getScriptCache(); C.removeAll(['lf_' + key + '_', 'lf_' + key + '_' + (dateStr || '')]); }
function uniqueName_(folder, name) { let base = name, k = 2; while (folder.getFilesByName(name).hasNext()) name = base.replace(/(\.[^.]+)?$/, '_' + (k++) + '$1'); return name; }
/** 작은 파일(사진 등, 화면에서 1600px 로 줄여 보냄) 한 개 저장 */
function uploadFile(a, key, dateStr, f) {
  const u = auth_(a), fd = fdef_(key);
  if (!canFolder_(u, fd)) throw new Error('이 폴더에 올릴 권한이 없어요');
  const folder = folder_(fd, dateStr);
  const name = uniqueName_(folder, String(f.name || 'file').replace(/[\\/:*?"<>|]/g, '_'));
  const x = folder.createFile(Utilities.newBlob(Utilities.base64Decode(f.data), f.mime || 'application/octet-stream', name));
  x.setDescription(u.name); dropListCache_(key, dateStr); log_(u, '올림', `${fd.name} ${name}`);
  return fileInfo_(x, fd.byDate ? dateStr : '');
}
/** 큰 파일(녹음·문서): 드라이브에 바로 나눠 올리기. 시작 → 조각(uploadChunk) 반복 */
function startUpload(a, key, dateStr, name, mime, size) {
  const u = auth_(a), fd = fdef_(key);
  if (!canFolder_(u, fd)) throw new Error('이 폴더에 올릴 권한이 없어요');
  const folder = folder_(fd, dateStr), fname = uniqueName_(folder, name);
  const r = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name', {
    method: 'post', contentType: 'application/json; charset=UTF-8', muteHttpExceptions: true,
    payload: JSON.stringify({ name: fname, parents: [folder.getId()], description: u.name }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': mime || 'application/octet-stream', 'X-Upload-Content-Length': String(size) } });
  if (r.getResponseCode() >= 300) throw new Error('올리기를 시작하지 못했어요: ' + r.getContentText().slice(0, 120));
  const k = Utilities.getUuid(), h = r.getHeaders();
  CacheService.getScriptCache().put('up_' + k, JSON.stringify({ url: h.Location || h.location, size, name: fname, key, date: dateStr, user: u.name }), 21600);
  return { key: k, name: fname };
}
function uploadChunk(a, k, offset, b64) {
  const u = auth_(a), info = JSON.parse(CacheService.getScriptCache().get('up_' + k) || 'null');
  if (!info) throw new Error('올리기 시간이 지났어요. 다시 올려 주세요');
  const bytes = Utilities.base64Decode(b64), end = offset + bytes.length - 1;
  const r = UrlFetchApp.fetch(info.url, { method: 'put', payload: bytes, contentType: 'application/octet-stream', muteHttpExceptions: true, headers: { 'Content-Range': `bytes ${offset}-${end}/${info.size}` } });
  const code = r.getResponseCode();
  if (code === 308) return { done: false };
  if (code === 200 || code === 201) { dropListCache_(info.key, info.date); log_(u, '올림', info.name); let id = ''; try { id = JSON.parse(r.getContentText()).id; } catch (e) {} return { done: true, id, name: info.name }; }
  throw new Error('올리기 실패 (' + code + ')');
}
function deleteFile(a, key, id) {
  const u = auth_(a), fd = fdef_(key), x = fileById_(id);
  if (!canFolder_(u, fd, x.getDescription())) throw new Error('지울 수 있는 권한이 없어요');
  x.setTrashed(true); dropListCache_(key, ''); log_(u, '파일 지움', x.getName());
  return true;
}
/** 원본 파일(크게 키울 때만). 10MB 넘으면 거절 */
function getFile(a, id) {
  auth_(a); const x = fileById_(id);
  if (x.getSize() > 10 * 1048576) throw new Error('파일이 너무 커서 화면에 띄울 수 없어요');
  const b = x.getBlob(); return 'data:' + (b.getContentType() || 'application/octet-stream') + ';base64,' + Utilities.base64Encode(b.getBytes());
}
/** 화면용 작은 사진 여러 장을 한 번에(최대 6장). 드라이브가 줄여 둔 그림을 받아 6시간 보관. 못 받으면 '' → 화면이 getFile 로 */
function getImagesSized(a, ids, px) {
  auth_(a);
  px = Math.max(200, Math.min(1600, Number(px) || 1000));
  ids = (ids || []).slice(0, 6);
  const C = CacheService.getScriptCache(), H = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  const out = ids.map(id => { try { fileById_(id); return C.get('ts' + px + '_' + id) || null; } catch (e) { return ''; } });
  const need = ids.map((id, k) => out[k] === null ? k : -1).filter(k => k >= 0);
  if (!need.length) return out;
  try {
    const metas = UrlFetchApp.fetchAll(need.map(k => ({ url: `https://www.googleapis.com/drive/v3/files/${ids[k]}?fields=thumbnailLink`, headers: H, muteHttpExceptions: true })));
    const reqs = [], who = [];
    metas.forEach((r, j) => { let link = ''; try { link = String(JSON.parse(r.getContentText()).thumbnailLink || '').replace(/=s\d+$/, '=s' + px); } catch (e) {} if (link) { reqs.push({ url: link, headers: H, muteHttpExceptions: true }); who.push(need[j]); } });
    (reqs.length ? UrlFetchApp.fetchAll(reqs) : []).forEach((r, j) => {
      if (r.getResponseCode() !== 200) return;
      const d = 'data:' + (r.getHeaders()['Content-Type'] || 'image/jpeg') + ';base64,' + Utilities.base64Encode(r.getContent());
      out[who[j]] = d; if (d.length < 95000) try { C.put('ts' + px + '_' + ids[who[j]], d, 21600); } catch (e) {}
    });
  } catch (e) {}
  return out.map(v => v || '');
}

// ───────── 돌봄 부품: 고쳐 주세요 · 오류 기록 · 주간 백업 ─────────
// '요청'·'오류' 시트는 틀이 스스로 만든다 (schema.json 에 쓰지 않는다). 처음_설정을 다시 실행해도 있는 줄은 그대로
const CARE_ = {
  req: { name: '요청', cols: ['시간', '이름', '화면', '내용', '상태', '답'] },
  err: { name: '오류', cols: ['시간', '이름', '화면', '내용', '기기', '횟수'] }
};
const REQ_STATES_ = ['새 요청', '반영함', '보류'];
const BACKUP_DIR_ = '백업';
function careSheets_(ss) {
  Object.keys(CARE_).forEach(k => {
    const c = CARE_[k], sh = ss.getSheetByName(c.name) || ss.insertSheet(c.name);
    const w = sh.getLastColumn(), have = w ? sh.getRange(1, 1, 1, w).getValues()[0].map(String) : [];
    const add = c.cols.concat(['ID']).filter(h => have.indexOf(h) < 0);
    if (add.length) sh.getRange(1, have.length + 1, 1, add.length).setValues([add]);
    sh.setFrozenRows(1); sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
    if (k === 'req') {   // 상태 칸은 고르기로 — 대표가 시트에서 '반영함'으로 바꾸고 '답'을 쓰면 요청한 사람 화면에 보인다
      const col = head_(sh).indexOf('상태') + 1;
      sh.getRange(2, col, 999, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(REQ_STATES_, true).setAllowInvalid(false).build());
    }
  });
}
function careSh_(k) { const sh = db_().getSheetByName(CARE_[k].name); if (!sh) throw new Error(`'${CARE_[k].name}' 시트가 없어요. 처음_설정을 다시 실행해 주세요`); return sh; }
function careAppend_(k, o) { const sh = careSh_(k), H = head_(sh); o.ID = Utilities.getUuid().slice(0, 8); sh.appendRow(H.map(h => h in o ? o[h] : '')); return o.ID; }
function careRead_(k) {
  const sh = careSh_(k), n = sh.getLastRow(); if (n < 2) return [];
  const v = sh.getRange(1, 1, n, sh.getLastColumn()).getValues(), H = v[0].map(String);
  return v.slice(1).map(r => { const o = {}; H.forEach((h, j) => { if (h) o[h] = fmt_(r[j], 'datetime'); }); return o; });
}
/** 한 시간에 보낼 수 있는 횟수 제한 */
function rate_(key, max) {
  const C = CacheService.getScriptCache(), n = Number(C.get(key) || 0);
  if (n >= max) return false; C.put(key, String(n + 1), 3600); return true;
}
/** 화면의 '고쳐 주세요' → 요청 시트에 한 줄 */
function sendRequest(a, text, view) {
  const u = auth_(a); text = String(text || '').trim();
  if (!text) throw new Error('무엇을 고치면 좋을지 써 주세요');
  if (!rate_('rq_' + u.name, 10)) throw new Error('요청을 많이 보냈어요. 한 시간 뒤에 다시 보내 주세요');
  return withLock_(() => {
    careAppend_('req', { 시간: now_(), 이름: u.name, 화면: String(view || '').slice(0, 40), 내용: text.slice(0, 1000), 상태: REQ_STATES_[0], 답: '' });
    log_(u, '요청', text.slice(0, 40));
    return true;
  });
}
/** 내가 보낸 요청(대표는 전체) 최근 10개 — 상태와 답을 화면에 보여 준다 */
function myRequests(a) {
  const u = auth_(a);
  return careRead_('req').filter(r => r.내용 && (u.lead || r.이름 === u.name)).slice(-10).reverse()
    .map(r => ({ 시간: r.시간, 이름: r.이름, 화면: r.화면, 내용: r.내용, 상태: r.상태 || REQ_STATES_[0], 답: r.답 }));
}
/** 화면에서 난 오류를 오류 시트에. 같은 내용은 6시간 안에 횟수만 올린다. 비밀번호를 모르면 받지 않는다 */
function reportError(a, msg, view, agent) {
  let name;
  try { name = auth_(a).name; } catch (e) { try { checkPw_(a && a.pw); name = '(이름 확인 전)'; } catch (e2) { return false; } }
  msg = String(msg || '').slice(0, 500); view = String(view || '').slice(0, 40);
  if (!msg || !rate_('er_all', 60)) return false;
  const C = CacheService.getScriptCache();
  const dk = 'ed_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, msg + '|' + view)).slice(0, 22);
  return withLock_(() => {
    const id = C.get(dk), sh = careSh_('err'), r = id ? rowIndex_(sh, id) : 0;
    if (r) { const cell = sh.getRange(r, head_(sh).indexOf('횟수') + 1); cell.setValue(Number(cell.getValue() || 1) + 1); return true; }
    C.put(dk, careAppend_('err', { 시간: now_(), 이름: name, 화면: view, 내용: msg, 기기: String(agent || '').slice(0, 120), 횟수: 1 }), 21600);
    return true;
  });
}

/** ▶ 지금 바로 백업하고 싶을 때 편집기에서 실행. 평소에는 매주 월요일 새벽 3시에 저절로 돈다 */
function 지금_백업() { return backup(); }
function backup() {
  const ss = db_(), root = DriveApp.getFolderById(cfg_('ROOT_ID')), bf = child_(root, BACKUP_DIR_);
  const prefix = SCHEMA.app.title + ' DB 백업 ';
  const name = prefix + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HHmm');
  DriveApp.getFileById(ss.getId()).makeCopy(name, bf);
  const all = [], it = bf.getFiles();
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed() && f.getName().indexOf(prefix) === 0) all.push(f); }
  all.sort((p, q) => q.getDateCreated() - p.getDateCreated());
  const keep = Number(SCHEMA.backupKeep || 4);
  all.slice(keep).forEach(f => f.setTrashed(true));   // 오래된 것은 휴지통으로 (30일 안에는 되살릴 수 있음)
  P_.setProperty('LAST_BACKUP', now_());
  const out = { 백업: name, 폴더: bf.getUrl(), 보관: Math.min(all.length, keep) + '개' };
  Logger.log(JSON.stringify(out, null, 1));
  return out;
}
function backupTrigger_() {
  const keep = Number(SCHEMA.backupKeep || 4);
  if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'backup')) return `켜져 있음 (매주 월요일 새벽 3시, ${keep}주치 보관)`;
  ScriptApp.newTrigger('backup').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create();
  return `켰음 (매주 월요일 새벽 3시, ${keep}주치 보관)`;
}
