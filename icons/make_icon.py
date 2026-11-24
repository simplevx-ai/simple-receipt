"""간이영수증 앱 아이콘 v2 — 짙은 남색 그라데이션 + 기울어진 흰 영수증 + 빨간 인감 도장."""
import sys, math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1]
FONT = r'C:\Windows\Fonts\malgunbd.ttf'
RED = (210, 38, 52)

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def gradient(S):
    top, bot = (32, 58, 128), (8, 20, 52)
    im = Image.new('RGB', (S, S))
    px = im.load()
    for y in range(S):
        for x in range(S):
            t = min(1, max(0, (x * 0.35 + y) / (S * 1.35)))
            px[x, y] = lerp(top, bot, t)
    return im

def paper(S, u):
    """영수증 종이(아래 톱니) RGBA, 크기 S×S 캔버스에 그림"""
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    l, r, t, b = 30 * u, 70 * u, 16 * u, 80 * u
    n = 6; w = (r - l) / n; tooth = 3.2 * u
    pts = [(l, t), (r, t), (r, b)]
    for i in range(n):
        pts += [(r - w * (i + 0.5), b - tooth), (r - w * (i + 1), b)]
    d.polygon(pts, fill=(255, 255, 255, 255))
    # 제목: 빨간 굵은 줄 + 얇은 줄
    d.rounded_rectangle([40 * u, 24 * u, 60 * u, 27.4 * u], radius=1.7 * u, fill=RED)
    d.rectangle([37 * u, 30.6 * u, 63 * u, 31.4 * u], fill=RED)
    # 내용 줄(회색)
    for i, y in enumerate((39, 46, 53)):
        d.rounded_rectangle([36 * u, y * u, (56 if i != 1 else 52) * u, (y + 2.4) * u], radius=1.2 * u, fill=(196, 203, 216))
        d.rounded_rectangle([59 * u, y * u, 64 * u, (y + 2.4) * u], radius=1.2 * u, fill=(196, 203, 216))
    # 합계 줄
    d.rectangle([36 * u, 60.5 * u, 64 * u, 61.1 * u], fill=(150, 160, 180))
    d.rounded_rectangle([50 * u, 64.5 * u, 64 * u, 68.3 * u], radius=1.9 * u, fill=(24, 38, 80))
    return im

def seal(S, u, cx, cy, R):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=RED)
    rr = R * 0.80
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(255, 255, 255, 255), width=max(2, int(R * 0.07)))
    f = ImageFont.truetype(FONT, int(R * 0.95))
    d.text((cx, cy + R * 0.02), '인', font=f, fill=(255, 255, 255, 255), anchor='mm')
    return im

def draw(S, maskable):
    k = 0.80 if maskable else 1.0
    u = S * k / 100
    off = (S - S * k) / 2
    base = gradient(S).convert('RGBA')
    # 은은한 빛(왼쪽 위)
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-S * 0.3, -S * 0.45, S * 0.75, S * 0.5], fill=(255, 255, 255, 26))
    base = Image.alpha_composite(base, glow.filter(ImageFilter.GaussianBlur(S * 0.08)))
    # 종이: 그림자 → 종이(살짝 기울임)
    p = paper(S, u)
    p = p.transform(p.size, Image.AFFINE, (1, 0, -off, 0, 1, -off))
    p = p.rotate(-8, resample=Image.BICUBIC, center=(S / 2, S / 2))
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); sh.putalpha(p.split()[3].point(lambda a: int(a * 0.45)))
    sh = sh.transform(sh.size, Image.AFFINE, (1, 0, -S * 0.012, 0, 1, -S * 0.03)).filter(ImageFilter.GaussianBlur(S * 0.03))
    base = Image.alpha_composite(base, sh)
    base = Image.alpha_composite(base, p)
    # 도장: 오른쪽 아래, 종이 모서리에 겹치게
    cx, cy, R = off + 68 * u, off + 72 * u, 13.5 * u
    ssh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(ssh).ellipse([cx - R, cy - R + S * 0.015, cx + R, cy + R + S * 0.015], fill=(0, 0, 0, 90))
    base = Image.alpha_composite(base, ssh.filter(ImageFilter.GaussianBlur(S * 0.02)))
    base = Image.alpha_composite(base, seal(S, u, cx, cy, R))
    if not maskable:  # 둥근 모서리 아이콘
        m = Image.new('L', (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)
        base.putalpha(m)
    return base

for name, size, mask in (('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True)):
    draw(size * 3, mask).resize((size, size), Image.LANCZOS).save(f'{OUT}/{name}', optimize=True)
print('ok')
