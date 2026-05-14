#!/usr/bin/env python3
"""
Generate moonar app icons.

Outputs:
  icons/icon-192.png            (purpose: any, rounded corners)
  icons/icon-512.png            (purpose: any, rounded corners)
  icons/icon-maskable-192.png   (purpose: maskable, full-bleed)
  icons/icon-maskable-512.png   (purpose: maskable, full-bleed)
  icons/icon-180.png            (apple-touch-icon)

Palette: Carbon Black bg (#212529), Pale Slate moon (#CED4DA),
gray crater overlays (#ADB5BD).

Run from project root:
    python3 scripts/build-icons.py
"""
from PIL import Image, ImageDraw
from pathlib import Path

BG      = (33, 37, 41, 255)     # #212529
MOON    = (206, 212, 218, 255)  # #CED4DA
CRATER  = (173, 181, 189)       # #ADB5BD (RGB; alpha added per crater)

# Crater layout: relative to moon center, fraction of moon radius.
# (rel_x, rel_y, rel_radius, alpha_0_255)
CRATERS = [
    (-0.28, -0.25, 0.18, 100),
    ( 0.28,  0.12, 0.13,  80),
    (-0.10,  0.30, 0.10,  70),
]

OUT = Path(__file__).resolve().parent.parent / "icons"


def make_icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)

    cx = cy = size // 2
    # Maskable: keep content inside the 80% safe zone (radius 0.40·size)
    moon_pct = 0.32 if maskable else 0.36
    r = int(size * moon_pct)

    # Moon disk
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=MOON)

    # Crater overlay layer (composited for proper alpha blending)
    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    for rx, ry, rr, alpha in CRATERS:
        ox = int(rx * r)
        oy = int(ry * r)
        cr = max(1, int(rr * r))
        odraw.ellipse(
            [cx + ox - cr, cy + oy - cr, cx + ox + cr, cy + oy + cr],
            fill=(*CRATER, alpha),
        )
    img = Image.alpha_composite(img, overlay)

    if not maskable:
        # Apply rounded-rect mask for "any" purpose icons
        radius = int(size * 0.18)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, size - 1, size - 1], radius=radius, fill=255
        )
        img.putalpha(mask)

    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = [
        (192, False, "icon-192.png"),
        (512, False, "icon-512.png"),
        (192, True,  "icon-maskable-192.png"),
        (512, True,  "icon-maskable-512.png"),
        (180, False, "icon-180.png"),
    ]
    for size, maskable, name in targets:
        img = make_icon(size, maskable=maskable)
        path = OUT / name
        img.save(path, optimize=True)
        print(f"  wrote {path.relative_to(OUT.parent)}  ({size}×{size})")
    print("done.")


if __name__ == "__main__":
    main()
