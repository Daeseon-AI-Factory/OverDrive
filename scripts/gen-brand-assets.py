from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "assets" / "images"
IOS_SPLASH = ROOT / "ios" / "OverDrive" / "Images.xcassets" / "SplashScreenLogo.imageset"

BG = (8, 16, 23, 255)
CYAN = (56, 245, 213, 255)
BLUE = (89, 139, 255, 255)
MAGENTA = (255, 79, 216, 255)
GOLD = (248, 211, 93, 255)
WHITE = (245, 251, 255, 255)


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def gradient(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    pix = img.load()
    cx, cy = size * 0.48, size * 0.38
    for y in range(size):
        for x in range(size):
            dx = (x - cx) / size
            dy = (y - cy) / size
            d = min(1.0, (dx * dx + dy * dy) ** 0.5 * 2.0)
            t = min(1.0, max(0.0, (x + y) / (size * 1.7)))
            base = (
                lerp(10, 18, t),
                lerp(20, 33, t),
                lerp(31, 44, t),
                255,
            )
            glow = (
                lerp(CYAN[0], MAGENTA[0], t),
                lerp(CYAN[1], MAGENTA[1], t),
                lerp(CYAN[2], MAGENTA[2], t),
                255,
            )
            a = max(0.0, 1.0 - d) * 0.55
            pix[x, y] = (
                lerp(base[0], glow[0], a),
                lerp(base[1], glow[1], a),
                lerp(base[2], glow[2], a),
                255,
            )
    return img


def draw_mark(size: int, background: bool) -> Image.Image:
    scale = size / 1024
    img = gradient(size) if background else Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")

    def p(points):
        return [(round(x * scale), round(y * scale)) for x, y in points]

    # soft bloom
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow, "RGBA")
    gd.polygon(p([(512, 136), (602, 276), (858, 360), (700, 442), (596, 676), (480, 516), (312, 406), (420, 292)]), fill=(56, 245, 213, 92))
    glow = glow.filter(ImageFilter.GaussianBlur(round(34 * scale)))
    img.alpha_composite(glow)

    petals = [
        ([(512, 168), (590, 280), (844, 374), (672, 444), (590, 648), (548, 532), (464, 448), (334, 394), (412, 354), (470, 282)], CYAN),
        ([(590, 280), (844, 374), (672, 444), (590, 648), (564, 468)], MAGENTA),
        ([(334, 394), (470, 282), (512, 168), (520, 410), (464, 448)], BLUE),
    ]
    for points, color in petals:
        draw.polygon(p(points), fill=color)

    draw.line(p([(184, 250), (276, 288)]), fill=CYAN, width=round(28 * scale), joint="curve")
    draw.line(p([(770, 256), (682, 298)]), fill=MAGENTA, width=round(28 * scale), joint="curve")
    draw.line(p([(814, 704), (734, 654)]), fill=GOLD, width=round(28 * scale), joint="curve")

    # R body, vector-friendly and readable at small sizes.
    draw.rounded_rectangle([round(238 * scale), round(286 * scale), round(356 * scale), round(722 * scale)], radius=round(18 * scale), fill=WHITE)
    draw.rounded_rectangle([round(326 * scale), round(286 * scale), round(522 * scale), round(386 * scale)], radius=round(18 * scale), fill=WHITE)
    draw.rounded_rectangle([round(326 * scale), round(482 * scale), round(522 * scale), round(580 * scale)], radius=round(18 * scale), fill=WHITE)
    draw.rounded_rectangle([round(494 * scale), round(286 * scale), round(680 * scale), round(580 * scale)], radius=round(96 * scale), outline=WHITE, width=round(96 * scale))
    draw.polygon(p([(492, 560), (616, 560), (724, 722), (582, 722)]), fill=WHITE)
    draw.rounded_rectangle([round(356 * scale), round(386 * scale), round(538 * scale), round(482 * scale)], radius=round(14 * scale), fill=BG if background else (8, 16, 23, 220))
    draw.line(p([(222, 756), (716, 756)]), fill=MAGENTA, width=round(34 * scale))
    return img


def save_icon(path: Path, size: int) -> None:
    draw_mark(size, True).save(path)


def save_foreground(path: Path, size: int, monochrome: bool = False) -> None:
    mark = draw_mark(size, False)
    if monochrome:
        alpha = mark.getchannel("A")
        out = Image.new("RGBA", (size, size), (255, 255, 255, 0))
        out.putalpha(alpha)
        out.save(path)
    else:
        mark.save(path)


def save_splash(path: Path) -> None:
    size = 640
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mark = draw_mark(420, False)
    img.alpha_composite(mark, ((size - 420) // 2, 52))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 58)
    except OSError:
        font = ImageFont.load_default()
    text = "REPLOOM"
    bbox = draw.textbbox((0, 0), text, font=font)
    x = (size - (bbox[2] - bbox[0])) // 2
    draw.text((x, 486), text, font=font, fill=WHITE)
    img.save(path)


def main() -> None:
    IMAGES.mkdir(parents=True, exist_ok=True)
    IOS_SPLASH.mkdir(parents=True, exist_ok=True)
    save_icon(IMAGES / "icon.png", 1024)
    save_foreground(IMAGES / "android-icon-foreground.png", 512)
    save_icon(IMAGES / "android-icon-background.png", 512)
    save_foreground(IMAGES / "android-icon-monochrome.png", 512, monochrome=True)
    save_splash(IMAGES / "splash-icon.png")
    save_splash(IOS_SPLASH / "splash-icon.png")

    favicon = draw_mark(256, True)
    favicon.save(IMAGES / "favicon.png")
    (IMAGES / "logo-glow.png").write_bytes((IMAGES / "icon.png").read_bytes())


if __name__ == "__main__":
    main()
