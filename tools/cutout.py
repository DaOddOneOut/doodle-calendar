"""Remove the white paper background from each illustration, keeping white
areas that are enclosed by line work (dresses, scarves, sweaters).
Usage: python3 cutout.py SRC_DIR OUT_DIR"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, out = sys.argv[1], sys.argv[2]

for i in range(1, 13):
    im = Image.open(f"{src}/{i:02d}.png").convert("RGB")
    a = np.asarray(im).astype(np.float32)
    mn = a.min(2)
    mx = a.max(2)
    # near-white paper: bright and unsaturated
    paper = (mn > 232) & ((mx - mn) < 18)
    H, W = paper.shape
    # Garments often fade out at the bottom with no closing outline, so a plain
    # flood fill leaks up into them. Build a "floor" under the art from the
    # lowest ink in each column (widened), and only flood above it.
    ink = ~paper
    ink = ndi.binary_opening(ink, iterations=1)
    rows = np.arange(H)[:, None]
    ylow = np.where(ink.any(0), (ink * rows).max(0), -1)
    floor = ndi.maximum_filter1d(ylow, size=int(sys.argv[3]) if len(sys.argv)>3 else 21)
    floor = np.where(floor < 0, H, floor)
    below = rows > floor[None, :]
    lab, n = ndi.label(paper & ~below)
    border = np.unique(np.concatenate([lab[0], lab[:, 0], lab[:, -1]]))
    border = border[border > 0]
    bg = np.isin(lab, border) | below
    # remove tiny enclosed specks that are pure paper (e.g. inside sparkles) only if very small? keep them.
    # soft edge band: pixels within 3px of background
    dist = ndi.distance_transform_edt(~bg)
    band = (dist > 0) & (dist <= 3)
    # alpha from "whiteness": how far a pixel is from paper white
    white = 253.0
    darkness = (white - a).max(2).clip(0, white) / 120.0  # 0 = paper, 1 = clearly ink/color
    alpha = np.ones(mn.shape, np.float32)
    alpha[bg] = 0
    alpha[band] = np.clip(darkness[band], 0, 1)
    # un-blend white from edge pixels so no white halo
    rgb = a.copy()
    m = band & (alpha > 0.02)
    am = alpha[m][:, None]
    rgb[m] = np.clip((a[m] - white * (1 - am)) / am, 0, 255)
    # gentle fade at the bottom of the art so cut-off garments dissolve
    ys = np.where(~bg.all(1))[0]
    top, bot = ys.min(), ys.max()
    fade = int((bot - top) * 0.10)
    ramp = np.clip((bot - rows[:, 0]) / max(fade, 1), 0, 1) ** 1.2
    alpha = alpha * ramp[:, None]
    rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")
    bbox = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    img = img.crop(bbox)
    img.save(f"{out}/{i:02d}.png", optimize=True)
    print(i, img.size, f"bg removed {bg.mean():.0%}")
