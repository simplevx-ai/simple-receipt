/* 간이영수증 앱 — 이름으로 도장 이미지 만들기
   발급하는 사람 이름(또는 상호)을 넣으면 원형·사각·타원·상호 원형 도장을 그려 투명 PNG로 만든다.
   만든 도장은 설정 'biz'의 seals 목록에 저장하고, 영수증마다 골라 쓴다. */

const SEAL_RED = '#D0202F';
const SEAL_FONT = '"Noto Serif KR","Noto Serif CJK KR","Nanum Myeongjo","Batang","AppleMyungjo",serif';
const SEAL_STYLES = [
  { kind: 'circle', label: '원형' },
  { kind: 'square', label: '사각' },
  { kind: 'oval', label: '타원' },
  { kind: 'company', label: '상호 원형' },
];

// 이름 글자를 도장 칸에 배치: 2자→세로 2칸, 3자→'인'을 붙여 2×2, 4자→2×2(오른쪽 줄부터 위→아래)
function sealGrid(name) {
  let ch = [...String(name || '').replace(/\s+/g, '')].slice(0, 6);
  if (!ch.length) return { cols: 1, rows: 1, cells: ['印'] };
  if (ch.length === 1) return { cols: 1, rows: 2, cells: [ch[0], '印'] };
  if (ch.length === 2) return { cols: 1, rows: 2, cells: ch };
  if (ch.length === 3) ch = [...ch, '인'];
  const rows = 2, cols = Math.ceil(ch.length / rows);
  return { cols, rows, cells: ch };
}

// 글자 하나를 칸(x,y,w,h)에 꽉 차게(도장처럼 늘려서) 쓴다
function sealChar(g, c, x, y, w, h) {
  g.save();
  g.font = `900 100px ${SEAL_FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const m = g.measureText(c);
  const tw = m.width || 100;
  const th = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 100;
  g.translate(x + w / 2, y + h / 2);
  g.scale((w * 0.92) / tw, (h * 0.92) / th);
  const dy = ((m.actualBoundingBoxAscent || 50) - (m.actualBoundingBoxDescent || 50)) / 2;
  g.fillText(c, 0, dy);
  g.restore();
}

// 오른쪽 줄부터 위→아래로 칸 채우기(전통 도장 읽는 순서)
function sealFill(g, grid, x, y, w, h) {
  const cw = w / grid.cols, rh = h / grid.rows;
  grid.cells.forEach((c, i) => {
    const col = grid.cols - 1 - Math.floor(i / grid.rows), row = i % grid.rows;
    sealChar(g, c, x + col * cw, y + row * rh, cw, rh);
  });
}

// 찍은 도장처럼 가장자리를 조금 거칠게(같은 이름이면 같은 모양)
function sealTexture(g, S, seed) {
  let s = seed || 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const d = g.getImageData(0, 0, S, S);
  for (let i = 3; i < d.data.length; i += 4) {
    if (!d.data[i]) continue;
    const r = rnd();
    if (r < 0.06) d.data[i] = Math.round(d.data[i] * 0.35);
    else if (r < 0.14) d.data[i] = Math.round(d.data[i] * 0.8);
  }
  g.putImageData(d, 0, 0);
}

// 상호를 원 둘레에 쓴다(위쪽 반원)
function sealRing(g, text, cx, cy, r, size) {
  const ch = [...String(text || '').replace(/\s+/g, '')].slice(0, 12);
  if (!ch.length) return;
  g.save();
  g.font = `900 ${size}px ${SEAL_FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const span = Math.min(Math.PI * 1.5, ch.length * (size * 1.05) / r);
  const start = -Math.PI / 2 - span / 2 + span / ch.length / 2;
  ch.forEach((c, i) => {
    const a = start + (span / ch.length) * i;
    g.save();
    g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.rotate(a + Math.PI / 2);
    g.fillText(c, 0, 0);
    g.restore();
  });
  g.restore();
}

/* 도장 그리기 → PNG dataURL. kind: circle | square | oval | company */
function makeSeal(name, kind = 'circle', company = '') {
  const S = 240, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = SEAL_RED; g.strokeStyle = SEAL_RED;
  const grid = sealGrid(name);
  if (kind === 'square') {
    g.lineWidth = 14; g.strokeRect(14, 14, S - 28, S - 28);
    sealFill(g, grid, 34, 34, S - 68, S - 68);
  } else if (kind === 'oval') {
    g.lineWidth = 11; g.beginPath(); g.ellipse(S / 2, S / 2, S * 0.3, S / 2 - 9, 0, 0, Math.PI * 2); g.stroke();
    const ch = [...String(name || '').replace(/\s+/g, '')].slice(0, 4);
    const col = { cols: 1, rows: Math.max(ch.length, 1), cells: ch.length ? ch : ['印'] };
    const h = S - 76;
    sealFill(g, col, S / 2 - S * 0.17, 38, S * 0.34, h);
  } else if (kind === 'company') {
    g.lineWidth = 9; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 58, 0, Math.PI * 2); g.stroke();
    sealRing(g, company || name, S / 2, S / 2, S / 2 - 33, 34);
    const inner = (S / 2 - 66) * 1.3;
    sealFill(g, sealGrid(name), S / 2 - inner / 2, S / 2 - inner / 2, inner, inner);
  } else {
    g.lineWidth = 13; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 9, 0, Math.PI * 2); g.stroke();
    const inner = (S / 2 - 22) * 1.36; // 원 안에 들어가는 네모
    sealFill(g, grid, S / 2 - inner / 2, S / 2 - inner / 2, inner, inner);
  }
  let seed = 7; for (const c of String(name) + kind) seed = (seed * 31 + c.charCodeAt(0)) % 2147483647;
  sealTexture(g, S, seed || 1);
  return cv.toDataURL('image/png');
}

/* 저장된 도장 목록(예전 '사진 도장' 한 개짜리 설정도 목록으로 바꿔 읽음) */
function sealList(b) {
  if (Array.isArray(b.seals)) return b.seals;
  return b.seal ? [{ id: 'photo', name: '사진 도장', kind: 'photo', img: b.seal }] : [];
}
function defaultSealId(b) {
  const list = sealList(b);
  if (b.sealId === 'none') return 'none';
  return (list.find((s) => s.id === b.sealId) || list[0] || {}).id || 'none';
}
// 영수증에 찍을 도장: 영수증에 고른 것 → 없으면 기본 도장. 'none'이면 (인)
function pickSeal(b, id) {
  const list = sealList(b);
  const want = id || defaultSealId(b);
  if (want === 'none') return null;
  return list.find((s) => s.id === want) || list.find((s) => s.id === defaultSealId(b)) || null;
}
