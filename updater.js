/* 🔄 새 버전 확인 — 모든 앱 공통(앱 정보 칸 맨 아래 버튼).
 * 서버의 sw.js에 적힌 버전(CACHE = '이름-v1.2.3')과 지금 버전을 비교해, 새 버전이면 바로 업데이트한다.
 * 업데이트는 이 앱의 화면 파일 캐시만 지우고 다시 연다(입력한 기록·설정은 그대로). */
(function () {
  const num = (v) => String(v || '').split('.').map((x) => parseInt(x, 10) || 0);
  const cmp = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function serverVersion() {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 10000) : null;
    try {
      const r = await fetch('sw.js?upd=' + Date.now(), { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error('서버 응답 ' + r.status);
      const m = (await r.text()).match(/CACHE\s*=\s*['"]([^'"]*?)v?(\d+(?:\.\d+)+)['"]/);
      if (!m) throw new Error('서버 버전을 읽지 못했습니다');
      return { ver: m[2], prefix: m[1] };
    } finally { if (t) clearTimeout(t); }
  }

  async function doUpdate(prefix, box) {
    box.innerHTML = '⏳ 업데이트 중… 잠시 뒤 앱이 다시 열립니다';
    try {
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg) {
        await reg.update();
        const nw = reg.installing || reg.waiting;
        if (nw) { // 새 화면 파일이 준비될 때까지 최대 5초
          await Promise.race([new Promise((res) => { nw.addEventListener('statechange', () => { if (nw.state === 'activated') res(); }); if (nw.state === 'activated') res(); }), wait(5000)]);
        }
      }
    } catch (e) { /* 서비스 워커가 없어도 아래 캐시 정리·새로고침으로 충분 */ }
    try { if (window.caches && prefix) { const ks = await caches.keys(); await Promise.all(ks.filter((k) => k.indexOf(prefix) === 0).map((k) => caches.delete(k))); } } catch (e) { /* 무시 */ }
    location.reload();
  }

  async function check(btn) {
    const cur = btn.getAttribute('data-upd');
    let box = btn.parentNode.querySelector('.upd-out');
    if (!box) { box = document.createElement('div'); box.className = 'upd-out'; box.style.cssText = 'margin-top:8px;font-size:14px;line-height:1.5'; btn.insertAdjacentElement('afterend', box); }
    btn.disabled = true; box.textContent = '확인 중…';
    try {
      const s = await serverVersion();
      if (cmp(s.ver, cur) <= 0) { box.innerHTML = '✅ 최신 버전입니다 (v' + cur + ')'; return; }
      box.innerHTML = '🆕 새 버전 <b>v' + s.ver + '</b>이 있습니다 (지금 v' + cur + ')<br><button type="button" class="btn primary block" style="margin-top:6px">⬆️ 지금 업데이트</button><div class="muted" style="font-size:12px;margin-top:4px">입력한 기록·설정은 그대로 남습니다.</div>';
      box.querySelector('button').onclick = () => doUpdate(s.prefix, box);
    } catch (e) {
      box.textContent = '⚠️ 확인하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요 (' + (e && e.name === 'AbortError' ? '연결이 느림' : (e && e.message) || e) + ')';
    } finally { btn.disabled = false; }
  }

  // 버튼은 각 앱의 '앱 정보' 칸에 <button data-upd="버전">으로 넣는다(화면이 다시 그려져도 동작)
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('[data-upd]');
    if (b) { e.preventDefault(); check(b); }
  });
  window.updButton = (ver) => '<button type="button" class="btn block upd-btn" data-upd="' + String(ver).replace(/[^\d.]/g, '') + '" style="margin-top:10px">🔄 새 버전 확인</button>';
})();
