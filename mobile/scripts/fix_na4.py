f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\ChecklistEditor.tsx'
raw = open(f, 'rb').read()
# c3a2 e282ac e2809d = triple-encoded right double quote / em dash variant -> use en dash for N/A
raw = raw.replace(b'\xc3\xa2\xe2\x82\xac\xe2\x80\x9d', '\u2013'.encode('utf-8'))
open(f, 'wb').write(raw)
# verify
lines = open(f, encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if 'n/a' in line and 'label' in line:
        print(f'L{i+1}: {line.rstrip()}')
