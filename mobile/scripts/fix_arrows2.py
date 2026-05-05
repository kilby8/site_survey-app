f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\screens\NewSurveyScreen.tsx'
raw = open(f, 'rb').read()

fixes = [
    (b'\xc3\xa2\xe2\x80\xa0\xc2\x90', '\u2190'.encode()),  # left arrow
    (b'\xc3\xa2\xe2\x80\xa0\xe2\x80\x99', '\u2192'.encode()),  # right arrow
    (b'\xc3\xa2\xe2\x80\xa0', '\u2192'.encode()),  # right arrow short
]

for bad, good in fixes:
    if bad in raw:
        raw = raw.replace(bad, good)
        print('fixed:', bad.hex(), '->', good.decode('utf-8'))

open(f, 'wb').write(raw)

lines = open(f, encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if 'Back' in line and 'Text' in line and i > 1000:
        print(f'L{i+1}: {line.rstrip()}')
    if 'Next' in line and 'btnText' in line:
        print(f'L{i+1}: {line.rstrip()}')
