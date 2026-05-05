import os

# Final remaining patterns discovered by inspection
byte_fixes = [
    # library picture c3b0 c5b8 e28093 c2bc
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x93\xc2\xbc', '\U0001F5BC'.encode()),
    # library picture c3b0 c5b8 e28093 (shorter)
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x93', '\U0001F5BC'.encode()),
    # plant c3b0 c5b8 e2808c c2b1
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x8c\xc2\xb1', '\U0001F331'.encode()),
    # plant shorter
    (b'\xc3\xb0\xc5\xb8\xc2\xb1', '\U0001F331'.encode()),
    # commercial building
    (b'\xc3\xb0\xc5\xb8\xc2\xa2', '\U0001F3E2'.encode()),
    # house
    (b'\xc3\xb0\xc5\xb8\xc2\xa0', '\U0001F3E0'.encode()),
    # satellite
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x9b\xc2\xb0', '\U0001F6F0'.encode()),
    # lightning bolt
    (b'\xc3\xa2\xc2\x9a\xc2\xa1', '\u26A1'.encode()),
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

# Final check
print('Remaining issues:')
for dirpath, _, files in os.walk(root):
    for fname in files:
        if not fname.endswith('.tsx'): continue
        fpath = os.path.join(dirpath, fname)
        text = open(fpath, encoding='utf-8', errors='replace').read()
        bads = [c for c in ['ðŸ', 'Ã¢', 'âœ', 'â€'] if c in text]
        if bads: print(f'  {fname}: {bads}')
print('done')
