# -*- coding: utf-8 -*-
import os

# Mojibake -> correct unicode replacements
fixes = [
    ('\u00f0\u009f\u0093\b7', '\U0001F4F7'),   # camera
    ('\u00f0\u009f\u0096\u00bc', '\U0001F5BC'), # picture/library
    ('\u00f0\u009f\u0097\u2019', '\U0001F5D1'), # trash
    ('\u00f0\u009f\u009e', '\U0001F41E'),       # bug
    ('\u00f0\u009f\u0094\u008b', '\U0001F4CB'), # clipboard
    ('\u00f0\u009f\u008c\u00b1', '\U0001F331'), # plant
    ('\u00f0\u009f\u00a0', '\U0001F3E0'),       # house
    ('\u00f0\u009f\u00a2', '\U0001F3E2'),       # building
    ('\u00f0\u009f\u009b\u00b0', '\U0001F6F0'), # satellite
    ('\u00e2\u0080\u00a2', '\u2022'),           # bullet
    ('\u00e2\u0080\u0094', '\u2014'),           # em dash
    ('\u00e2\u0080\u00a6', '\u2026'),           # ellipsis
    ('\u00e2\u009c\u0094', '\u2714'),           # check
    ('\u00e2\u009c\u2014', '\u2717'),           # cross x
    ('\u00e2\u009c\u0095', '\u2715'),           # mult x
    ('\u00c2\u00b0', '\u00B0'),                 # degree
    ('\u00c2\u00b7', '\u00B7'),                 # middle dot
    ('\u00e2\u009a\u00a1', '\u26A1'),           # lightning
    ('&#x1F3A4;', '\U0001F3A4'),               # mic html entity
    ('\u00f0\u009f\u008e\u00a4', '\U0001F3A4'), # mic mojibake
]

root = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src'
count = 0
for dirpath, _, files in os.walk(root):
    for fname in files:
        if not fname.endswith('.tsx') and not fname.endswith('.ts'):
            continue
        fpath = os.path.join(dirpath, fname)
        raw = open(fpath, 'rb').read()
        # Try to decode as latin-1 then re-encode as utf-8 to detect mojibake
        text = raw.decode('utf-8', errors='replace')
        changed = False
        for bad, good in fixes:
            if bad in text:
                text = text.replace(bad, good)
                changed = True
        if changed:
            open(fpath, 'w', encoding='utf-8').write(text)
            print('fixed:', fname)
            count += 1

print(f'Total fixed: {count}')
