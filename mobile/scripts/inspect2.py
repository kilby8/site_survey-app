f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\ChecklistEditor.tsx'
raw = open(f, 'rb').read()
idx = raw.find(b'Camera')
chunk = raw[idx-10:idx+8]
print('Camera hex:', chunk.hex())

idx2 = raw.find(b'Library')
chunk2 = raw[idx2-10:idx2+9]
print('Library hex:', chunk2.hex())

idx3 = raw.find(b'\xe2\x9c\x95')  # correct mult x bytes
print('correct mult x found:', idx3 >= 0)

# What are the actual bytes before Camera?
print('before Camera:', raw[idx-4:idx].hex())
