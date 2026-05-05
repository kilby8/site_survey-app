f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\ChecklistEditor.tsx'
raw = open(f, 'rb').read()

# (bad_bytes, replacement_bytes)
byte_fixes = [
    (b'\xc3\xa2\xc5\x93\xe2\x80\x9c', '\u2714'.encode()),  # checkmark
    (b'\xc3\xa2\xc5\x93\xe2\x80\x94', '\u2717'.encode()),  # ballot x
    (b'\xc3\xa2\xc5\x93\xe2\x80\x95', '\u2715'.encode()),  # mult x
    (b'\xc3\xa2\xe2\x82\xac\xe2\x80\x9c', '\u201c'.encode()), # left quote
    (b'\xc3\xa2\xe2\x82\xac\xe2\x80\x94', '\u2014'.encode()), # em dash
    (b'\xc3\xa2\xe2\x82\xac\xc2\xa6', '\u2026'.encode()),   # ellipsis
    (b'\xc3\xa2\xe2\x82\xac\xc2\xa2', '\u2022'.encode()),   # bullet
    (b'\xc3\x82\xc2\xb0', '\xc2\xb0'),                      # degree (double encoded)
    (b'\xc3\x82\xc2\xb7', '\xc2\xb7'),                      # middle dot
]

for bad, good in byte_fixes:
    if bad in raw:
        raw = raw.replace(bad, good if isinstance(good, bytes) else good)
        print('fixed:', bad.hex())

open(f, 'wb').write(raw)

lines = open(f, encoding='utf-8', errors='replace').readlines()
for i, line in enumerate(lines):
    if ('Pass' in line or 'Fail' in line or 'N/A' in line) and 'label' in line:
        print(f'L{i+1}: {line.rstrip()}')
