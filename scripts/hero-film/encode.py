"""Joins the rendered frames into the hero film: an animated WebP that loops,
as on the ZELab sign-in, and a poster (the first frame) that shows at once.

    python3 encode.py FRAMES_DIR FILM.webp POSTER.webp MS_PER_FRAME
"""
import os, sys
from PIL import Image

frames_dir, film, poster, ms = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
names = sorted(n for n in os.listdir(frames_dir) if n.endswith(".png"))
frames = [Image.open(os.path.join(frames_dir, n)).convert("RGB") for n in names]
frames[0].save(poster, "WEBP", quality=78, method=6)
frames[0].save(film, "WEBP", save_all=True, append_images=frames[1:], duration=ms, loop=0, quality=66, method=4, minimize_size=True, allow_mixed=True)
print(f"{len(frames)} frames -> {film} ({os.path.getsize(film) / 1e6:.1f} MB), poster {os.path.getsize(poster) / 1e3:.0f} KB")
