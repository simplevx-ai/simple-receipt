/* 간이영수증 — 실제 간이영수증 양식(공급받는자용)으로 만들어 문자·카톡·이메일로 보낸다.
 * ONE LIFE AI의 간이영수증 기능을 바탕으로 만든 단독 앱.
 * 모든 데이터는 이 폰(브라우저)의 IndexedDB('receipt')에만 저장된다. 서버로 보내지 않는다.
 */
'use strict';

const APP_VERSION = '1.1.0';
const METHODS = ['계좌이체', '현금', '카드', '기타'];
const BACKUP_STORES = ['receipts', 'customers', 'items', 'settings'];

/* ───────── 저장소(IndexedDB) ───────── */
const DB = (() => {
  let dbp = null;
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('receipt', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        const has = (n) => d.objectStoreNames.contains(n);
        if (!has('receipts')) d.createObjectStore('receipts', { keyPath: 'id' });
        if (!has('customers')) d.createObjectStore('customers', { keyPath: 'id' });
        if (!has('items')) d.createObjectStore('items', { keyPath: 'id' });
        if (!has('settings')) d.createObjectStore('settings', { keyPath: 'key' });
      };
      r.onblocked = () => alert('앱이 다른 탭에서도 열려 있습니다. 다른 탭을 닫고 다시 열어 주세요.');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function run(store, mode, fn) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      let out;
      const req = fn(t.objectStore(store));
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('저장 취소됨'));
    });
  }
  return {
    all: (s) => run(s, 'readonly', (st) => st.getAll()),
    get: (s, id) => run(s, 'readonly', (st) => st.get(id)),
    put: (s, v) => run(s, 'readwrite', (st) => st.put(v)),
    del: (s, id) => run(s, 'readwrite', (st) => st.delete(id)),
    clear: (s) => run(s, 'readwrite', (st) => st.clear()),
  };
})();
async function getSetting(key, def) { const r = await DB.get('settings', key); return r ? r.value : def; }
const setSetting = (key, value) => DB.put('settings', { key, value });
async function bizInfo() { return { name: '', phone: '', ...(await getSetting('biz', {})) }; }

/* ───────── 도우미 ───────── */
const $ = (s, el = document) => el.querySelector(s);
const view = () => $('#view');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = (n) => (Number(n) || 0).toLocaleString('ko-KR') + '원';
const digits = (s) => String(s || '').replace(/\D/g, '');
const pad = (n) => String(n).padStart(2, '0');
function nowISO(d = new Date()) {
  const o = -d.getTimezoneOffset(), a = Math.abs(o);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${o >= 0 ? '+' : '-'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
const todayStr = () => nowISO().slice(0, 10);
const monthStr = () => todayStr().slice(0, 7);
function fmtDate(s) {
  if (!s) return '';
  const date = s.slice(0, 10), [, m, d] = date.split('-');
  return `${+m}/${+d}(${'일월화수목금토'[new Date(date + 'T00:00').getDay()]})`;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200); }
function setTitle(t, back) { $('#title').textContent = t; $('#backBtn').hidden = !back; }
const opts = (arr, sel) => arr.map((v) => `<option${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// 금액 계산: 품목 합계 − 할인, 부가세 선택
function totals(r) {
  const sub = (r.items || []).reduce((a, l) => a + (+l.qty || 0) * (+l.price || 0), 0);
  const disc = +r.discount || 0, base = Math.max(0, sub - disc), vat = r.vat ? Math.round(base * 0.1) : 0;
  return { sub, trip: 0, disc, vat, total: base + vat };
}
const paidOf = (r) => (r.payments || []).reduce((a, p) => a + (+p.amount || 0), 0);
const stateOf = (r) => { const T = totals(r), p = paidOf(r); return !T.total ? '금액 없음' : p >= T.total ? '완납' : p > 0 ? '일부 받음' : '미수'; };

// 영수증 번호: 연도별 일련번호(2026-0001)
async function nextNo(date) {
  const y = (date || todayStr()).slice(0, 4);
  const seq = await getSetting('seq', {});
  const n = (seq[y] || 0) + 1;
  await setSetting('seq', { ...seq, [y]: n });
  return `${y}-${String(n).padStart(4, '0')}`;
}

/* 양식 그리기(form.js)에 넘길 모양으로 바꾼다 */
async function receiptBlob(r) {
  const T = totals(r), b = await bizInfo();
  const e = { lines: (r.items || []).map((l) => ({ name: l.name, qty: l.qty, unit: l.unit || '', price: l.price })), trip: '', discount: r.discount || '', vat: !!r.vat, note: r.note || '' };
  const last = [...(r.payments || [])].sort((a, b2) => (b2.date || '').localeCompare(a.date || ''))[0];
  const s = pickSeal(b, r.sealId);
  return renderFormReceipt(e, T, { id: r.id, no: r.no, doneAt: r.date }, { name: r.customer?.name || '' }, { ...b, seal: s ? s.img : '' }, paidOf(r), r.note || (last && last.method) || '');
}

// 문자·이메일용 글 영수증
function receiptText(r, b) {
  const T = totals(r), paid = paidOf(r);
  const L = [`[영수증] ${b.name || ''}`.trim(), `No. ${r.no}`, `날짜: ${fmtDate(r.date)}`, `받는 분: ${r.customer?.name ? r.customer.name + ' 님' : '고객님'}`, ''];
  (r.items || []).filter((l) => l.name && (+l.qty || 0) * (+l.price || 0)).forEach((l) => L.push(`- ${l.name} ${l.qty}${l.unit || ''} × ${won(l.price)} = ${won((+l.qty || 0) * (+l.price || 0))}`));
  if (T.disc) L.push(`- 할인 -${won(T.disc)}`);
  if (r.vat) L.push(`- 부가세(10%) ${won(T.vat)}`);
  L.push('', `합계: ${won(T.total)}`, `받은 금액: ${won(paid)}`, paid >= T.total ? '완납되었습니다. 감사합니다.' : `남은 금액: ${won(T.total - paid)}`);
  if (b.bank && paid < T.total) L.push(`입금 계좌: ${b.bank}`);
  if (b.phone) L.push('', `문의: ${b.name ? b.name + ' ' : ''}${b.phone}`);
  return L.join('\n');
}

/* ───────── 라우터 ───────── */
const routes = [
  [/^#?\/?$/, 'list', viewList],
  [/^#\/new$/, 'new', () => viewEdit(null)],
  [/^#\/edit\/([\w-]+)$/, 'list', (m) => viewEdit(m[1])],
  [/^#\/copy\/([\w-]+)$/, 'new', (m) => viewEdit(null, m[1])],
  [/^#\/r\/([\w-]+)$/, 'list', (m) => viewReceipt(m[1])],
  [/^#\/items$/, 'items', viewItems],
  [/^#\/settings$/, 'settings', viewSettings],
];
async function render() {
  const h = (location.hash || '#/').split('?')[0];
  for (const [re, tab, fn] of routes) {
    const m = h.match(re);
    if (m) {
      document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
      try { await fn(m); } catch (e) { console.error(e); view().innerHTML = `<div class="card warnbox">오류: ${esc(e.message)}</div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', render);
$('#backBtn').addEventListener('click', () => (history.length > 1 ? history.back() : (location.hash = '#/')));

/* ───────── 목록 ───────── */
async function viewList() {
  setTitle('간이영수증');
  const [rs, b] = await Promise.all([DB.all('receipts'), bizInfo()]);
  rs.sort((a, c) => (c.date || '').localeCompare(a.date || '') || (c.createdAt || '').localeCompare(a.createdAt || ''));
  let ym = sessionStorage.getItem('listM') || monthStr(), q = '';
  const draw = () => {
    const inM = rs.filter((r) => (r.date || '').startsWith(ym));
    const sum = inM.reduce((a, r) => a + totals(r).total, 0), got = inM.reduce((a, r) => a + Math.min(paidOf(r), totals(r).total), 0);
    const s = q.trim(), sd = digits(s);
    const L = (s ? rs : inM).filter((r) => !s || (r.customer?.name || '').includes(s) || (sd && digits(r.customer?.phone).includes(sd)) || (r.items || []).some((l) => (l.name || '').includes(s)) || (r.no || '').includes(s));
    $('#ls_sum').innerHTML = `<div class="grid2" style="grid-template-columns:repeat(3,1fr)"><div><div class="muted">합계</div><b style="font-size:19px">${won(sum)}</b></div><div><div class="muted">받음</div><b style="font-size:19px">${won(got)}</b></div><div><div class="muted">미수</div><b style="font-size:19px;color:${sum - got ? '#FFD1D1' : '#fff'}">${won(sum - got)}</b></div></div>`;
    $('#ls_list').innerHTML = L.map((r) => {
      const st = stateOf(r), T = totals(r);
      const badge = st === '완납' ? '<span class="badge s-완료">완납</span>' : st === '일부 받음' ? `<span class="badge" style="color:var(--red)">미수 ${won(T.total - paidOf(r))}</span>` : `<span class="badge" style="color:var(--red)">${st}</span>`;
      return `<a class="item" href="#/r/${r.id}"><div class="row spread"><span class="t">${esc(r.customer?.name || '이름 없음')}</span>${badge}</div>
        <div class="row spread muted"><span>${esc(fmtDate(r.date))} · No.${esc(r.no)} · ${esc((r.items || [])[0]?.name || '')}${(r.items || []).length > 1 ? ` 외 ${r.items.length - 1}` : ''}</span><b style="color:var(--ink)">${won(T.total)}</b></div></a>`;
    }).join('') || `<div class="muted">${s ? '찾는 영수증이 없습니다.' : '이 달에 쓴 영수증이 없습니다.'}</div>`;
  };
  view().innerHTML = `
    ${!(b.bizNo && b.name) ? '<a class="card warnbox" href="#/settings" style="display:block;text-decoration:none">처음이세요? ⚙️ 설정에서 사업자등록번호·상호·대표자를 먼저 넣으면 영수증 칸에 들어갑니다 ›</a>' : ''}
    <div class="row" style="margin-bottom:10px"><input type="month" id="ls_m" value="${ym}" style="flex:1"><a class="btn primary" href="#/new">✍️ 새 영수증</a></div>
    <div class="card hero" id="ls_sum"></div>
    <input id="ls_q" placeholder="이름·전화·품목·번호로 찾기 (전체 기간)" style="margin-bottom:8px">
    <div class="card"><div id="ls_list"></div></div>`;
  $('#ls_m').onchange = (e) => { ym = e.target.value || monthStr(); sessionStorage.setItem('listM', ym); draw(); };
  $('#ls_q').oninput = (e) => { q = e.target.value; draw(); };
  draw();
}

/* ───────── 쓰기·고치기 ───────── */
async function viewEdit(id, copyFrom) {
  const [r0, src, custs, items, biz] = await Promise.all([id ? DB.get('receipts', id) : null, copyFrom ? DB.get('receipts', copyFrom) : null, DB.all('customers'), DB.all('items'), bizInfo()]);
  const seals = sealList(biz);
  setTitle(id ? '영수증 고치기' : '새 영수증', true);
  if (id && !r0) { view().innerHTML = '<div class="empty">영수증을 찾을 수 없습니다.</div>'; return; }
  const base = r0 || (src ? { customer: { ...src.customer }, items: src.items.map((l) => ({ ...l })), discount: src.discount, vat: src.vat, note: '' } : {});
  const r = { date: todayStr(), customer: { name: '', phone: '', email: '' }, items: [{ name: '', qty: 1, unit: '', price: '' }], discount: '', vat: false, note: '', payments: [], ...base };
  if (!id) r.date = todayStr();
  items.sort((a, b) => (b.used || 0) - (a.used || 0) || a.name.localeCompare(b.name));
  custs.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
  view().innerHTML = `
    <div class="card"><div class="grid2"><div><label for="e_date">작성일</label><input id="e_date" type="date" value="${esc(r.date)}"></div><div><label>번호</label><input value="${esc(r.no || '저장할 때 자동')}" disabled></div></div>
      <label for="e_name">받는 분(공급받는자)</label><input id="e_name" list="custList" value="${esc(r.customer.name)}" placeholder="이름 또는 상호" autocomplete="off">
      <datalist id="custList">${custs.map((c) => `<option value="${esc(c.name)}">${esc(c.phone || '')}</option>`).join('')}</datalist>
      <div class="grid2"><div><label for="e_phone">전화 (선택)</label><input id="e_phone" type="tel" inputmode="tel" value="${esc(r.customer.phone)}"></div><div><label for="e_email">이메일 (선택)</label><input id="e_email" type="email" inputmode="email" value="${esc(r.customer.email)}"></div></div></div>
    <div class="card"><h2>품목</h2><div id="e_lines"></div>
      <div class="row wrap" style="margin-top:6px"><button class="btn small" id="e_add" type="button">+ 품목</button>
        ${items.length ? `<select id="e_pick" style="width:auto;flex:1"><option value="">자주 쓰는 품목에서 고르기</option>${items.map((it) => `<option value="${it.id}">${esc(it.name)}${it.price !== '' && it.price != null ? ' ' + won(it.price) : ''}</option>`).join('')}</select>` : '<a class="btn small" href="#/items">📦 자주 쓰는 품목 등록</a>'}</div>
      <div class="grid2" style="margin-top:10px"><div><label for="e_disc">할인</label><input id="e_disc" type="number" inputmode="numeric" value="${esc(r.discount)}"></div><div><label class="row" style="margin-top:30px;color:var(--ink);font-size:15px"><input type="checkbox" id="e_vat" ${r.vat ? 'checked' : ''} style="width:22px;min-height:22px;flex:none"> 부가세 10% 더하기</label></div></div>
      <div class="row spread" style="margin-top:10px"><b>합계</b><b id="e_total" style="font-size:22px">0원</b></div></div>
    ${id ? '' : `<div class="card"><h2>받은 금액</h2><div class="grid2"><div><input id="e_paid" type="number" inputmode="numeric" placeholder="합계와 같으면 비워 두기"></div><div><select id="e_method">${opts(METHODS, '계좌이체')}</select></div></div>
      <label class="row" style="margin-top:8px;color:var(--ink);font-size:15px"><input type="checkbox" id="e_unpaid" style="width:22px;min-height:22px;flex:none"> 아직 안 받음 → '청구' 영수증</label></div>`}
    <div class="card"><label for="e_note">비고 (선택, 영수증 비고 칸)</label><input id="e_note" value="${esc(r.note)}" placeholder="비우면 결제수단이 들어갑니다">
      <label for="e_seal">발급자 도장</label><div class="row"><select id="e_seal" style="flex:1">${(() => { const cur = r.sealId || defaultSealId(biz); return seals.map((s) => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${esc(s.name)}</option>`).join('') + `<option value="none"${cur === 'none' ? ' selected' : ''}>도장 없이 (인)</option>`; })()}</select><img id="e_sealimg" alt="" style="width:44px;height:44px"></div>
      ${seals.length ? '' : '<div class="muted" style="font-size:13px;margin-top:4px">⚙️ 설정 → 도장에서 이름으로 도장을 만들 수 있습니다.</div>'}</div>
    <button class="btn primary block" id="e_save" type="button">🧾 저장하고 영수증 보기</button>`;
  const lines = r.items.map((l) => ({ ...l }));
  const readLines = () => view().querySelectorAll('[data-l]').forEach((el) => { const l = lines[+el.dataset.i]; l[el.dataset.l] = ['name', 'unit'].includes(el.dataset.l) ? el.value : (el.value === '' ? '' : +el.value); });
  const calc = () => { readLines(); const T = totals({ items: lines, discount: $('#e_disc').value, vat: $('#e_vat').checked }); $('#e_total').textContent = won(T.total); };
  const drawLines = () => {
    $('#e_lines').innerHTML = lines.map((l, i) => `<div class="card" style="background:var(--bg);margin:6px 0;padding:10px">
      <div class="row"><input data-l="name" data-i="${i}" value="${esc(l.name)}" placeholder="품목" style="flex:1">${lines.length > 1 ? `<button class="btn small danger" data-x="${i}" type="button">✕</button>` : ''}</div>
      <div class="row" style="margin-top:6px"><input data-l="qty" data-i="${i}" type="number" inputmode="decimal" step="any" value="${esc(l.qty)}" style="width:70px" aria-label="수량"><input data-l="unit" data-i="${i}" value="${esc(l.unit || '')}" placeholder="단위" style="width:60px"><span class="muted">×</span><input data-l="price" data-i="${i}" type="number" inputmode="numeric" step="100" value="${esc(l.price)}" placeholder="단가" style="flex:1"></div></div>`).join('');
    view().querySelectorAll('[data-l]').forEach((el) => { el.oninput = calc; });
    view().querySelectorAll('[data-x]').forEach((bt) => { bt.onclick = () => { readLines(); lines.splice(+bt.dataset.x, 1); drawLines(); }; });
    calc();
  };
  $('#e_add').onclick = () => { readLines(); lines.push({ name: '', qty: 1, unit: '', price: '' }); drawLines(); };
  if ($('#e_pick')) $('#e_pick').onchange = (ev) => {
    const it = items.find((x) => x.id === ev.target.value); if (!it) return;
    readLines();
    const empty = lines.findIndex((l) => !l.name && !l.price);
    const nl = { name: it.name, qty: 1, unit: it.unit || '', price: it.price === '' || it.price == null ? '' : +it.price, itemId: it.id };
    if (empty >= 0) lines[empty] = nl; else lines.push(nl);
    ev.target.value = ''; drawLines();
  };
  $('#e_disc').oninput = calc; $('#e_vat').onchange = calc;
  // 받는 분 이름을 고르면 저장된 전화·이메일을 채운다
  $('#e_name').onchange = () => { const c = custs.find((x) => x.name === $('#e_name').value.trim()); if (c) { if (!$('#e_phone').value) $('#e_phone').value = c.phone || ''; if (!$('#e_email').value) $('#e_email').value = c.email || ''; } };
  drawLines();
  const showSeal = () => { const s = seals.find((x) => x.id === $('#e_seal').value); $('#e_sealimg').src = s ? s.img : ''; $('#e_sealimg').style.visibility = s ? 'visible' : 'hidden'; };
  $('#e_seal').onchange = showSeal; showSeal();

  $('#e_save').onclick = async () => {
    readLines();
    const its = lines.filter((l) => l.name && (+l.qty || 0) * (+l.price || 0) > 0).map((l) => ({ name: l.name.trim(), qty: +l.qty, unit: (l.unit || '').trim(), price: +l.price, ...(l.itemId ? { itemId: l.itemId } : {}) }));
    if (!its.length) { toast('품목 이름·수량·단가를 넣어 주세요'); return; }
    const email = $('#e_email').value.trim();
    if (email && !isEmail(email)) { toast('이메일 형식을 확인해 주세요'); return; }
    const now = nowISO(), date = $('#e_date').value || todayStr();
    const out = { ...r, id: r.id || uid(), date, customer: { name: $('#e_name').value.trim(), phone: $('#e_phone').value.trim(), email }, items: its, discount: $('#e_disc').value === '' ? '' : +$('#e_disc').value, vat: $('#e_vat').checked, note: $('#e_note').value.trim(), sealId: $('#e_seal').value, updatedAt: now };
    if (!out.no) out.no = await nextNo(date);
    if (!out.createdAt) out.createdAt = now;
    if (!id) {
      out.payments = [];
      if (!$('#e_unpaid').checked) {
        const T = totals(out), amt = $('#e_paid').value === '' ? T.total : +$('#e_paid').value;
        if (amt > 0) out.payments.push({ id: uid(), amount: amt, date, method: $('#e_method').value });
      }
    }
    await DB.put('receipts', out);
    // 받는 분 기억(다음에 이름만 넣으면 전화·이메일 자동)
    if (out.customer.name) {
      const cs = await DB.all('customers');
      const c = cs.find((x) => x.name === out.customer.name) || { id: uid(), name: out.customer.name };
      await DB.put('customers', { ...c, phone: out.customer.phone || c.phone || '', email: out.customer.email || c.email || '', lastAt: now });
    }
    for (const l of its) if (l.itemId) { const it = await DB.get('items', l.itemId); if (it) await DB.put('items', { ...it, used: (it.used || 0) + 1 }); }
    toast('저장했습니다');
    location.replace(`#/r/${out.id}`);
  };
}

/* ───────── 영수증 보기·입금·보내기 ───────── */
async function viewReceipt(id) {
  const r = await DB.get('receipts', id);
  setTitle('영수증', true);
  if (!r) { view().innerHTML = '<div class="empty">영수증을 찾을 수 없습니다.</div>'; return; }
  const b = await bizInfo();
  const T = totals(r), paid = paidOf(r), left = T.total - paid;
  view().innerHTML = `
    ${!(b.bizNo && b.name) ? '<a class="card warnbox" href="#/settings" style="display:block;text-decoration:none;font-size:14px">사업자 정보가 비어 있습니다. ⚙️ 설정에서 넣으면 영수증 칸에 들어갑니다 ›</a>' : ''}
    <div class="card" style="padding:8px"><img id="v_img" alt="간이영수증" style="width:100%;border-radius:6px;background:#fff;min-height:160px;display:block"></div>
    <div class="card"><div class="row spread"><span>합계 <b>${won(T.total)}</b></span><span>받은 금액 <b>${won(paid)}</b></span></div>
      <div class="row spread" style="margin-top:6px"><span class="muted">No.${esc(r.no)} · ${esc(fmtDate(r.date))}</span><b style="color:${left > 0 ? 'var(--red)' : 'var(--green, #1F9D63)'}">${left > 0 ? '남은 금액 ' + won(left) : '완납'}</b></div>
      ${left > 0 ? `<div class="grid2" style="margin-top:10px"><div><input id="v_amt" type="number" inputmode="numeric" placeholder="${left}"></div><div><select id="v_method">${opts(METHODS, '계좌이체')}</select></div></div>
        <button class="btn primary block" id="v_pay" type="button" style="margin-top:8px">💰 입금 기록 (영수증이 '영수'로 바뀜)</button>` : ''}
      ${(r.payments || []).length ? `<div style="margin-top:8px">${r.payments.map((p) => `<div class="row spread muted" style="font-size:13px"><span>${esc(fmtDate(p.date))} ${esc(p.method || '')} ${won(p.amount)}</span><button class="btn small" data-delpay="${p.id}" type="button">✕</button></div>`).join('')}</div>` : ''}</div>
    <div class="card"><h2>📤 보내기</h2>
      <div class="grid2"><div><label for="v_phone">받는 사람 전화</label><input id="v_phone" type="tel" inputmode="tel" value="${esc(r.customer?.phone || '')}"></div><div><label for="v_email">받는 사람 이메일</label><input id="v_email" type="email" inputmode="email" value="${esc(r.customer?.email || '')}"></div></div>
      <div class="muted" style="font-size:12px;margin-top:4px">가족·회사 경리 등 다른 사람에게 보낼 때는 이 칸만 바꾸세요.</div>
      <button class="btn primary block" id="v_share" type="button" style="margin-top:10px">🖼 영수증 사진 보내기 (문자·카톡·메일)</button>
      <div class="grid2" style="margin-top:8px"><button class="btn" id="v_sms" type="button">💬 문자(글)</button><button class="btn" id="v_mail" type="button">✉️ 이메일(글)</button>
        <a class="btn" id="v_save" download="영수증-${esc(r.no)}.png">⬇ 사진 저장</a><button class="btn" id="v_copy" type="button">📋 글 복사</button></div></div>
    <div class="row"><a class="btn block" href="#/edit/${r.id}">✏️ 고치기</a><a class="btn block" href="#/copy/${r.id}">📄 복사해서 새로</a><button class="btn block danger" id="v_del" type="button">🗑 삭제</button></div>
    ${(r.log || []).length ? `<div class="card" style="margin-top:12px"><h2>보낸 기록</h2>${r.log.slice(-5).reverse().map((x) => `<div class="muted" style="font-size:13px">${esc(new Date(x.at).toLocaleString('ko-KR'))} · ${esc(x.via)}${x.to ? ' · ' + esc(x.to) : ''}</div>`).join('')}</div>` : ''}`;

  const blob = await receiptBlob(r);
  const url = URL.createObjectURL(blob);
  $('#v_img').src = url; $('#v_save').href = url;
  const file = new File([blob], `영수증-${r.no}.png`, { type: 'image/png' });
  const text = receiptText(r, b);
  const log = async (via, to) => { const rr = await DB.get('receipts', id); await DB.put('receipts', { ...rr, log: [...(rr.log || []), { at: nowISO(), via, to: to || '' }].slice(-20) }); };

  if ($('#v_pay')) $('#v_pay').onclick = async () => {
    const amt = Number($('#v_amt').value || left);
    if (!amt) { toast('금액을 넣어 주세요'); return; }
    const rr = await DB.get('receipts', id);
    await DB.put('receipts', { ...rr, payments: [...(rr.payments || []), { id: uid(), amount: amt, date: todayStr(), method: $('#v_method').value }], updatedAt: nowISO() });
    toast(`${won(amt)} 입금 기록`); render();
  };
  view().querySelectorAll('[data-delpay]').forEach((bt) => { bt.onclick = async () => {
    if (!confirm('이 입금 기록을 지울까요?')) return;
    const rr = await DB.get('receipts', id);
    await DB.put('receipts', { ...rr, payments: (rr.payments || []).filter((p) => p.id !== bt.dataset.delpay) }); render();
  }; });
  $('#v_share').onclick = async () => {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: '영수증', text: `영수증 - ${b.name || ''}`.trim() }); await log('사진 공유'); } catch { /* 취소 */ }
    } else toast('이 기기는 바로 공유가 안 됩니다. ‘사진 저장’ 후 보내 주세요');
  };
  $('#v_sms').onclick = async () => {
    const ph = digits($('#v_phone').value);
    if (!ph) { toast('받는 사람 전화번호를 넣어 주세요'); return; }
    await log('문자', ph);
    location.href = `sms:${ph}?body=${encodeURIComponent(text)}`;
  };
  $('#v_mail').onclick = async () => {
    const em = $('#v_email').value.trim();
    if (!isEmail(em)) { toast('받는 사람 이메일을 바르게 넣어 주세요'); return; }
    await log('이메일', em);
    location.href = `mailto:${encodeURIComponent(em)}?subject=${encodeURIComponent(`[영수증] ${b.name || ''} No.${r.no}`.trim())}&body=${encodeURIComponent(text)}`;
  };
  $('#v_copy').onclick = async () => { try { await navigator.clipboard.writeText(text); toast('영수증 글을 복사했습니다'); } catch { prompt('복사해서 쓰세요', text); } };
  $('#v_del').onclick = async () => { if (!confirm(`No.${r.no} 영수증을 지울까요? 되돌릴 수 없습니다.`)) return; await DB.del('receipts', id); toast('지웠습니다'); location.replace('#/'); };
}

/* ───────── 자주 쓰는 품목 ───────── */
async function viewItems() {
  setTitle('자주 쓰는 품목');
  const items = (await DB.all('items')).sort((a, b) => a.name.localeCompare(b.name));
  view().innerHTML = `<div class="card"><div class="muted" style="font-size:13px">여기 넣은 품목은 영수증 쓸 때 골라서 바로 넣을 수 있습니다. 단가는 비워도 됩니다.</div>
      <div id="it_list" style="margin-top:8px">${items.map((it) => `<div class="row" style="margin:6px 0"><input data-n="${it.id}" value="${esc(it.name)}" style="flex:2"><input data-u="${it.id}" value="${esc(it.unit || '')}" placeholder="단위" style="width:56px"><input data-p="${it.id}" type="number" inputmode="numeric" step="100" value="${esc(it.price ?? '')}" placeholder="단가" style="flex:1"><button class="btn small danger" data-x="${it.id}" type="button">✕</button></div>`).join('') || '<div class="muted">아직 없습니다.</div>'}</div></div>
    <div class="card"><h2>+ 새 품목</h2><div class="row"><input id="it_n" placeholder="품목 이름" style="flex:2"><input id="it_u" placeholder="단위" style="width:56px"><input id="it_p" type="number" inputmode="numeric" step="100" placeholder="단가" style="flex:1"></div>
      <button class="btn block" id="it_add" type="button" style="margin-top:8px">추가</button></div>
    ${items.length ? '<button class="btn primary block" id="it_save" type="button">💾 고친 내용 저장</button>' : ''}`;
  $('#it_add').onclick = async () => {
    const name = $('#it_n').value.trim(); if (!name) { toast('품목 이름을 넣어 주세요'); return; }
    await DB.put('items', { id: uid(), name, unit: $('#it_u').value.trim(), price: $('#it_p').value === '' ? '' : +$('#it_p').value, used: 0 });
    toast('추가했습니다'); render();
  };
  view().querySelectorAll('[data-x]').forEach((bt) => { bt.onclick = async () => { await DB.del('items', bt.dataset.x); render(); }; });
  if ($('#it_save')) $('#it_save').onclick = async () => {
    for (const it of items) {
      const n = view().querySelector(`[data-n="${it.id}"]`); if (!n) continue;
      const p = view().querySelector(`[data-p="${it.id}"]`).value;
      await DB.put('items', { ...it, name: n.value.trim() || it.name, unit: view().querySelector(`[data-u="${it.id}"]`).value.trim(), price: p === '' ? '' : +p });
    }
    toast('저장했습니다');
  };
}

/* ───────── 설정: 공급자 정보·도장·백업 ───────── */
async function viewSettings() {
  setTitle('설정');
  const b = await bizInfo();
  const last = await getSetting('lastBackup', null);
  view().innerHTML = `<div class="card"><h2>공급자 정보 <span class="muted">(영수증 위쪽 칸)</span></h2>
      <div class="muted" style="font-size:13px">사업자등록증에 적힌 대로 넣으세요. 비워 두면 영수증에서도 빈칸으로 나옵니다.</div>
      <label for="s_no">사업자등록번호</label><input id="s_no" inputmode="numeric" value="${esc(b.bizNo || '')}" placeholder="000-00-00000">
      <div class="grid2"><div><label for="s_name">상호</label><input id="s_name" value="${esc(b.name || '')}"></div><div><label for="s_owner">대표자 성명</label><input id="s_owner" value="${esc(b.owner || '')}"></div></div>
      <label for="s_addr">사업장 소재지</label><input id="s_addr" value="${esc(b.addr || '')}">
      <div class="grid2"><div><label for="s_type">업태</label><input id="s_type" value="${esc(b.bizType || '')}"></div><div><label for="s_item">종목</label><input id="s_item" value="${esc(b.bizItem || '')}"></div></div>
      <div class="grid2"><div><label for="s_phone">연락처</label><input id="s_phone" type="tel" value="${esc(b.phone || '')}"></div><div><label for="s_color">양식 색</label><select id="s_color">${opts(['빨강', '파랑'], b.rcptColor || '빨강')}</select></div></div>
      <label for="s_bank">입금 계좌 (선택)</label><input id="s_bank" value="${esc(b.bank || '')}" placeholder="예: OO은행 000-0000-0000 (예금주)">
      <button class="btn primary block" id="s_save" type="button" style="margin-top:12px">💾 저장</button></div>
    <div class="card" id="sealCard"><h2>도장 <span class="muted">(선택)</span></h2>
      <div class="muted" style="font-size:13px">발급하는 사람 이름으로 도장을 만들어 두면, 영수증 쓸 때 골라서 성명 칸 옆에 찍습니다. ★ 표시가 기본 도장입니다. 없으면 "(인)".</div>
      <div id="sealList" class="seal-list"></div>
      <h3 class="seal-h">이름으로 도장 만들기</h3>
      <div class="row"><input id="sg_name" placeholder="도장에 넣을 이름 (예: 홍길동)" value="${esc(b.owner || '')}" style="flex:1"><button class="btn small primary" id="sg_make" type="button">만들기</button></div>
      <div id="sg_prev" class="seal-prev"></div>
      <label class="btn small" style="color:var(--ink);margin-top:8px">📷 찍은 도장 사진으로 등록<input id="s_seal" type="file" accept="image/*" hidden></label></div>
    <div class="card"><h2>백업 (꼭 해 주세요)</h2>
      <div class="muted">영수증은 이 폰에만 저장됩니다. 백업 파일을 받아 구글 드라이브·PC 등에 보관하세요.</div>
      <div class="muted">마지막 백업: ${last ? new Date(last).toLocaleString('ko-KR') : '없음'}</div>
      <button class="btn primary block" id="s_export" type="button" style="margin-top:10px">⬇ 백업 파일 받기</button>
      <label class="btn block" style="margin-top:8px;color:var(--ink)">⬆ 백업 파일로 복원<input id="s_import" type="file" accept="application/json,.json" hidden></label>
      <div class="row" style="margin-top:8px"><select id="s_y" style="flex:1">${[...new Set([todayStr().slice(0, 4), String(+todayStr().slice(0, 4) - 1)])].map((y) => `<option>${y}</option>`).join('')}</select><button class="btn" id="s_csv" type="button">⬇ 연간 영수증 엑셀(CSV)</button></div></div>
    <div class="card"><h2>앱 정보</h2><div class="muted">간이영수증 v${APP_VERSION}<br>폰 홈 화면에 추가: 크롬 ⋮ → '홈 화면에 추가' 또는 '앱 설치'</div></div>`;
  let seals = sealList(b).map((s) => ({ ...s }));
  let sealId = defaultSealId(b);
  const read = () => {
    const out = { ...b, bizNo: $('#s_no').value.trim(), name: $('#s_name').value.trim(), owner: $('#s_owner').value.trim(), addr: $('#s_addr').value.trim(), bizType: $('#s_type').value.trim(), bizItem: $('#s_item').value.trim(), phone: $('#s_phone').value.trim(), rcptColor: $('#s_color').value, bank: $('#s_bank').value.trim(), seals, sealId };
    delete out.seal; // 예전 한 개짜리 도장 칸은 목록(seals)으로 옮김
    return out;
  };
  const saveSeals = async (msg) => { await setSetting('biz', read()); drawSeals(); if (msg) toast(msg); };
  const drawSeals = () => {
    $('#sealList').innerHTML = seals.length ? seals.map((s) => `<div class="seal-item${s.id === sealId ? ' on' : ''}">
        <img src="${s.img}" alt="${esc(s.name)} 도장"><div class="seal-name">${s.id === sealId ? '★ ' : ''}${esc(s.name)}</div>
        <div class="row" style="gap:4px;justify-content:center">${s.id === sealId ? '<span class="muted" style="font-size:12px">기본</span>' : `<button class="btn small" data-sdef="${s.id}" type="button">기본</button>`}<button class="btn small danger" data-sdel="${s.id}" type="button" aria-label="${esc(s.name)} 도장 지우기">✕</button></div></div>`).join('')
      : '<div class="muted" style="margin:8px 0">등록된 도장 없음</div>';
    view().querySelectorAll('[data-sdef]').forEach((bt) => { bt.onclick = () => { sealId = bt.dataset.sdef; saveSeals('기본 도장을 바꿨습니다'); }; });
    view().querySelectorAll('[data-sdel]').forEach((bt) => { bt.onclick = () => {
      const s = seals.find((x) => x.id === bt.dataset.sdel);
      if (!s || !confirm(`'${s.name}' 도장을 지울까요?`)) return;
      seals = seals.filter((x) => x.id !== s.id);
      if (sealId === s.id) sealId = seals[0] ? seals[0].id : 'none';
      saveSeals('도장을 지웠습니다');
    }; });
  };
  drawSeals();
  $('#sg_make').onclick = () => {
    const nm = $('#sg_name').value.trim();
    if (!nm) { toast('도장에 넣을 이름을 써 주세요'); return; }
    const company = $('#s_name').value.trim();
    const styles = SEAL_STYLES.filter((st) => st.kind !== 'company' || company);
    $('#sg_prev').innerHTML = `<div class="muted" style="font-size:13px;margin:8px 0 4px">마음에 드는 모양을 누르면 도장 목록에 추가됩니다.</div><div class="seal-list">${styles.map((st) => {
      const img = makeSeal(nm, st.kind, company);
      return `<button class="seal-item pick" type="button" data-sk="${st.kind}" data-img="${img}"><img src="${img}" alt="${esc(nm)} ${st.label} 도장"><div class="seal-name">${st.label}</div></button>`;
    }).join('')}</div>`;
    $('#sg_prev').querySelectorAll('[data-sk]').forEach((bt) => { bt.onclick = () => {
      const st = SEAL_STYLES.find((x) => x.kind === bt.dataset.sk);
      const s = { id: uid(), name: `${nm} (${st.label})`, kind: st.kind, img: bt.dataset.img };
      seals.push(s);
      if (sealId === 'none' || !seals.some((x) => x.id === sealId)) sealId = s.id;
      $('#sg_prev').innerHTML = '';
      saveSeals(`'${s.name}' 도장을 추가했습니다`);
    }; });
  };
  $('#s_save').onclick = async () => { await setSetting('biz', read()); toast('저장했습니다'); };
  $('#s_seal').onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const img = new Image(); img.src = URL.createObjectURL(f);
    await new Promise((res) => { img.onload = res; img.onerror = res; });
    if (!img.width) { toast('사진을 읽지 못했습니다'); return; }
    const s = Math.min(img.width, img.height), cv = document.createElement('canvas'); cv.width = cv.height = 200;
    const g = cv.getContext('2d'); g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 200, 200);
    const d = g.getImageData(0, 0, 200, 200);
    for (let i = 0; i < d.data.length; i += 4) if (d.data[i] > 190 && d.data[i + 1] > 190 && d.data[i + 2] > 190) d.data[i + 3] = 0;
    g.putImageData(d, 0, 0);
    ev.target.value = '';
    const nm = prompt('이 도장의 이름 (예: 대표 도장)', $('#s_owner').value.trim() ? `${$('#s_owner').value.trim()} (사진)` : '사진 도장');
    if (nm === null) return;
    const ns = { id: uid(), name: nm.trim() || '사진 도장', kind: 'photo', img: cv.toDataURL('image/png') };
    seals.push(ns);
    if (sealId === 'none' || !seals.some((x) => x.id === sealId)) sealId = ns.id;
    saveSeals('도장을 등록했습니다');
  };
  $('#s_export').onclick = exportBackup;
  $('#s_import').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!confirm('지금 폰에 있는 영수증을 모두 지우고 백업 파일 내용으로 바꿉니다. 계속할까요?')) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'simple-receipt') throw new Error('간이영수증 백업 파일이 아닙니다');
      for (const s of BACKUP_STORES) { await DB.clear(s); for (const x of d[s] || []) await DB.put(s, x); }
      toast('복원했습니다'); render();
    } catch (err) { alert('복원 실패: ' + err.message); }
  };
  $('#s_csv').onclick = async () => {
    const y = $('#s_y').value;
    const rs = (await DB.all('receipts')).filter((r) => (r.date || '').startsWith(y)).sort((a, c) => a.date.localeCompare(c.date));
    const rows = [['번호', '작성일', '받는 분', '전화', '품목', '합계', '받은 금액', '남은 금액', '상태', '비고']];
    rs.forEach((r) => { const T = totals(r), p = paidOf(r); rows.push([r.no, r.date, r.customer?.name || '', r.customer?.phone || '', (r.items || []).map((l) => `${l.name} ${l.qty}${l.unit || ''}`).join(' / '), T.total, p, Math.max(0, T.total - p), stateOf(r), r.note || '']); });
    // 엑셀이 수식으로 읽지 않게 = + - @ 로 시작하는 글자는 앞에 ' 를 붙인다
    const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s) && typeof v !== 'number') s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `간이영수증-${y}.csv`; a.click();
  };
}
async function exportBackup() {
  const d = { app: 'simple-receipt', version: APP_VERSION, at: nowISO() };
  for (const s of BACKUP_STORES) d[s] = await DB.all(s);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' }));
  a.download = `간이영수증-백업-${todayStr()}.json`; a.click();
  await setSetting('lastBackup', Date.now());
  toast('백업 파일을 받았습니다');
}

/* ───────── 시작 ───────── */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
render();
