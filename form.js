/* 간이영수증 앱 — 영수증 양식 그리기 (ONE LIFE AI rcptform.js에서 가져옴) */
/* ───────── 실제 간이영수증 양식(공급받는자용) ─────────
   문구점에서 파는 간이영수증과 같은 칸: 공급자(사업자등록번호·상호·성명·사업장 소재지·업태·종목),
   작성년월일·공급대가총액·비고, "위 금액을 영수(청구)함", 월일·품목·수량·단가·공급대가, 합계.
   사업자 정보는 설정(#/settings)에서 넣는다. 모르는 칸은 비워 둔다(지어내지 않음). */

// 숫자 → 한글 금액(영수증 표기: 일십·일백·일천을 줄이지 않음). 예: 80000 → 팔만
function korWon(n) {
  n = Math.round(Math.abs(+n || 0));
  if (!n) return '영';
  const D = '영일이삼사오육칠팔구', U = ['', '십', '백', '천'], B = ['', '만', '억', '조'];
  let s = '', i = 0;
  while (n > 0) {
    let chunk = n % 10000, c = '', k = 0;
    while (chunk > 0) { const d = chunk % 10; if (d) c = D[d] + U[k] + c; chunk = Math.floor(chunk / 10); k++; }
    if (c) s = c + B[i] + s;
    n = Math.floor(n / 10000); i++;
  }
  return s;
}

async function renderFormReceipt(e, T, j, c, b, paid, method) {
  const blue = b.rcptColor === '파랑';
  const INK = blue ? '#1F4FB8' : '#C8202F'; // 양식 선 색(문구점 영수증처럼 빨강/파랑)
  const TINT = blue ? 'rgba(31,79,184,.07)' : 'rgba(200,32,47,.07)';
  const TXT = '#1A1A1A', F = '"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  const W = 1080, L = 50, R = W - 50, IW = R - L;
  const day = (j.doneAt || j.scheduledAt || todayStr()).slice(0, 10);
  const md = `${+day.slice(5, 7)}/${+day.slice(8, 10)}`;
  // 품목 줄: 견적 품목 + 출장비 + 할인(-) + 부가세
  const items = (e.lines || []).filter((l) => l.name && (+l.qty || 0) * (+l.price || 0) > 0)
    .map((l) => ({ name: l.name, qty: `${l.qty}${l.unit || ''}`, price: +l.price, amt: (+l.qty || 0) * (+l.price || 0) }));
  if (T.trip) items.push({ name: '출장비', qty: '1', price: T.trip, amt: T.trip });
  if (T.disc) items.push({ name: '할인', qty: '', price: '', amt: -T.disc });
  if (e.vat) items.push({ name: '부가세(10%)', qty: '', price: '', amt: T.vat });
  const nRows = Math.min(Math.max(items.length, 8), 16);
  const RH = 58; // 품목 한 줄 높이
  const H = 912 + nRows * RH; // 맨 아래 연락처 줄까지 딱 맞춘 높이
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#FFFDF7'; g.fillRect(0, 0, W, H); // 영수증 종이색
  const line = (x1, y1, x2, y2, w = 2) => { g.strokeStyle = INK; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  const box = (x, y, w, h, lw = 2) => { g.strokeStyle = INK; g.lineWidth = lw; g.strokeRect(x, y, w, h); };
  const txt = (s, x, y, { size = 26, color = TXT, align = 'left', bold = false, max } = {}) => {
    g.font = `${bold ? 'bold ' : ''}${size}px ${F}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
    const full = String(s ?? '');
    let t = full;
    if (max && g.measureText(t).width > max) { while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1); t += '…'; }
    g.fillText(t, x, y);
  };
  const label = (s, x, y, w, h) => { g.fillStyle = TINT; g.fillRect(x, y, w, h); box(x, y, w, h, 1.5); txt(s, x + w / 2, y + h / 2, { size: 22, color: INK, align: 'center' }); };

  // 제목
  txt('영  수  증', W / 2, 66, { size: 58, color: INK, align: 'center', bold: true });
  txt('(공급받는자용)', W / 2 + 190, 80, { size: 22, color: INK });
  line(W / 2 - 170, 106, W / 2 + 170, 106, 3); line(W / 2 - 170, 113, W / 2 + 170, 113, 1);
  // No. · 받는 사람
  const no = j.no || `${day.replace(/-/g, '')}-${String(j.id || '').slice(-4).toUpperCase()}`;
  txt(`No. ${no}`, L, 160, { size: 22, color: INK });
  txt(`${c.name || ''}`, R - 70, 158, { size: 32, align: 'right', bold: true, max: 420 });
  txt('귀하', R, 160, { size: 26, color: INK, align: 'right' });
  line(R - 520, 186, R, 186, 1.5);

  // 공급자 칸(4행)
  let y = 210; const sh = 64, sideW = 56, lab = 160;
  const x0 = L + sideW, half = (R - x0) / 2;
  g.fillStyle = TINT; g.fillRect(L, y, sideW, sh * 4);
  ['공', '급', '자'].forEach((ch, i) => txt(ch, L + sideW / 2, y + sh * 0.85 + i * sh * 1.15, { size: 28, color: INK, align: 'center', bold: true }));
  label('사업자등록번호', x0, y, lab + 40, sh); txt(b.bizNo || '', x0 + lab + 64, y + sh / 2, { size: 30, bold: true, max: IW - lab - 130 });
  label('상    호', x0, y + sh, lab, sh); txt(b.name || '', x0 + lab + 16, y + sh * 1.5, { size: 28, max: half - lab - 24 });
  label('성    명', x0 + half, y + sh, lab, sh); txt(b.owner || '', x0 + half + lab + 16, y + sh * 1.5, { size: 28, max: half - lab - 120 });
  // (인) 자리에 실제 도장처럼 크게 겹쳐 찍는다
  txt('(인)', R - 18, y + sh * 1.5, { size: 22, color: INK, align: 'right' });
  if (b.seal) {
    const img = new Image(); img.src = b.seal;
    await new Promise((r) => { img.onload = r; img.onerror = r; });
    const SZ = 96;
    if (img.width) { g.save(); g.globalAlpha = 0.92; g.drawImage(img, R - 58 - SZ / 2, y + sh * 1.5 - SZ / 2, SZ, SZ); g.restore(); }
  }
  label('사업장 소재지', x0, y + sh * 2, lab + 40, sh); txt(b.addr || '', x0 + lab + 64, y + sh * 2.5, { size: 24, max: IW - lab - 130 });
  label('업    태', x0, y + sh * 3, lab, sh); txt(b.bizType || '', x0 + lab + 16, y + sh * 3.5, { size: 26, max: half - lab - 24 });
  label('종    목', x0 + half, y + sh * 3, lab, sh); txt(b.bizItem || '', x0 + half + lab + 16, y + sh * 3.5, { size: 26, max: half - lab - 24 });
  [1, 2, 3].forEach((k) => line(x0, y + sh * k, R, y + sh * k, 1.5));
  line(x0, y, x0, y + sh * 4, 2);
  box(L, y, IW, sh * 4, 3);

  // 작성년월일 · 공급대가총액 · 비고
  y += sh * 4 + 20;
  const c1 = 250, c2 = 470, c3 = IW - c1 - c2;
  label('작성년월일', L, y, c1, 50); label('공급대가총액', L + c1, y, c2, 50); label('비    고', L + c1 + c2, y, c3, 50);
  txt(day.replace(/-/g, '. ') + '.', L + c1 / 2, y + 100, { size: 28, align: 'center' });
  txt(`일금 ${korWon(T.total)}원정`, L + c1 + c2 / 2, y + 84, { size: 28, align: 'center', bold: true, max: c2 - 20 });
  txt(`(₩${Number(T.total).toLocaleString('ko-KR')})`, L + c1 + c2 / 2, y + 122, { size: 24, align: 'center' });
  const full = paid >= T.total;
  const note = full ? (method || '') : paid > 0 ? `받음 ${won(paid)}` : '미수';
  txt(note, L + c1 + c2 + c3 / 2, y + 88, { size: 22, align: 'center', max: c3 - 16 });
  if (!full && paid > 0) txt(`남음 ${won(T.total - paid)}`, L + c1 + c2 + c3 / 2, y + 120, { size: 22, align: 'center', max: c3 - 16 });
  line(L + c1, y, L + c1, y + 150, 1.5); line(L + c1 + c2, y, L + c1 + c2, y + 150, 1.5); line(L, y + 50, R, y + 50, 1.5);
  box(L, y, IW, 150, 3);

  // 영수 문구(해당하는 쪽에 동그라미)
  y += 150;
  box(L, y, IW, 70, 3);
  txt('위 금액을', W / 2 - 70, y + 35, { size: 30, color: INK, align: 'right', bold: true });
  txt('영수', W / 2 - 10, y + 35, { size: 30, color: INK, align: 'center', bold: true });
  txt('(청구)', W / 2 + 75, y + 35, { size: 30, color: INK, align: 'center', bold: true });
  txt('함.', W / 2 + 140, y + 35, { size: 30, color: INK, bold: true });
  g.strokeStyle = TXT; g.lineWidth = 3; g.beginPath(); g.ellipse(full ? W / 2 - 10 : W / 2 + 75, y + 35, full ? 46 : 58, 26, 0, 0, Math.PI * 2); g.stroke();

  // 품목 표
  y += 70;
  const cols = [110, 380, 130, 180]; // 월일·품목·수량·단가, 나머지 = 금액
  const cx = [L]; cols.forEach((w) => cx.push(cx[cx.length - 1] + w));
  const amtW = R - cx[4];
  ['월일', '품    목', '수량', '단가', '공급대가(금액)'].forEach((h, i) => label(h, cx[i], y, i < 4 ? cols[i] : amtW, 52));
  for (let i = 0; i < nRows; i++) {
    const ry = y + 52 + i * RH, it = items[i];
    line(L, ry + RH, R, ry + RH, 1);
    if (!it) continue;
    txt(md, cx[0] + cols[0] / 2, ry + RH / 2, { size: 22, align: 'center' });
    txt(it.name, cx[1] + 12, ry + RH / 2, { size: 25, max: cols[1] - 20 });
    txt(it.qty, cx[2] + cols[2] / 2, ry + RH / 2, { size: 24, align: 'center' });
    txt(it.price === '' ? '' : Number(it.price).toLocaleString('ko-KR'), cx[4] - 12, ry + RH / 2, { size: 24, align: 'right' });
    txt(Number(it.amt).toLocaleString('ko-KR'), R - 14, ry + RH / 2, { size: 25, align: 'right', bold: true });
  }
  for (let i = 1; i <= 4; i++) line(cx[i], y, cx[i], y + 52 + nRows * RH, 1.5);
  // 합계
  const ty = y + 52 + nRows * RH;
  label('합          계', L, ty, cx[4] - L, 70);
  txt(`₩${Number(T.total).toLocaleString('ko-KR')}`, R - 14, ty + 35, { size: 32, align: 'right', bold: true });
  line(L, ty, R, ty, 3); line(cx[4], ty, cx[4], ty + 70, 1.5);
  box(L, y, IW, 52 + nRows * RH + 70, 3);

  // 아래: 연락처·계좌
  const fy = ty + 70 + 36;
  const foot = [b.phone ? `☎ ${b.phone}` : '', b.bank ? `입금 계좌: ${b.bank}` : ''].filter(Boolean).join('     ');
  if (foot) txt(foot, L, fy, { size: 22, color: '#444', max: IW - 160 });
  txt('감사합니다.', R, fy, { size: 22, color: INK, align: 'right' });
  return new Promise((res, rej) => cv.toBlob((x) => (x ? res(x) : rej(new Error('이미지 실패'))), 'image/png'));
}
