/* 간이영수증 앱 — 이름으로 도장 이미지 만들기
   발급하는 사람 이름(또는 상호)을 넣으면 인감형(원형·두 줄 테·굵은 테·타원)과 직인형(사각·두 줄 사각·둥근 모서리·붉은 바탕) 도장을 그려 투명 PNG로 만든다.
   만든 도장은 설정 'biz'의 seals 목록에 저장하고, 영수증마다 골라 쓴다. */

const SEAL_RED = '#D0202F';
const SEAL_FONT = '"Noto Serif KR","Noto Serif CJK KR","Nanum Myeongjo","Batang","AppleMyungjo",serif';
const SEAL_STYLES = [
  { kind: 'circle', label: '원형 기본', group: '인감' },
  { kind: 'ingam2', label: '두 줄 테', group: '인감' },
  { kind: 'ingam3', label: '굵은 테', group: '인감' },
  { kind: 'oval', label: '타원', group: '인감' },
  { kind: 'square', label: '사각', group: '직인' },
  { kind: 'square2', label: '두 줄 사각', group: '직인' },
  { kind: 'rsquare', label: '둥근 모서리', group: '직인' },
  { kind: 'solid', label: '붉은 바탕', group: '직인' },
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

const ring = (g, r, w) => { g.lineWidth = w; g.beginPath(); g.arc(120, 120, r, 0, Math.PI * 2); g.stroke(); };
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* 도장 그리기 → PNG dataURL (240×240, 투명 바탕)
   인감형: circle(원형 기본) · ingam2(두 줄 테) · ingam3(굵은 테) · oval(타원)
   직인형: square(사각) · square2(두 줄 사각) · rsquare(둥근 모서리) · solid(붉은 바탕 흰 글씨) */
function makeSeal(name, kind = 'circle') {
  const S = 240, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = SEAL_RED; g.strokeStyle = SEAL_RED;
  const grid = sealGrid(name);
  const inCircle = (r) => { const w = r * 1.38; sealFill(g, grid, S / 2 - w / 2, S / 2 - w / 2, w, w); };
  if (kind === 'ingam2') {
    ring(g, S / 2 - 7, 10); ring(g, S / 2 - 22, 3); inCircle(S / 2 - 30);
  } else if (kind === 'ingam3') {
    ring(g, S / 2 - 12, 20); inCircle(S / 2 - 28);
  } else if (kind === 'oval') {
    g.lineWidth = 11; g.beginPath(); g.ellipse(S / 2, S / 2, S * 0.3, S / 2 - 9, 0, 0, Math.PI * 2); g.stroke();
    const ch = [...String(name || '').replace(/\s+/g, '')].slice(0, 4);
    sealFill(g, { cols: 1, rows: Math.max(ch.length, 1), cells: ch.length ? ch : ['印'] }, S / 2 - S * 0.17, 38, S * 0.34, S - 76);
  } else if (kind === 'square') {
    g.lineWidth = 14; g.strokeRect(14, 14, S - 28, S - 28);
    sealFill(g, grid, 34, 34, S - 68, S - 68);
  } else if (kind === 'square2') {
    g.lineWidth = 12; g.strokeRect(10, 10, S - 20, S - 20);
    g.lineWidth = 3; g.strokeRect(26, 26, S - 52, S - 52);
    sealFill(g, grid, 38, 38, S - 76, S - 76);
  } else if (kind === 'rsquare') {
    g.lineWidth = 13; rrect(g, 13, 13, S - 26, S - 26, 34); g.stroke();
    sealFill(g, grid, 36, 36, S - 72, S - 72);
  } else if (kind === 'solid') {
    rrect(g, 8, 8, S - 16, S - 16, 14); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 4; g.strokeRect(22, 22, S - 44, S - 44);
    sealFill(g, grid, 34, 34, S - 68, S - 68);
    g.globalCompositeOperation = 'source-over';
  } else {
    // 원형 기본: 무난한 둥근 성명인(굵은 테 하나 + 이름)
    ring(g, S / 2 - 8, 12); inCircle(S / 2 - 20);
  }
  if (kind !== 'circle') { // 기본형은 깔끔하게, 나머지는 찍은 느낌을 조금
    let seed = 7; for (const c of String(name) + kind) seed = (seed * 31 + c.charCodeAt(0)) % 2147483647;
    sealTexture(g, S, seed || 1);
  }
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
// 도장을 하나도 안 만들었으면 대표자 이름으로 둥근 기본형을 그때그때 만들어 쓴다
function pickSeal(b, id) {
  const list = sealList(b);
  const want = id || defaultSealId(b);
  if (want === 'none' && (id === 'none' || b.sealId === 'none')) return null;
  const found = list.find((s) => s.id === want) || list.find((s) => s.id === defaultSealId(b));
  if (found) return found;
  return b.owner ? { id: 'auto', name: `${b.owner} (원형 기본)`, kind: 'circle', img: makeSeal(b.owner, 'circle') } : null;
}
