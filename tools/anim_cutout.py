"""Cut the white background out of every frame of an animated WebP and
re-encode it as a smaller animated WebP with transparency.
Usage: python3 anim_cutout.py SRC.webp FRAMES_DIR [width]  (writes PNG frames)"""
import sys
import numpy as np
from PIL import Image, ImageSequence
from scipy import ndimage as ndi

WHITE = 253.0


def mask_frame(a):
    mn, mx = a.min(2), a.max(2)
    paper = (mn > 232) & ((mx - mn) < 18)
    H, W = paper.shape
    ink = ndi.binary_opening(~paper, iterations=1)
    rows = np.arange(H)[:, None]
    ylow = np.where(ink.any(0), (ink * rows).max(0), -1)
    floor = ndi.maximum_filter1d(ylow, size=max(9, W // 60))
    floor = np.where(floor < 0, H, floor)
    below = rows > floor[None, :]
    lab, _ = ndi.label(paper & ~below)
    border = np.unique(np.concatenate([lab[0], lab[:, 0], lab[:, -1]]))
    border = border[border > 0]
    return np.isin(lab, border) | below


def cut(a):
    bg = mask_frame(a)
    dist = ndi.distance_transform_edt(~bg)
    band = (dist > 0) & (dist <= 2)
    darkness = (WHITE - a).max(2).clip(0, WHITE) / 120.0
    alpha = np.ones(bg.shape, np.float32)
    alpha[bg] = 0
    alpha[band] = np.clip(darkness[band], 0, 1)
    rgb = a.copy()
    m = band & (alpha > 0.02)
    am = alpha[m][:, None]
    rgb[m] = np.clip((a[m] - WHITE * (1 - am)) / am, 0, 255)
    return rgb, alpha


src, out = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 720
im = Image.open(src)
dur = im.info.get("duration", 41)
frames = []
for fr in ImageSequence.Iterator(im):
    f = fr.convert("RGB").resize((width, width), Image.LANCZOS)
    frames.append(np.asarray(f).astype(np.float32))

cut_frames = [cut(a) for a in frames]
# one crop box and one bottom fade for the whole loop so nothing jumps
alive = np.zeros(cut_frames[0][1].shape, bool)
for _, al in cut_frames:
    alive |= al > 0.03
ys, xs = np.where(alive)
top, bot, left, right = ys.min(), ys.max(), xs.min(), xs.max()
fade = int((bot - top) * 0.10)
rows = np.arange(alive.shape[0])
ramp = (np.clip((bot - rows) / max(fade, 1), 0, 1) ** 1.2)[:, None]

out_frames = []
for rgb, al in cut_frames:
    rgba = np.dstack([rgb, al * ramp * 255]).astype(np.uint8)
    out_frames.append(Image.fromarray(rgba, "RGBA").crop((left, top, right + 1, bot + 1)))

import os
os.makedirs(out, exist_ok=True)
for k, f in enumerate(out_frames):
    f.save(f"{out}/{k:03d}.png", compress_level=1)
print(out, out_frames[0].size, len(out_frames), "frames", dur)
