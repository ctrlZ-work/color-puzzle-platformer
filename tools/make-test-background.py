"""Makes the M3 test background pair (issue 3.2): a simple color landscape and its black-and-white
version, derived from the color one so the two line up exactly. This only proves the fade technique;
the real background tool and style are chosen in issues 5.1 and 5.2.
Run: python3 tools/make-test-background.py   (needs Pillow)"""
import math
from PIL import Image, ImageDraw, ImageFilter

W, H = 480, 272
img = Image.new('RGB', (W, H))
d = ImageDraw.Draw(img)
for y in range(H):  # sky gradient
    t = y / H
    d.line([(0, y), (W, y)], fill=(int(120 + 100 * t), int(170 + 60 * t), int(235 - 20 * t)))
d.ellipse([370, 30, 420, 80], fill=(255, 214, 102))  # sun
def hills(base, amp, freq, phase, color):
    pts = [(x, base - amp * math.sin(x * freq + phase)) for x in range(0, W + 1, 4)]
    d.polygon(pts + [(W, H), (0, H)], fill=color)
hills(170, 22, 0.012, 0.5, (96, 160, 120))
hills(190, 16, 0.02, 2.0, (70, 140, 90))
for x in (40, 110, 300, 345):  # a few trees
    d.rectangle([x - 2, 150, x + 2, 175], fill=(110, 80, 50))
    d.ellipse([x - 12, 125, x + 12, 155], fill=(50, 120, 70))
img = img.filter(ImageFilter.SMOOTH)
img.save('public/assets/backgrounds/proto-bg.png')
img.convert('L').convert('RGB').save('public/assets/backgrounds/proto-bg-bw.png')
print('wrote public/assets/backgrounds/proto-bg.png and proto-bg-bw.png')
