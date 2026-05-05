f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\ChecklistEditor.tsx'
raw = open(f, 'rb').read()
idx = raw.find(b'n/a')
chunk = raw[idx:idx+60]
print('hex:', chunk.hex())
print('text:', chunk.decode('utf-8', errors='replace'))
