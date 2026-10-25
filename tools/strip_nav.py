"""Verwijdert de navigatieknoppen (blauwe cirkels met gele, rode of groene pijl, met de tekst
"Antwoord gevonden? Naar de uitwerking" / "Terug naar de opgave" / "Naar de volgende opgave")
en een losse voettekst (©-regel + paginanummer) uit de vraag- en uitwerkingsafbeeldingen.

Gebruik (overschrijft de bestanden):
  python tools/strip_nav.py img/hs4/*.webp
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

PAD = 12


def find_icons(a):
    """Kaders (y0, y1, x1) van elk navigatie-icoon: blauwe cirkel met gele, rode of groene pijl."""
    r, g, b = (a[..., i].astype(int) for i in range(3))
    blue = (b > 140) & (r < 100) & (g < 100)
    arrow = (((r > 170) & (g > 150) & (b < 100))             # geel
             | ((r > 170) & (g < 100) & (b < 100))            # rood
             | ((g > 150) & (r < 130) & (b < 200) & (g > b)))  # groen/cyaan
    lab, n = ndimage.label(ndimage.binary_dilation(blue | arrow, iterations=2))
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if not (25 <= h <= 90 and 25 <= w <= 90 and abs(h - w) < 0.3 * max(h, w)):
            continue
        comp = lab[sl] == i
        area = h * w
        nb, na = (blue[sl] & comp).sum(), (arrow[sl] & comp).sum()
        if nb > 0.2 * area and na > 0.06 * area and (nb + na) > 0.45 * area:
            boxes.append((sl[0].start, sl[0].stop, sl[1].stop))
    return boxes


def footer_cut(a):
    """Voettekst (©-regel + paginanummer): laag blok onderaan na een grote witruimte."""
    ys = np.where((a.min(axis=2) < 235).any(axis=1))[0]
    if len(ys) < 2:
        return None
    gaps = np.where(np.diff(ys) > 120)[0]
    if len(gaps) and ys[-1] - ys[gaps[-1] + 1] < 70:
        return ys[gaps[-1]] + 1
    return None


def crop_white(im):
    m = np.asarray(im).min(axis=2) < 235
    ys, xs = np.where(m.any(axis=1))[0], np.where(m.any(axis=0))[0]
    return im.crop((max(0, xs[0] - PAD), max(0, ys[0] - PAD),
                    min(im.width, xs[-1] + 1 + PAD), min(im.height, ys[-1] + 1 + PAD)))


def clean(src, dst):
    im = Image.open(src).convert('RGB')
    a = np.array(im)
    boxes = find_icons(a)
    # navigatieregel (tekst links van/tussen de iconen + iconen) wit maken
    for y0, y1, x1 in boxes:
        a[max(0, y0 - 4):y1 + 4, :min(a.shape[1], x1 + 6)] = 255
    fc = footer_cut(a)
    if fc:
        a[fc:] = 255
    if not boxes and not fc:
        return False
    out = crop_white(Image.fromarray(a))
    out.save(dst, 'WEBP', quality=82, method=6)
    return True


if __name__ == '__main__':
    changed = 0
    for p in sys.argv[1:]:
        if clean(p, p):
            changed += 1
        else:
            print('unchanged', p)
    print('changed', changed, 'of', len(sys.argv) - 1, file=sys.stderr)
