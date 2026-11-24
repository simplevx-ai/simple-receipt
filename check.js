/* 간이영수증 앱 — 보내기 전 검사
   내용이 이상하거나(빈칸·금액 오류·깨진 글자) 폰 글꼴에 없는 글자가 있으면 보내지 않고 이유를 알려 준다. */

const FORM_FONT = '"Malgun Gothic","Apple SD Gothic Neo",sans-serif'; // form.js와 같은 글꼴

// 영수증·문자에 써도 되는 글자: 한글, 영문·숫자·기본 기호, 한자, 자주 쓰는 기호(· × ₩ … ☎ ※ → 등)
const OK_CHAR = /^[ -~·×‘-”…→※₩☎　-〿ㄱ-ㆎ가-힣一-鿿！-～\n]$/u;

function badChars(s) {
  const out = new Set();
  for (const ch of String(s || '')) if (!OK_CHAR.test(ch)) out.add(ch);
  return [...out];
}
const showChars = (arr) => arr.slice(0, 6).map((c) => (/\p{Cc}|\p{Cf}/u.test(c) ? `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}` : `'${c}'`)).join(', ');

// 글자가 깨졌는지(인코딩 오류·빈 값이 글자로 들어감 등)
function textProblems(s, where) {
  const t = String(s || ''), P = [];
  if (/\b(undefined|NaN|null|Infinity)\b|\[object/.test(t)) P.push(`${where}에 'undefined/NaN' 같은 잘못된 값이 들어 있습니다`);
  if (/�/.test(t)) P.push(`${where}에 깨진 글자(�)가 있습니다`);
  if (/[À-ÿ][\u0080-¿ŒœŠšŸŽž‘-„€]/.test(t)) P.push(`${where}의 한글이 깨져 보입니다(인코딩 오류)`);
  if (/\?{3,}/.test(t)) P.push(`${where}에 '???'처럼 깨진 부분이 있습니다`);
  return P;
}

// 폰 글꼴에 그 글자가 있는지: 없는 글자(네모 □로 나옴)와 그림이 같으면 '없음'
const Glyph = (() => {
  let g = null, refs = null;
  const S = 48;
  const draw = (ch) => {
    g.clearRect(0, 0, S, S);
    g.font = `32px ${FORM_FONT}`; g.fillStyle = '#000'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(ch, 4, S / 2);
    return g.getImageData(0, 0, S, S).data;
  };
  const blank = (d) => { for (let i = 3; i < d.length; i += 4) if (d[i]) return false; return true; };
  const same = (a, b) => { for (let i = 3; i < a.length; i += 4) if (a[i] !== b[i]) return false; return true; };
  function init() {
    if (g) return;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    g = cv.getContext('2d', { willReadFrequently: true });
    refs = ['͸', '￿', '\u{10FFFD}'].map(draw).filter((d) => !blank(d)); // 글꼴에 없는 글자 모양(□)
  }
  return {
    missing(text) {
      init();
      const bad = new Set();
      for (const ch of new Set(String(text || ''))) {
        if (/\s/.test(ch)) continue;
        const d = draw(ch);
        if (blank(d) || refs.some((r) => same(d, r))) bad.add(ch);
      }
      return [...bad];
    },
  };
})();

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number), t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}

/* 검사: 문제 목록을 돌려준다(빈 배열이면 통과)
   opt = { channel: 'sms'|'email'|'app'|'copy'|'save', withText, withPhoto, to, text, blob } */
function checkSend(r, b, opt) {
  const E = [];
  const T = totals(r), paid = paidOf(r);
  // 공급자 정보
  if (digits(b.bizNo).length !== 10) E.push('사업자등록번호가 비었거나 10자리가 아닙니다 (⚙️ 설정)');
  if (!b.name) E.push('상호가 비어 있습니다 (⚙️ 설정)');
  if (!b.owner) E.push('대표자 성명이 비어 있습니다 (⚙️ 설정)');
  // 영수증 내용
  if (!r.no) E.push('영수증 번호가 없습니다');
  if (!validDate(r.date)) E.push('작성일이 올바른 날짜가 아닙니다');
  else if (r.date > todayStr()) E.push(`작성일(${r.date})이 오늘보다 뒤입니다`);
  if (!r.customer?.name) E.push('받는 분 이름이 비어 있습니다 (✏️ 고치기)');
  const its = r.items || [];
  if (!its.length) E.push('품목이 없습니다');
  its.forEach((l, i) => {
    const q = Number(l.qty), p = Number(l.price);
    if (!String(l.name || '').trim()) E.push(`${i + 1}번째 품목 이름이 비어 있습니다`);
    if (!Number.isFinite(q) || q <= 0) E.push(`'${l.name || i + 1 + '번째'}' 수량이 잘못됐습니다`);
    if (!Number.isFinite(p) || p < 0) E.push(`'${l.name || i + 1 + '번째'}' 단가가 잘못됐습니다`);
  });
  if (!Number.isFinite(T.total) || T.total <= 0) E.push('합계 금액이 0원이거나 잘못됐습니다');
  if (T.disc > T.sub) E.push('할인이 품목 합계보다 큽니다');
  if (paid > T.total) E.push(`받은 금액(${won(paid)})이 합계(${won(T.total)})보다 많습니다`);
  if (!/^[영일이삼사오육칠팔구십백천만억조]+$/.test(korWon(T.total))) E.push('한글 금액 표시가 잘못됐습니다');
  // 받는 사람
  if (opt.channel === 'sms' && !/^0\d{8,10}$/.test(digits(opt.to))) E.push('받는 사람 전화번호가 비었거나 형식이 맞지 않습니다');
  if (opt.channel === 'email' && !isEmail(opt.to || '')) E.push('받는 사람 이메일이 비었거나 형식이 맞지 않습니다');
  // 영수증 사진에 들어가는 글자
  const fields = [
    ['상호', b.name], ['대표자', b.owner], ['사업장 소재지', b.addr], ['업태', b.bizType], ['종목', b.bizItem], ['연락처', b.phone], ['입금 계좌', b.bank],
    ['받는 분 이름', r.customer?.name], ['받는 분 전화', r.customer?.phone], ['받는 분 이메일', r.customer?.email], ['비고', r.note],
    ...its.flatMap((l, i) => [[`품목 ${i + 1}`, l.name], [`품목 ${i + 1} 단위`, l.unit]]),
  ];
  for (const [k, v] of fields) {
    if (!v) continue;
    E.push(...textProblems(v, k));
    const bc = badChars(v);
    if (bc.length) E.push(`${k}에 영수증에 쓸 수 없는 글자(이모지·특수문자)가 있습니다: ${showChars(bc)}`);
  }
  if (opt.withPhoto) {
    const all = fields.map((f) => f[1] || '').join('') + '영수증공급받는자사업자등록번호상호성명소재지업태종목작성년월일공급대가총액비고위금액을청구함품목수량단가합계감사합니다일금원정₩☎';
    const miss = Glyph.missing(all);
    if (miss.length) E.push(`이 폰 글꼴에 없는 글자가 있어 영수증 사진에서 □로 깨집니다: ${showChars(miss)}`);
    if (!opt.blob || opt.blob.size < 15000) E.push('영수증 사진이 제대로 만들어지지 않았습니다. 화면을 닫았다가 다시 열어 주세요');
  }
  if (opt.withText) {
    E.push(...textProblems(opt.text, '보낼 글'));
    const bc = badChars(opt.text);
    if (bc.length) E.push(`보낼 글에 쓸 수 없는 글자가 있습니다: ${showChars(bc)}`);
  }
  return [...new Set(E)];
}
