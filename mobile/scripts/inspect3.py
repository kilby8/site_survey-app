f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\ChecklistEditor.tsx'
raw = open(f, 'rb').read()
# Find the camera button text line
idx = raw.find(b'cameraBtnText')
chunk = raw[idx:idx+60]
print('cameraBtnText hex:', chunk.hex())
print('as utf8:', chunk.decode('utf-8', errors='replace'))

idx2 = raw.find(b'removeBtn')
chunk2 = raw[idx2:idx2+50]
print('removeBtn hex:', chunk2.hex())
print('as utf8:', chunk2.decode('utf-8', errors='replace'))
