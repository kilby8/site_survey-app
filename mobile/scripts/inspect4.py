f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\ChecklistEditor.tsx'
raw = open(f, 'rb').read()
# find remaining bad emojis - search for the mojibake prefix c3b0
pos = 0
while True:
    idx = raw.find(b'\xc3\xb0', pos)
    if idx < 0: break
    chunk = raw[idx:idx+8]
    print(f'at {idx}: hex={chunk.hex()} text={chunk.decode(\"utf-8\", errors=\"replace\")}')
    pos = idx + 1
