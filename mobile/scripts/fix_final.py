import os

byte_fixes = [
    # camera emoji: c3b0 c5b8 e2809c c2b7
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x9c\xc2\xb7', '\U0001F4F7'.encode()),
    # library/picture emoji: c3b0 c5b8 e280 96c2bc  
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x96\xc2\xbc', '\U0001F5BC'.encode()),
    # mult x / remove: c3a2 c593 e280a2
    (b'\xc3\xa2\xc5\x93\xe2\x80\xa2', '\u2715'.encode()),
    # plant emoji
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x8c\xc2\xb1', '\U0001F331'.encode()),
    # house emoji: c3b0 c5b8 c2a0
    (b'\xc3\xb0\xc5\xb8\xc2\xa0', '\U0001F3E0'.encode()),
    # building emoji: c3b0 c5b8 c2a2
    (b'\xc3\xb0\xc5\xb8\xc2\xa2', '\U0001F3E2'.encode()),
    # em dash in text: c3a2 e282ac e2809c
    (b'\xc3\xa2\xe2\x82\xac\xe2\x80\x9c', '\u2014'.encode()),
    # em dash variant
    (b'\xc3\xa2\xe2\x82\xac\xe2\x80\x94', '\u2014'.encode()),
]

root = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src'
for dirpath, _, files in os.walk(root):
    for fname in files:
        if not fname.endswith(('.tsx', '.ts')): continue
        fpath = os.path.join(dirpath, fname)
        raw = open(fpath, 'rb').read()
        orig = raw
        for bad, good in byte_fixes:
            raw = raw.replace(bad, good)
        if raw != orig:
            open(fpath, 'wb').write(raw)
            print('fixed:', fname)

print('done - checking remaining:')
for dirpath, _, files in os.walk(root):
    for fname in files:
        if not fname.endswith('.tsx'): continue
        fpath = os.path.join(dirpath, fname)
        text = open(fpath, encoding='utf-8', errors='replace').read()
        bads = [c for c in ['ðŸ', 'Ã¢', 'âœ', 'â€'] if c in text]
        if bads: print(f'  still bad: {fname} -> {bads}')
