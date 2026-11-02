# 產生程式圖示：小柯機器人＋三欄看板（待辦／進行中／完成）與完成勾勾
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024


def layer():
    return Image.new('RGBA', (S, S), (0, 0, 0, 0))


def gradient():
    g = Image.new('RGBA', (S, S))
    px = g.load()
    a, b = (30, 64, 175), (13, 148, 136)
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * S)
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)
    return g


def shadow(src, blur=20, alpha=0.4):
    a = src.split()[3].filter(ImageFilter.GaussianBlur(blur)).point(lambda p: p * alpha)
    return Image.merge('RGBA', (*[Image.new('L', (S, S), 0)] * 3, a))


# 圓角漸層底
mask = layer()
ImageDraw.Draw(mask).rounded_rectangle((36, 36, 988, 988), 200, fill=(255, 255, 255, 255))
img = layer()
img.paste(gradient(), (0, 0), mask)

# 看板白板
board = layer()
d = ImageDraw.Draw(board)
d.rounded_rectangle((110, 130, 914, 700), 60, fill=(245, 249, 255, 255))
cols = [
    (150, (148, 163, 184), [(252, 211, 77), (252, 211, 77)]),
    (398, (59, 130, 246), [(96, 165, 250), (96, 165, 250), (96, 165, 250)]),
    (646, (34, 197, 94), [(74, 222, 128)]),
]
for x, head, cards in cols:
    d.rounded_rectangle((x, 170, x + 228, 660), 32, fill=(226, 234, 246, 255))
    d.rounded_rectangle((x + 24, 192, x + 204, 226), 17, fill=head + (255,))
    y = 250
    for c in cards:
        d.rounded_rectangle((x + 20, y, x + 208, y + 110), 22, fill=c + (255,))
        d.rounded_rectangle((x + 42, y + 28, x + 186, y + 48), 10, fill=(255, 255, 255, 215))
        d.rounded_rectangle((x + 42, y + 62, x + 140, y + 80), 9, fill=(255, 255, 255, 150))
        y += 128
img = Image.alpha_composite(img, shadow(board, 26, 0.35))
img = Image.alpha_composite(img, board)

# 完成勾勾
ck = layer()
c = ImageDraw.Draw(ck)
c.ellipse((734, 360, 884, 510), fill=(22, 163, 74, 255), outline=(255, 255, 255, 255), width=12)
c.line((772, 436, 802, 468, 850, 402), fill=(255, 255, 255, 255), width=24, joint='curve')
img = Image.alpha_composite(img, ck)

# 小柯機器人（頭盔造型）
rb = layer()
r = ImageDraw.Draw(rb)
cx, cy = 320, 690
r.line((cx, cy - 256, cx, cy - 196), fill=(90, 100, 120, 255), width=20)
r.ellipse((cx - 38, cy - 300, cx + 38, cy - 224), fill=(255, 196, 40, 255))
r.rounded_rectangle((cx - 272, cy - 74, cx - 216, cy + 84), 24, fill=(40, 120, 220, 255))
r.rounded_rectangle((cx + 216, cy - 74, cx + 272, cy + 84), 24, fill=(40, 120, 220, 255))
r.ellipse((cx - 240, cy - 216, cx + 240, cy + 228), fill=(70, 150, 240, 255))
r.ellipse((cx - 222, cy - 202, cx + 222, cy + 208), fill=(240, 246, 255, 255))
r.rounded_rectangle((cx - 178, cy - 114, cx + 178, cy + 94), 94, fill=(24, 36, 64, 255))
for ex in (cx - 76, cx + 76):
    r.arc((ex - 48, cy - 54, ex + 48, cy + 30), 200, 340, fill=(90, 230, 255, 255), width=24)
r.arc((cx - 54, cy + 8, cx + 54, cy + 72), 20, 160, fill=(90, 230, 255, 255), width=15)
r.ellipse((cx - 168, cy + 40, cx - 114, cy + 82), fill=(255, 140, 160, 200))
r.ellipse((cx + 114, cy + 40, cx + 168, cy + 82), fill=(255, 140, 160, 200))
img = Image.alpha_composite(img, shadow(rb, 24, 0.5))
img = Image.alpha_composite(img, rb)

out = os.path.join(ROOT, 'build')
os.makedirs(out, exist_ok=True)
img.save(os.path.join(out, 'icon.png'))
img.save(os.path.join(out, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# 畫面內用的小圖示
ui = os.path.join(ROOT, 'src', 'app', 'img')
os.makedirs(ui, exist_ok=True)
img.resize((64, 64), Image.LANCZOS).save(os.path.join(ui, 'logo64.png'))
img.resize((192, 192), Image.LANCZOS).save(os.path.join(ui, 'logo192.png'))
head = layer()
head = Image.alpha_composite(head, rb).crop((cx - 290, cy - 310, cx + 290, cy + 270))
head.resize((96, 96), Image.LANCZOS).save(os.path.join(ui, 'robot96.png'))
print('icon ok')
