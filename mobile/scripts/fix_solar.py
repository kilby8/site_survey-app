f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\SolarMetadataForm.tsx'
raw = open(f, 'rb').read()

fixes = [
    (b'\xc3\xb0\xc5\xb8\xc5\x92\xc2\xb1', '\U0001F331'.encode()),  # plant c3b0 c5b8 c592 c2b1
    (b'\xc3\xb0\xc5\xb8\xc2\x8f\xc2\xa0', '\U0001F3E0'.encode()),  # house c3b0 c5b8 c28f c2a0
    (b'\xc3\xb0\xc5\xb8\xc2\x8f\xc2\xa2', '\U0001F3E2'.encode()),  # building c3b0 c5b8 c28f c2a2
]

for bad, good in fixes:
    if bad in raw:
        raw = raw.replace(bad, good)
        print('fixed:', bad.hex())

open(f, 'wb').write(raw)

# verify
lines = open(f, encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if any(x in line for x in ['Ground Mount', 'Roof Mount', 'Commercial']):
        print(f'L{i+1}: {line.rstrip()}')
