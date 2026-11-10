#!/usr/bin/env python3
"""Draw the Hold'em Royale launcher icon: two ace cards on an emerald table."""
import math
import os
import subprocess
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_PATH = os.path.join(ROOT, "tools", "DisplaySerif.ttf")
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf"


def font(size):
    try:
        from PIL import ImageFont
        if not os.path.exists(FONT_PATH):
            subprocess.run(["curl", "-fsSL", "-o", FONT_PATH, FONT_URL], check=True)
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return None


def pip(d, kind, cx, cy, s, color):
    r = s * 0.26
    if kind == "diamond":
        d.polygon([(cx, cy - s * 0.6), (cx + s * 0.42, cy), (cx, cy + s * 0.6), (cx - s * 0.42, cy)], fill=color)
    elif kind == "heart":
        d.ellipse([cx - s * 0.58, cy - s * 0.52, cx - s * 0.06, cy], fill=color)
        d.ellipse([cx + s * 0.06, cy - s * 0.52, cx + s * 0.58, cy], fill=color)
        d.polygon([(cx - s * 0.58, cy - s * 0.22), (cx + s * 0.58, cy - s * 0.22), (cx, cy + s * 0.6)], fill=color)
    elif kind == "spade":
        d.ellipse([cx - s * 0.56, cy - s * 0.34, cx - s * 0.02, cy + s * 0.2], fill=color)
        d.ellipse([cx + s * 0.02, cy - s * 0.34, cx + s * 0.56, cy + s * 0.2], fill=color)
        d.polygon([(cx - s * 0.56, cy - s * 0.06), (cx + s * 0.56, cy - s * 0.06), (cx, cy - s * 0.66)], fill=color)
        d.polygon([(cx - s * 0.09, cy + s * 0.1), (cx + s * 0.09, cy + s * 0.1),
                   (cx + s * 0.24, cy + s * 0.62), (cx - s * 0.24, cy + s * 0.62)], fill=color)
    elif kind == "club":
        d.ellipse([cx - s * 0.30, cy - s * 0.66, cx + s * 0.30, cy - s * 0.06], fill=color)
        d.ellipse([cx - s * 0.62, cy - s * 0.24, cx - s * 0.02, cy + s * 0.36], fill=color)
        d.ellipse([cx + s * 0.02, cy - s * 0.24, cx + s * 0.62, cy + s * 0.36], fill=color)
        d.polygon([(cx - s * 0.09, cy + s * 0.06), (cx + s * 0.09, cy + s * 0.06),
                   (cx + s * 0.24, cy + s * 0.62), (cx - s * 0.24, cy + s * 0.62)], fill=color)


def card(size, suit, rank, ink, radius=0.10):
    w, h = size
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([1, 1, w - 2, h - 2], radius=int(w * radius),
                        fill=(252, 249, 240, 255), outline=(120, 110, 92, 90), width=max(1, w // 90))
    d.rounded_rectangle([int(w * 0.045), int(w * 0.045), w - int(w * 0.045), h - int(w * 0.045)],
                        radius=int(w * radius * 0.7), outline=(0, 0, 0, 18), width=max(1, w // 160))
    f = font(int(h * 0.22))
    if f:
        d.text((w * 0.075, h * 0.035), rank, font=f, fill=ink)
    pip(d, suit, w * 0.62, h * 0.63, min(w, h) * 0.44, ink)
    return im


def shadowed(img, blur, alpha=150):
    pad = int(blur * 2)
    big = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    big.alpha_composite(img, (pad, pad))
    sil = Image.new("RGBA", big.size, (0, 0, 0, 0))
    sil.putalpha(big.split()[3].point(lambda v: int(v * alpha / 255)))
    shadow = sil.filter(ImageFilter.GaussianBlur(blur))
    return shadow, big


def build_full(ss=1600):
    # rounded emerald table
    bg = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    grad = Image.new("RGBA", (1, ss))
    top = (28, 96, 72)
    bot = (6, 28, 21)
    for y in range(ss):
        t = y / (ss - 1)
        e = t ** 0.85
        grad.putpixel((0, y), (
            int(top[0] + (bot[0] - top[0]) * e),
            int(top[1] + (bot[1] - top[1]) * e),
            int(top[2] + (bot[2] - top[2]) * e), 255))
    grad = grad.resize((ss, ss))
    mask = Image.new("L", (ss, ss), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, ss - 1, ss - 1], radius=int(ss * 0.225), fill=255)
    bg.paste(grad, (0, 0), mask)

    # light pool
    glow = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([ss * 0.05, -ss * 0.12, ss * 0.95, ss * 0.72], fill=(255, 255, 255, 30))
    glow = glow.filter(ImageFilter.GaussianBlur(ss * 0.08))
    glow.putalpha(Image.composite(glow.split()[3], Image.new("L", (ss, ss), 0), mask))
    bg = Image.alpha_composite(bg, glow)

    d = ImageDraw.Draw(bg)
    inset = int(ss * 0.055)
    d.rounded_rectangle([inset, inset, ss - inset, ss - inset], radius=int(ss * 0.175),
                        outline=(226, 189, 119, 150), width=max(2, int(ss * 0.006)))
    inner = int(ss * 0.083)
    d.rounded_rectangle([inner, inner, ss - inner, ss - inner], radius=int(ss * 0.155),
                        outline=(226, 189, 119, 45), width=max(1, int(ss * 0.0025)))

    cw, ch = int(ss * 0.315), int(ss * 0.44)
    c1 = card((cw, ch), "spade", "A", (26, 31, 27, 255)).rotate(-13, expand=True, resample=Image.BICUBIC)
    c2 = card((cw, ch), "heart", "A", (176, 51, 42, 255)).rotate(13, expand=True, resample=Image.BICUBIC)

    for img, pos in ((c1, (int(ss * 0.135), int(ss * 0.335))), (c2, (int(ss * 0.415), int(ss * 0.30)))):
        sh, big = shadowed(img, int(ss * 0.018), 170)
        bg.alpha_composite(sh, (pos[0] - int(ss * 0.018), pos[1] - int(ss * 0.018)))
        bg.alpha_composite(img, pos)

    # gold spade seal under the cards
    seal_y = int(ss * 0.845)
    d = ImageDraw.Draw(bg)
    d.ellipse([ss * 0.5 - ss * 0.055, seal_y - ss * 0.055, ss * 0.5 + ss * 0.055, seal_y + ss * 0.055],
              fill=(10, 24, 19, 190), outline=(226, 189, 119, 130), width=max(1, int(ss * 0.003)))
    pip(d, "spade", ss * 0.5, seal_y + ss * 0.004, ss * 0.062, (232, 197, 129, 255))
    return bg


def build_foreground(ss=1080):
    fg = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    cw, ch = int(ss * 0.30), int(ss * 0.42)
    c1 = card((cw, ch), "spade", "A", (26, 31, 27, 255)).rotate(-13, expand=True, resample=Image.BICUBIC)
    c2 = card((cw, ch), "heart", "A", (176, 51, 42, 255)).rotate(13, expand=True, resample=Image.BICUBIC)
    for img, pos in ((c1, (int(ss * 0.17), int(ss * 0.35))), (c2, (int(ss * 0.42), int(ss * 0.32)))):
        sh, big = shadowed(img, int(ss * 0.014), 150)
        fg.alpha_composite(sh, (pos[0] - int(ss * 0.014), pos[1] - int(ss * 0.014)))
        fg.alpha_composite(img, pos)
    return fg


def save(img, size, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path, "PNG")
    print("wrote", os.path.relpath(path, ROOT), size)


def main():
    full = build_full()
    www = os.path.join(ROOT, "www")
    save(full, 512, os.path.join(www, "icon-512.png"))
    save(full, 192, os.path.join(www, "icon-192.png"))

    res = os.path.join(ROOT, "android", "app", "src", "main", "res")
    for dpi, size in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
        save(full, size, os.path.join(res, "mipmap-" + dpi, "ic_launcher.png"))
        save(full, size, os.path.join(res, "mipmap-" + dpi, "ic_launcher_round.png"))
    fg = build_foreground()
    os.makedirs(os.path.join(res, "drawable"), exist_ok=True)
    fg.resize((432, 432), Image.LANCZOS).save(os.path.join(res, "drawable", "ic_launcher_foreground.png"), "PNG")
    print("wrote drawable/ic_launcher_foreground.png")


if __name__ == "__main__":
    main()
