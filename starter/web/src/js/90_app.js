// 이 앱에만 있는 기능은 이 파일(또는 91_, 92_ … 새 파일)에 쓴다. 틀 파일(00~06)은 되도록 고치지 않는다
// 예) 새 화면 종류: VIEWS.myview = { show(sec, tab, soft) { sec.innerHTML = '...'; } }  → schema.tabs 에 { "view": "myview" }
// 예) 시작할 때 할 일: APP.onStart.push(() => { ... })
const APP = { onStart: [] };
