#!/usr/bin/env python3
"""Sizes the Flux originals in art/flux/ into the JPGs the game loads from public/assets/tex/."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent.parent
sizes = {'ground': (1024, 1024, 78), 'sky': (2048, 1024, 84), 'poster': (800, 1000, 82)}
out = root / 'public/assets/tex'
out.mkdir(parents=True, exist_ok=True)
for src in sorted((root / 'art/flux').glob('*.jpg')):
    w, h, q = sizes.get(src.stem, (512, 512, 80))
    Image.open(src).convert('RGB').resize((w, h), Image.LANCZOS).save(out / src.name, quality=q, optimize=True)
    print(src.stem, (out / src.name).stat().st_size // 1024, 'KB')
