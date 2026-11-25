// 모의 서버: 진짜 서버(gas/Code.js)와 같은 이름·같은 규칙으로 대답한다. 데이터는 schema.json 의 sample. 비밀번호 test
// window.MOCK_FAIL = '함수이름' 이면 그 요청을 실패시킨다(실패 화면 검사용)
(function () {
  const S = __MOCK_SCHEMA__, PW = 'test', SM = S.sample || {};
  const D = n => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
  const rel = (v, type) => (typeof v === 'string' && /^[+-]\d+$/.test(v)) ? (type === 'datetime' ? D(+v) + ' 10:00' : D(+v)) : v;
  const now = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  const T = {};
  S.sheets.forEach(t => { T[t.key] = (SM[t.key] || []).map((r, i) => { const o = {}; t.columns.forEach(c => o[c.h] = rel(r[c.h] == null ? '' : r[c.h], c.type)); o.ID = t.key + i; return o; }); });
  const DATA = {}, F = {};
  const pic = (i, label) => { const h = (i * 47 + 160) % 360;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="hsl(${h},30%,70%)"/><circle cx="${300 + i * 90 % 600}" cy="380" r="180" fill="hsl(${h},35%,55%)"/><rect y="620" width="1200" height="280" fill="hsl(${h},25%,45%)"/><text x="60" y="120" font-size="64" font-family="sans-serif" fill="#fff">${label}</text></svg>`); };
  S.folders.forEach(f => { const n = (SM.files || {})[f.key] || 0;
    F[f.key] = Array.from({ length: n }, (_, i) => { const id = f.key + '_' + i; DATA[id] = pic(i, (f.label || f.name) + ' ' + (i + 1));
      return { id, name: `${f.key}_${i + 1}.jpg`, date: f.byDate ? D(i < 3 ? -4 : -11) : '', size: 150000, mime: 'image/svg+xml', by: '', time: '' }; }); });
  const A = S.auth;
  const auth = a => {
    if (!a || a.pw !== PW) throw new Error('비밀번호가 맞지 않아요');
    const m = T[A.sheet].find(r => r[A.name] === a.user && (!A.inactive || r[A.status] !== A.inactive));
    if (!m) throw new Error('회원 명단에 없는 이름이에요');
    const roles = String(m[A.role] || '').split(/[,\s/]+/).filter(Boolean);
    return { name: a.user, roles, lead: roles.some(r => (S.leads || []).includes(r)) };
  };
  const def = k => { const t = S.sheets.find(s => s.key === k); if (!t) throw new Error('없는 표예요: ' + k); return t; };
  const fdef = k => { const f = S.folders.find(s => s.key === k); if (!f) throw new Error('없는 폴더예요: ' + k); return f; };
  const has = (u, l) => u.lead || l === 'all' || (Array.isArray(l) && u.roles.some(r => l.includes(r)));
  const ucol = t => (t.columns.find(c => c.type === 'user') || {}).h;
  const canW = (u, t, row) => { if (t.system) return false; if (u.lead) return true; const w = t.write || 'all'; if (w === 'own') return !row || !ucol(t) || row[ucol(t)] === u.name; return has(u, w); };
  const clean = (t, obj, u, isNew) => { const o = {};
    t.columns.forEach(c => { let v = obj[c.h];
      if (c.type === 'user') { if (isNew || !u.lead) v = u.name; else if (v === undefined) return; }
      else if (c.type === 'datetime' && c.auto) { if (!isNew) return; v = now(); }
      else if (v === undefined) { if (!isNew) return; v = ''; }
      v = typeof v === 'string' ? v.trim() : v;
      if (c.req && (v === '' || v == null)) throw new Error(`'${c.h}'을(를) 채워 주세요`);
      if (v !== '' && (c.type === 'number' || c.type === 'money')) { v = Number(String(v).replace(/[,원\s]/g, '')); if (!isFinite(v)) throw new Error(`'${c.h}'은(는) 숫자로 써 주세요`); }
      if (v !== '' && c.type === 'select' && !(c.options || []).includes(v)) throw new Error(`'${c.h}'은(는) 보기 중에서 골라 주세요`);
      o[c.h] = v; });
    return o; };
  let seq = 100;
  const CARE = window.MOCK_CARE = { req: [], err: [] };   // 검사에서 들여다보는 곳
  const API = {
    memberList(pw) { if (pw !== PW) throw new Error('비밀번호가 맞지 않아요'); return T[A.sheet].filter(r => !A.inactive || r[A.status] !== A.inactive).map(r => r[A.name]); },
    whoami(a) { const u = auth(a); return { name: u.name, roles: u.roles, lead: u.lead, ver: S.version || 1 }; },
    list(a, k) { const u = auth(a), t = def(k); if (t.system || (t.read && !has(u, t.read))) throw new Error('볼 수 있는 권한이 없어요'); return T[k]; },
    add(a, k, obj) { const u = auth(a), t = def(k); if (!canW(u, t, null)) throw new Error('쓸 수 있는 권한이 없어요'); const o = clean(t, obj || {}, u, true); o.ID = 'n' + (seq++); T[k].push(o); return o; },
    update(a, k, id, obj) { const u = auth(a), t = def(k), r = T[k].find(x => x.ID === id); if (!r) throw new Error('이미 지워졌거나 없는 줄이에요'); if (!canW(u, t, r)) throw new Error('고칠 수 있는 권한이 없어요'); Object.assign(r, clean(t, obj || {}, u, false)); return r; },
    remove(a, k, id) { const u = auth(a), t = def(k), r = T[k].find(x => x.ID === id); if (!r) return true; if (!canW(u, t, r)) throw new Error('지울 수 있는 권한이 없어요'); T[k] = T[k].filter(x => x !== r); return true; },
    upsert(a, k, match, obj) { const u = auth(a), t = def(k), m = Object.assign({}, match); if (ucol(t) && (!u.lead || !(ucol(t) in m))) m[ucol(t)] = u.name;
      const hit = T[k].find(r => Object.keys(m).every(h => String(r[h]) === String(m[h]))); return hit ? API.update(a, k, hit.ID, obj) : API.add(a, k, Object.assign({}, m, obj)); },
    listFiles(a, k, d) { auth(a); fdef(k); return F[k].filter(f => !d || f.date === d).slice().sort((p, q) => (q.date + q.time) < (p.date + p.time) ? -1 : 1); },
    uploadFile(a, k, d, f) { const u = auth(a), fd = fdef(k); if (!has(u, fd.write || 'all')) throw new Error('이 폴더에 올릴 권한이 없어요'); if (fd.byDate && !/^\d{4}-\d{2}-\d{2}$/.test(d || '')) throw new Error('날짜를 골라 주세요');
      const id = 'up' + (seq++); DATA[id] = 'data:' + f.mime + ';base64,' + f.data; const x = { id, name: f.name, date: fd.byDate ? d : '', size: f.data.length * 0.75, mime: f.mime, by: u.name, time: now() }; F[k].push(x); return x; },
    startUpload(a, k, d, name, mime, size) { auth(a); return { key: 'k' + (seq++), name }; },
    uploadChunk(a, key, off, b) { auth(a); return { done: true, id: 'up' + (seq++) }; },
    getImagesSized(a, ids) { auth(a); return ids.slice(0, 6).map(id => DATA[id] || ''); },
    getFile(a, id) { auth(a); if (!DATA[id]) throw new Error('파일을 찾지 못했어요'); return DATA[id]; },
    sendRequest(a, text, view) { const u = auth(a); text = String(text || '').trim(); if (!text) throw new Error('무엇을 고치면 좋을지 써 주세요');
      CARE.req.push({ 시간: now(), 이름: u.name, 화면: view, 내용: text.slice(0, 1000), 상태: '새 요청', 답: '' }); return true; },
    myRequests(a) { const u = auth(a); return CARE.req.filter(r => u.lead || r.이름 === u.name).slice(-10).reverse(); },
    reportError(a, msg, view, agent) { let name; try { name = auth(a).name; } catch (e) { if (!a || a.pw !== PW) return false; name = '(이름 확인 전)'; }
      CARE.err.push({ 시간: now(), 이름: name, 화면: view, 내용: String(msg).slice(0, 500), 기기: agent, 횟수: 1 }); return true; },
    deleteFile(a, k, id) { const u = auth(a); const f = F[k].find(x => x.id === id); if (f && !(u.lead || f.by === u.name || has(u, fdef(k).write || 'all'))) throw new Error('지울 수 있는 권한이 없어요'); F[k] = F[k].filter(x => x.id !== id); return true; }
  };
  window.MOCK = (fn, args) => new Promise((res, rej) => setTimeout(() => {
    try { if (window.MOCK_FAIL === fn) throw new Error('서버에 연결하지 못했어요 (모의 실패)'); if (!API[fn]) throw new Error('알 수 없는 요청이에요'); res(JSON.parse(JSON.stringify(API[fn].apply(null, args)))); }
    catch (e) { rej(e); } }, 120 + Math.random() * 160));
})();
