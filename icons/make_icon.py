"""간이영수증 아이콘 v3 — 평면(flat)·밝은 그라데이션·젊은 느낌. 사용: python make_receipt_icon_v3.py OUT_DIR [A|B|C|all]"""
import sys
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
WHICH = sys.argv[2] if len(sys.argv) > 2 else 'all'
FONT = r'C:\Windows\Fonts\malgunbd.ttf'

THEMES = {
    # 배경 그라데이션(왼쪽 위 → 오른쪽 아래), 도장 색, 줄 색, 포인트 줄 색
    'A': dict(c1=(255, 110, 97), c2=(255, 154, 84), seal=(33, 37, 64), line=(226, 230, 238), accent=(255, 110, 97)),   # 코랄·오렌지
    'B': dict(c1=(46, 211, 167), c2=(31, 140, 255), seal=(255, 84, 96), line=(222, 230, 238), accent=(31, 160, 220)),   # 민트·블루
    'C': dict(c1=(124, 92, 255), c2=(79, 172, 254), seal=(255, 77, 109), line=(226, 228, 242), accent=(124, 92, 255)),  # 보라·하늘
}

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def draw(S, th, maskable):
    # 그라데이션(대각선) — 작은 그림을 키워서 빠르게
    g = Image.new('RGB', (64, 64))
    px = g.load()
    for y in range(64):
        for x in range(64):
            px[x, y] = lerp(th['c1'], th['c2'], (x + y) / 126)
    im = g.resize((S, S), Image.BICUBIC).convert('RGBA')
    bg = im
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = 0.70 if maskable else 1.0
    u = S * k / 100; o = (S - S * k) / 2
    X = lambda v: o + v * u
    # 영수증(평면, 위 둥근 모서리, 아래 톱니)
    l, r, t, b = X(29), X(71), X(17), X(80)
    rad = 6 * u
    d.rounded_rectangle([l, t, r, b - 6 * u], radius=rad, fill=(255, 255, 255))
    n = 5; w = (r - l) / n; tooth = 4.5 * u; top = b - 6.5 * u
    pts = [(l, top), (r, top), (r, b)]
    for i in range(n):
        pts += [(r - w * (i + 0.5), b - tooth), (r - w * (i + 1), b)]
    d.polygon(pts, fill=(255, 255, 255))
    # 내용: 포인트 굵은 줄 1 + 연한 줄 3 + 합계
    d.rounded_rectangle([X(37), X(27), X(55), X(32)], radius=2.5 * u, fill=th['accent'])
    for y, e in ((40, 63), (47, 58), (54, 61)):
        d.rounded_rectangle([X(37), X(y), X(e), X(y + 3.4)], radius=1.7 * u, fill=th['line'])
    d.rounded_rectangle([X(37), X(63), X(50), X(67)], radius=2 * u, fill=(40, 44, 70))
    # 도장(오른쪽 아래, 테두리 흰 링으로 배경과 분리)
    cx, cy, R = X(70), X(73), 14 * u
    d.ellipse([cx - R - 2.2 * u, cy - R - 2.2 * u, cx + R + 2.2 * u, cy + R + 2.2 * u], fill=(255, 255, 255))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=th['seal'])
    f = ImageFont.truetype(FONT, int(R * 1.05))
    d.text((cx, cy + R * 0.02), '인', font=f, fill=(255, 255, 255), anchor='mm')
    # 그림을 줄여 위로 올리고 아래에 앱 이름
    sc = 0.76
    small = im.resize((int(S * sc), int(S * sc)), Image.LANCZOS)
    bg.alpha_composite(small, (int((S - S * sc) / 2 - 1.5 * u), int(-1.5 * u)))
    im = bg; d = ImageDraw.Draw(im)
    nf = ImageFont.truetype(FONT, int(14.5 * u))
    d.text((S / 2, o + 85 * u), '간이영수증', font=nf, fill=(255, 255, 255), anchor='mm')
    if not maskable:
        m = Image.new('L', (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)
        im.putalpha(m)
    return im

def render(key, out_dir):
    th = THEMES[key]
    for name, size, mask in (('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True)):
        draw(size * 3, th, mask).resize((size, size), Image.LANCZOS).save(f'{out_dir}/{name}', optimize=True)

if WHICH == 'all':
    # 비교용 한 장: 시안 A·B·C 나란히
    sheet = Image.new('RGBA', (3 * 300 + 40, 360), (245, 246, 250, 255))
    sd = ImageDraw.Draw(sheet)
    lab = ImageFont.truetype(FONT, 28)
    for i, key in enumerate('ABC'):
        ic = draw(840, THEMES[key], False).resize((260, 260), Image.LANCZOS)
        sheet.alpha_composite(ic, (20 + i * 300 + 20, 20))
        sd.text((20 + i * 300 + 150, 320), f'시안 {key}', font=lab, fill=(30, 30, 40), anchor='mm')
    sheet.save(f'{OUT}/icon_options.png')
else:
    render(WHICH, OUT)
print('ok')
