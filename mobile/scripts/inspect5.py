import re
f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\ChecklistEditor.tsx'
raw = open(f, 'rb').read()
pat = b'\xc3\xb0'
pos = 0
while True:
    idx = raw.find(pat, pos)
    if idx < 0: break
    chunk = raw[idx:idx+8]
    print('at', idx, ':', chunk.hex(), '->', repr(chunk.decode('utf-8', errors='replace')))
    pos = idx + 1
