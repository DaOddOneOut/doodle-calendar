#!/usr/bin/env bash
# Turn an animated WebP on a white background into the app's transparent WebM.
# Usage: tools/make_anim.sh path/to/source.webp 04   (04 = April)
set -e
src=$1; m=$2; tmp=$(mktemp -d)
python3 "$(dirname "$0")/anim_cutout.py" "$src" "$tmp" 720
ffmpeg -y -loglevel error -framerate 24 -i "$tmp/%03d.png" -c:v libvpx-vp9 -pix_fmt yuva420p \
  -b:v 0 -crf 38 -row-mt 1 -deadline good -cpu-used 4 -auto-alt-ref 0 "web/art/anim/$m.webm"
rm -rf "$tmp"; echo "wrote web/art/anim/$m.webm"
