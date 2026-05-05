import os

# All known bad byte sequences -> correct UTF-8 bytes
byte_fixes = [
    (b'\xc3\xa2\xc5\x93\xe2\x80\x9c', '\u2714'.encode()),   # checkmark
    (b'\xc3\xa2\xc5\x93\xe2\x80\x94', '\u2717'.encode()),   # ballot x
    (b'\xc3\xa2\xc5\x93\xe2\x80\x95', '\u2715'.encode()),   # mult x
    (b'\xc3\xa2\xe2\x82\xac\xe2\x80\x9d', '\u2013'.encode()),# en dash (N/A)
    (b'\xc3\xa2\xe2\x82\xac\xe2\x80\x94', '\u2014'.encode()),# em dash
    (b'\xc3\xa2\xe2\x82\xac\xc2\xa6', '\u2026'.encode()),   # ellipsis
    (b'\xc3\xa2\xe2\x82\xac\xc2\xa2', '\u2022'.encode()),   # bullet
    (b'\xc3\x82\xc2\xb0', b'\xc2\xb0'),                     # degree
    (b'\xc3\x82\xc2\xb7', b'\xc2\xb7'),                     # middle dot
    # camera emoji double-encoded
    (b'\xc3\xb0\xc2\x9f\xc2\x93\xc2\xb7', '\U0001F4F7'.encode()),  # camera
    (b'\xc3\xb0\xc2\x9f\xc2\x96\xc2\xbc', '\U0001F5BC'.encode()),  # picture
    (b'\xc3\xb0\xc2\x9f\xc2\x8c\xc2\xb1', '\U0001F331'.encode()),  # plant
    (b'\xc3\xb0\xc2\x9f\xc2\xa0', '\U0001F3E0'.encode()),           # house
    (b'\xc3\xb0\xc2\x9f\xc2\xa2', '\U0001F3E2'.encode()),           # building
    (b'\xc3\xb0\xc2\x9f\xc2\x8e\xc2\xa4', '\U0001F3A4'.encode()),  # mic
    (b'\xc3\xa2\xc2\x9c\xc2\x95', '\u2715'.encode()),               # x alt
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

print('done')
